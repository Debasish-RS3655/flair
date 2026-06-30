"""
Merge command: Build local merge candidates from commits since last merge cursor.

This command is commit-lineage based (not wall-clock based): it groups sibling commits
sharing the same previousCommitHash and validates architecture + class-space compatibility
before building a local FedAvg candidate artifact.
"""
from __future__ import annotations

import json
import os
import shutil
from pathlib import Path
from typing import Any, List, Tuple, Dict
from uuid import uuid4

import numpy as np
import typer
from rich.console import Console

from flwr.common import ndarrays_to_parameters, parameters_to_ndarrays
from flwr.server.strategy import FedAvg
from flwr_serverless import AsyncFederatedNode, LocalFolder
from flwr_serverless.federated_node.aggregatable import Aggregatable

from .utils.local_commits import _get_all_local_commits, _is_commit_complete
from .utils.reconstruction import _reconstruct_params_from_checkpoint

app = typer.Typer(help="Create lineage-based merge candidates")
console = Console()


def _is_merge_eligible_commit(commit_data: dict[str, Any], commit_dir: Path) -> bool:
    if not _is_commit_complete(commit_data, commit_dir):
        return False

    if not commit_data.get("message"):
        return False

    if commit_data.get("commitType") in {"CHECKPOINT"}:
        return False

    params_info = commit_data.get("params")
    if not isinstance(params_info, dict) or not params_info.get("file"):
        return False

    params_file = commit_dir / params_info["file"]
    return params_file.exists()


def _find_last_merge_cursor(commits: list[tuple[dict[str, Any], Path]]) -> str:
    for commit_data, _ in reversed(commits):
        if commit_data.get("commitType") == "CHECKPOINT" and commit_data.get("status") == "MERGER":
            return commit_data.get("commitHash") or "_GENESIS_COMMIT_"
    return "_GENESIS_COMMIT_"


def _slice_after_cursor(commits: list[tuple[dict[str, Any], Path]], cursor: str) -> list[tuple[dict[str, Any], Path]]:
    if cursor == "_GENESIS_COMMIT_":
        return commits

    for idx, (commit_data, _) in enumerate(commits):
        if commit_data.get("commitHash") == cursor:
            return commits[idx + 1 :]

    return commits


def _group_by_parent(commits: list[tuple[dict[str, Any], Path]]) -> dict[str, list[tuple[dict[str, Any], Path]]]:
    groups: dict[str, list[tuple[dict[str, Any], Path]]] = {}
    for item in commits:
        commit_data, _ = item
        parent = commit_data.get("previousCommitHash")
        if not parent:
            continue
        groups.setdefault(parent, []).append(item)
    return groups


def _group_compatibility_report(group: list[tuple[dict[str, Any], Path]]) -> tuple[bool, str]:
    first, _ = group[0]
    expected_arch = first.get("architectureHash")
    expected_class_hash = first.get("classSpaceHash")

    for commit_data, _ in group[1:]:
        if commit_data.get("architectureHash") != expected_arch:
            return False, "architectureHash mismatch"
        if commit_data.get("classSpaceHash") != expected_class_hash:
            return False, "classSpaceHash mismatch"

    if not expected_arch:
        return False, "missing architectureHash metadata"
    if not expected_class_hash:
        return False, "missing classSpaceHash metadata"

    return True, "compatible"


def _to_numpy(value: Any) -> np.ndarray:
    if isinstance(value, np.ndarray):
        return value

    if hasattr(value, "detach") and callable(getattr(value, "detach")):
        return value.detach().cpu().numpy()

    return np.asarray(value)


def _aggregate_with_flwr_node(models: list[dict[str, np.ndarray]], weights: list[float], temp_dir: Path) -> dict[str, np.ndarray]:
    """
    Uses flwr_serverless AsyncFederatedNode with LocalFolder to perform FedAvg.
    """
    if not models:
        raise ValueError("No models supplied for aggregation")

    keys = list(models[0].keys())
    for model in models[1:]:
        if list(model.keys()) != keys:
            raise ValueError("Parameter key mismatch across commits")

    total_weight = float(sum(weights))
    if total_weight <= 0:
        raise ValueError("Invalid aggregation weights")

    # Initialize LocalFolder and Node
    shared_folder = LocalFolder(directory=str(temp_dir))
    strategy = FedAvg()
    node = AsyncFederatedNode(strategy=strategy, shared_folder=shared_folder, node_id="LOCAL_MERGE_NODE")

    aggregatables: List[Aggregatable] = []
    
    # Construct Aggregatables by converting ordered dicts to flat ndarrays list
    for model, weight in zip(models, weights):
        # Enforce deterministic order of parameter keys
        nds = [model[k] for k in keys]
        params = ndarrays_to_parameters(nds)
        # weight represents num_examples
        aggregatables.append(Aggregatable(parameters=params, num_examples=int(weight), metrics={"num_examples": int(weight)}))
        
    # Trigger aggregation synchronously
    updated = node._aggregate(aggregatables)
    
    # Extract ndarrays back to dict mapping
    updated_nds = parameters_to_ndarrays(updated.parameters)
    result = {k: arr for k, arr in zip(keys, updated_nds)}
    
    return result


def _save_aggregated_params(framework: str, params: dict[str, np.ndarray], output_path: Path) -> str:
    if framework == "pytorch":
        try:
            import torch
        except ImportError:
            raise RuntimeError("PyTorch is not installed but framework is 'pytorch'.")

        state_dict = {name: torch.from_numpy(value) for name, value in params.items()}
        torch.save(state_dict, output_path)
        return output_path.name

    np.savez(output_path.with_suffix(".npz"), **params)
    return output_path.with_suffix(".npz").name


@app.command("create")
def create_merge_candidate(
    min_children: int = typer.Option(2, "--min-children", help="Minimum sibling commits required to aggregate"),
    strategy: str = typer.Option("fedavg", "--strategy", help="Merge strategy (v1 supports fedavg)"),
    since_commit: str = typer.Option(None, "--since-commit", help="Optional cursor override commit hash"),
):
    """Create a local merge candidate from sibling commits since the last merge cursor."""
    temp_dir = None
    try:
        if strategy.lower() != "fedavg":
            console.print("[red]Only 'fedavg' strategy is supported in v1.[/red]")
            raise typer.Exit(code=1)

        flair_dir = Path.cwd() / ".flair"
        if not flair_dir.exists():
            console.print("[red]Not in a Flair repository. Run 'flair init' first.[/red]")
            raise typer.Exit(code=1)

        all_local_commits = _get_all_local_commits()
        if not all_local_commits:
            console.print("[yellow]No local commits available for merge.[/yellow]")
            raise typer.Exit(code=0)

        cursor = since_commit or _find_last_merge_cursor(all_local_commits)
        candidate_window = _slice_after_cursor(all_local_commits, cursor)

        eligible = [
            (commit_data, commit_dir)
            for commit_data, commit_dir in candidate_window
            if _is_merge_eligible_commit(commit_data, commit_dir)
        ]

        if not eligible:
            console.print("[yellow]No eligible finalized commits found after merge cursor.[/yellow]")
            console.print(f"[dim]Cursor: {cursor[:16] if cursor != '_GENESIS_COMMIT_' else 'Genesis'}...[/dim]")
            raise typer.Exit(code=0)

        grouped = _group_by_parent(eligible)
        target_parent = None
        target_group = None

        for parent_hash, group in grouped.items():
            if parent_hash == cursor and len(group) >= min_children:
                compatible, reason = _group_compatibility_report(group)
                if compatible:
                    target_parent = parent_hash
                    target_group = group
                    break
                console.print(f"[yellow]Skipping sibling group @ {parent_hash[:16]}...: {reason}[/yellow]")

        if target_group is None:
            console.print("[yellow]No mergeable sibling group found from the current merge cursor.[/yellow]")
            raise typer.Exit(code=0)

        models: list[dict[str, Any]] = []
        weights: list[float] = []
        parent_hashes: list[str] = []

        framework = target_group[0][0].get("params", {}).get("framework", "numpy").lower()

        for commit_data, _ in target_group:
            commit_hash = commit_data.get("commitHash")
            if not commit_hash:
                continue

            params = _reconstruct_params_from_checkpoint(
                commit_hash,
                framework,
                info=lambda _: None,
                warn=lambda _: None,
            )
            if params is None:
                raise ValueError(f"Failed to reconstruct params for {commit_hash}")

            # Ensure params are numpy arrays
            params = {k: _to_numpy(v) for k, v in params.items()}

            models.append(params)
            parent_hashes.append(commit_hash)

            num_examples = None
            metrics = commit_data.get("metrics")
            if isinstance(metrics, dict):
                num_examples = metrics.get("num_examples") or metrics.get("samples")
            weights.append(float(num_examples) if isinstance(num_examples, (int, float)) and num_examples > 0 else 1.0)

        # Setup temp folder for LocalFolder node
        temp_dir = flair_dir / ".temp_merge"
        if temp_dir.exists():
            shutil.rmtree(temp_dir)
        temp_dir.mkdir(parents=True, exist_ok=True)

        # Aggregate using flwr_serverless
        aggregated = _aggregate_with_flwr_node(models, weights, temp_dir)

        candidate_hash = str(uuid4())
        candidate_dir = flair_dir / ".merge_candidates" / candidate_hash
        candidate_dir.mkdir(parents=True, exist_ok=True)

        params_filename = "params.pt" if framework == "pytorch" else "params.npz"
        params_path = candidate_dir / params_filename
        saved_params_name = _save_aggregated_params(framework, aggregated, params_path)

        class_space = target_group[0][0].get("classSpace")
        class_space_hash = target_group[0][0].get("classSpaceHash")
        architecture_hash = target_group[0][0].get("architectureHash")

        candidate = {
            "mergeCandidateHash": candidate_hash,
            "commitType": "CHECKPOINT",
            "status": "MERGER",
            "mergeStrategy": "fedavg",
            "mergeParent": target_parent,
            "mergeParents": parent_hashes,
            "architectureHash": architecture_hash,
            "classSpace": class_space,
            "classSpaceHash": class_space_hash,
            "params": {
                "file": saved_params_name,
                "framework": framework,
                "source": "local-fedavg",
            },
            "metrics": {
                "num_examples": int(sum(weights))
            }
        }

        with open(candidate_dir / "merge_candidate.json", "w", encoding="utf-8") as f:
            json.dump(candidate, f, indent=2)

        console.print("[green]✓ Local merge candidate created[/green]")
        console.print(f"  Candidate: {candidate_hash[:16]}...")
        console.print(f"  Parent cursor: {target_parent[:16]}...")
        console.print(f"  Aggregated commits: {len(parent_hashes)}")
        console.print(f"  Params file: {saved_params_name}")
        console.print("[dim]Stored under .flair/.merge_candidates/[/dim]")
        console.print("[dim]Run 'flair add' and 'flair commit' to formalize this candidate.[/dim]")

    except typer.Exit:
        raise
    except Exception as e:
        console.print(f"[red]✗ Failed to create merge candidate: {e}[/red]")
        raise typer.Exit(code=1)
    finally:
        # Cleanup temp directory
        if temp_dir and temp_dir.exists():
            shutil.rmtree(temp_dir)
