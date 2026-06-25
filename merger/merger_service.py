"""
Commit-based merger service for Flair.

- Reads plain commits from repository_manager commit endpoints.
- Aggregates model parameters with Flower FedAvg (using AsyncFederatedNode._aggregate).
- Creates a new merge commit via the existing commit creation pipeline.
- Uploads aggregated params/metrics to the shared-folder endpoints (ephemeral) for the merger wallet.

Assumptions (all satisfied by existing code):
- Routes mounted at /repo/hash/<repoHash>/branch/hash/<branchHash>/commit/...
- Shared folder routes mounted at /repo/hash/<repoHash>/branch/hash/<branchHash>/commit/sharedFolder/...
- Commit controller implements the initiate → zkml-check → zkml-upload → params-upload → finalize flow.
- Params blobs are consistent across commits (same architecture hash, same tensor shapes).
- Models are stored as pickled ndarrays or torch state_dict; anything else is rejected.

Environment/config expected (pass via CLI or env):
- FLAIR_BASE_URL
- FLAIR_REPO_HASH
- FLAIR_BRANCH_HASH
- FLAIR_WALLET (merger wallet / committerAddress)
- FLAIR_AUTH_TOKEN (Bearer ...)
- MIN_CHILD_COMMITS (default 2)
- POLL_INTERVAL_SEC (default 30)
- ZK_PROOF_CID / ZK_SETTINGS_CID / ZK_VK_CID (for checkZKMLProof)
- ZK_PROOF_PATH / ZK_SETTINGS_PATH / ZK_VK_PATH (for uploadZKMLProofs)

This service is intentionally headless (no SDK) and uses only the existing HTTP endpoints.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import pickle
import time
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import numpy as np
import requests
from flwr.common import ndarrays_to_parameters, parameters_to_ndarrays
from flwr.server.strategy import FedAvg
from flwr_serverless.federated_node.aggregatable import Aggregatable
from flwr_serverless.federated_node.async_federated_node import AsyncFederatedNode
from flwr_serverless.shared_folder.base_folder import SharedFolder

try:
    import torch  # Optional, for torch state_dict inputs
except Exception:  # pragma: no cover - torch is optional
    torch = None

LOGGER = logging.getLogger("flair.merger")
logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s %(message)s")


class InMemoryFolder(SharedFolder):
    """Minimal SharedFolder impl so AsyncFederatedNode can run _aggregate."""

    def __init__(self) -> None:
        self._store: Dict[str, bytes] = {}

    def get(self, key, default=None):
        return self._store.get(key, default)

    def __getitem__(self, key):
        return self._store[key]

    def __setitem__(self, key, value):
        self._store[key] = value

    def __len__(self):
        return len(self._store)

    def items(self):
        return self._store.items()


@dataclass
class CommitInfo:
    commit_hash: str
    parent_hash: str
    params_uri: str
    architecture: str
    num_examples: int
    committer: str
    metrics: Dict[str, float]


class FlairMerger:
    def __init__(
        self,
        base_url: str,
        repo_hash: str,
        branch_hash: str,
        wallet: str,
        auth_token: str,
        min_children: int = 2,
        poll_interval: int = 30,
    ) -> None:
        self.base_commit = f"{base_url}/repo/hash/{repo_hash}/branch/hash/{branch_hash}/commit"
        self.base_shared = f"{self.base_commit}/sharedFolder"
        self.wallet = wallet
        self.session = requests.Session()
        self.session.headers.update({"Authorization": auth_token})
        self.min_children = min_children
        self.poll_interval = poll_interval
        self.strategy = FedAvg()
        self._agg_node = AsyncFederatedNode(shared_folder=InMemoryFolder(), strategy=self.strategy, node_id="MERGER")

    # -------- Fetch commits ---------
    def fetch_commits(self) -> List[dict]:
        resp = self.session.get(f"{self.base_commit}/")
        resp.raise_for_status()
        return resp.json().get("data", [])

    def fetch_commit_detail(self, commit_hash: str) -> dict:
        resp = self.session.get(f"{self.base_commit}/hash/{commit_hash}/pull")
        resp.raise_for_status()
        return resp.json()["data"]

    # -------- Download & decode params ---------
    def _download_params_blob(self, uri: str) -> bytes:
        r = requests.get(uri, stream=True)
        r.raise_for_status()
        return r.content

    def _decode_ndarrays(self, blob: bytes) -> List[np.ndarray]:
        """Accepts pickled ndarray list or torch state_dict. Reject otherwise."""
        try:
            obj = pickle.loads(blob)
            if isinstance(obj, (list, tuple)) and all(hasattr(x, "shape") for x in obj):
                return [np.array(x) for x in obj]
            if torch and isinstance(obj, dict) and all(hasattr(v, "shape") for v in obj.values()):
                # deterministic order by key
                return [v.detach().cpu().numpy() for k, v in sorted(obj.items())]
        except Exception:
            pass
        raise ValueError("Unsupported parameter format; expected pickled ndarrays or torch state_dict")

    # -------- Aggregation ---------
    def _aggregate(self, models: List[Tuple[List[np.ndarray], int]]) -> Tuple[List[np.ndarray], dict]:
        aggregatables: List[Aggregatable] = []
        for nds, num_ex in models:
            params = ndarrays_to_parameters(nds)
            aggregatables.append(Aggregatable(parameters=params, num_examples=num_ex, metrics={"num_examples": num_ex}))
        updated = self._agg_node._aggregate(aggregatables)  # type: ignore[protected-access]
        nds = parameters_to_ndarrays(updated.parameters)
        return nds, updated.metrics or {}

    # -------- Shared folder helpers (for merger wallet) ---------
    def _upload_model_to_shared(self, model_bytes: bytes) -> None:
        # /files/:committerAddress expects raw body
        resp = self.session.put(
            f"{self.base_shared}/files/{self.wallet}", data=model_bytes, headers={"Content-Type": "application/octet-stream"}
        )
        resp.raise_for_status()

    def _upload_metrics_after(self, metrics: dict) -> None:
        # metrics_after_aggregation_00000.json
        key = "metrics_after_aggregation_00000.json"
        payload = json.dumps(metrics).encode("utf-8")
        resp = self.session.put(
            f"{self.base_shared}/files/keras/{self.wallet}/{key}", data=payload, headers={"Content-Type": "application/octet-stream"}
        )
        resp.raise_for_status()

    # -------- Commit creation pipeline ---------
    def _initiate(self, parent_hash: str) -> Tuple[str, str]:
        r = self.session.post(f"{self.base_commit}/create/initiate", json={"parentCommitHash": parent_hash})
        r.raise_for_status()
        data = r.json()
        return data["sessionId"], data["initiateToken"]

    def _zkml_check(self, session_id: str, initiate_token: str) -> str:
        proof_cid = os.environ["ZK_PROOF_CID"]
        settings_cid = os.environ["ZK_SETTINGS_CID"]
        vk_cid = os.environ["ZK_VK_CID"]
        r = self.session.post(
            f"{self.base_commit}/create/zkml-check",
            json={
                "sessionId": session_id,
                "initiateToken": initiate_token,
                "proofCid": proof_cid,
                "settingsCid": settings_cid,
                "vkCid": vk_cid,
            },
        )
        r.raise_for_status()
        return r.json()["zkmlToken"]

    def _zkml_upload(self, session_id: str, initiate_token: str, zkml_token: str) -> str:
        def _load(path_env: str) -> str:
            path = os.environ[path_env]
            with open(path, "r", encoding="utf-8") as f:
                return f.read()

        payload = {
            "sessionId": session_id,
            "initiateToken": initiate_token,
            "zkmlToken": zkml_token,
            "proof": _load("ZK_PROOF_PATH"),
            "settings": _load("ZK_SETTINGS_PATH"),
            "verification_key": _load("ZK_VK_PATH"),
        }
        r = self.session.post(f"{self.base_commit}/create/zkml-upload", json=payload)
        r.raise_for_status()
        return r.json()["zkmlReceiptToken"]

    def _upload_params(self, session_id: str, initiate_token: str, zkml_receipt: str, params_bytes: bytes, file_ext: str = "bin") -> Tuple[str, str]:
        files = {"file": (f"params.{file_ext}", params_bytes, "application/octet-stream")}
        data = {"sessionId": session_id, "initiateToken": initiate_token, "zkmlReceiptToken": zkml_receipt}
        r = self.session.post(f"{self.base_commit}/create/params-upload", files=files, data=data)
        r.raise_for_status()
        body = r.json()
        return body["paramsReceiptToken"], body["paramsCid"]

    def _finalize(self, initiate_token: str, zkml_receipt: str, params_receipt: str, param_hash: str, architecture: str, message: str) -> str:
        payload = {
            "message": message,
            "paramHash": param_hash,
            "architecture": architecture,
            "initiateToken": initiate_token,
            "zkmlReceiptToken": zkml_receipt,
            "paramsReceiptToken": params_receipt,
        }
        r = self.session.post(f"{self.base_commit}/create/finalize", json=payload)
        r.raise_for_status()
        return r.json()["data"]["commitHash"]

    # -------- Merge loop ---------
    def _select_groups(self, commits: List[dict]) -> Dict[str, List[CommitInfo]]:
        groups: Dict[str, List[CommitInfo]] = {}
        for c in commits:
            # Skip commits authored by merger wallet to avoid re-merging
            if c.get("committerAddress") == self.wallet:
                continue
            parent = c.get("previousCommitHash") or ""
            params_uri = c.get("params", {}).get("ipfsObject", {}).get("uri")
            architecture = c.get("architecture") or ""
            metrics = c.get("metrics") or {}
            num_examples = int(metrics.get("num_examples") or metrics.get("samples") or 1)
            if not params_uri or not architecture:
                continue
            info = CommitInfo(
                commit_hash=c["commitHash"],
                parent_hash=parent,
                params_uri=params_uri,
                architecture=architecture,
                num_examples=num_examples,
                committer=c.get("committerAddress", ""),
                metrics=metrics,
            )
            groups.setdefault(parent, []).append(info)
        return {p: lst for p, lst in groups.items() if len(lst) >= self.min_children}

    def _build_models(self, commits: List[CommitInfo]) -> Tuple[List[Tuple[List[np.ndarray], int]], str]:
        arch = commits[0].architecture
        models: List[Tuple[List[np.ndarray], int]] = []
        for c in commits:
            if c.architecture != arch:
                raise ValueError("Architecture mismatch within group; skipping merge")
            blob = self._download_params_blob(c.params_uri)
            nds = self._decode_ndarrays(blob)
            models.append((nds, c.num_examples))
        return models, arch

    def _hash_params(self, nds: List[np.ndarray]) -> str:
        h = hashlib.sha256()
        for arr in nds:
            h.update(arr.tobytes())
        return h.hexdigest()

    def run_once(self) -> None:
        commits = self.fetch_commits()
        groups = self._select_groups(commits)
        if not groups:
            LOGGER.info("No mergeable groups found")
            return

        for parent_hash, children in groups.items():
            LOGGER.info("Merging %d commits with parent %s", len(children), parent_hash)
            try:
                models, architecture = self._build_models(children)
                agg_nds, agg_metrics = self._aggregate(models)
                agg_blob = pickle.dumps(agg_nds)
                param_hash = self._hash_params(agg_nds)

                # Upload ephemeral shared-folder artifacts for merger wallet
                self._upload_model_to_shared(agg_blob)
                self._upload_metrics_after(agg_metrics or {"num_examples": sum(n for _, n in models)})

                # Commit creation pipeline
                session_id, init_tok = self._initiate(parent_hash)
                zkml_tok = self._zkml_check(session_id, init_tok)
                zkml_receipt = self._zkml_upload(session_id, init_tok, zkml_tok)
                params_receipt, _ = self._upload_params(session_id, init_tok, zkml_receipt, agg_blob)
                commit_hash = self._finalize(
                    initiate_token=init_tok,
                    zkml_receipt=zkml_receipt,
                    params_receipt=params_receipt,
                    param_hash=param_hash,
                    architecture=architecture,
                    message=f"Merged {len(children)} commits from parent {parent_hash}",
                )
                LOGGER.info("Created merge commit %s", commit_hash)
            except Exception as exc:  # pragma: no cover - runtime protection
                LOGGER.exception("Failed to merge group parent=%s: %s", parent_hash, exc)

    def loop_forever(self) -> None:
        while True:
            self.run_once()
            time.sleep(self.poll_interval)


def _env(name: str, default: Optional[str] = None) -> str:
    val = os.environ.get(name, default)
    if val is None:
        raise RuntimeError(f"Missing required env var {name}")
    return val


def main() -> None:
    base_url = _env("FLAIR_BASE_URL")
    repo_hash = _env("FLAIR_REPO_HASH")
    branch_hash = _env("FLAIR_BRANCH_HASH")
    wallet = _env("FLAIR_WALLET")
    auth_token = _env("FLAIR_AUTH_TOKEN")
    min_children = int(os.environ.get("MIN_CHILD_COMMITS", "2"))
    poll_interval = int(os.environ.get("POLL_INTERVAL_SEC", "30"))

    merger = FlairMerger(
        base_url=base_url,
        repo_hash=repo_hash,
        branch_hash=branch_hash,
        wallet=wallet,
        auth_token=auth_token,
        min_children=min_children,
        poll_interval=poll_interval,
    )
    merger.loop_forever()


if __name__ == "__main__":
    main()
