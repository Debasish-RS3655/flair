"""
Commit signing utilities for canonical payload construction and SSH signing.

The payload canonicalization logic is shared by all signing methods.
"""
from __future__ import annotations
import base64
import hashlib
import json
from dataclasses import dataclass
from typing import Any, Dict, Optional, Sequence

from paramiko.agent import Agent
from paramiko.message import Message


@dataclass(frozen=True)
class SSHAgentIdentity:
    agent_key: Any
    public_key_openssh: str
    fingerprint: str


def normalize_json_value(value: Any) -> Any:
    """Recursively normalize JSON value with sorted keys for canonicalization."""
    if isinstance(value, dict):
        return {k: normalize_json_value(value[k]) for k in sorted(value.keys())}
    elif isinstance(value, list):
        return [normalize_json_value(item) for item in value]
    else:
        return value


def build_canonical_payload(
    session_jti: str,
    signed_at: str,
    params_ipfs_id: str,
    param_hash: str,
    previous_commit_hash: str,
    architecture: str,
    commit_type: str,
    message: str,
    metrics: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Build canonical commit payload with deterministic field order.
    Must match server-side CanonicalCommitPayload exactly.
    """
    return {
        "sessionJti": session_jti,
        "signedAt": signed_at,
        "paramsIpfsId": params_ipfs_id,
        "paramHash": param_hash,
        "previousCommitHash": previous_commit_hash,
        "architecture": architecture,
        "architectureHash": None,
        "commitType": commit_type,
        "message": message,
        "metrics": normalize_json_value(metrics or {}),
    }


def canonicalize_payload(payload: Dict[str, Any]) -> str:
    """
    Convert canonical payload to deterministic JSON string.
    Uses the payload's explicit field order and no whitespace for exact server-side matching.

    SSH-MIGRATION: keep this byte order aligned with server canonicalization
    so SSH and Solana signers hash/sign identical bytes.
    """
    payload_to_serialize = dict(payload)
    if "metrics" in payload_to_serialize:
        payload_to_serialize["metrics"] = normalize_json_value(payload_to_serialize["metrics"])
    return json.dumps(payload_to_serialize, separators=(",", ":"), sort_keys=False)


def compute_payload_hash(payload: Dict[str, Any]) -> str:
    """Compute SHA256 hash of canonical payload."""
    canonical_json = canonicalize_payload(payload)
    hash_obj = hashlib.sha256(canonical_json.encode("utf-8"))
    return hash_obj.hexdigest()


def extract_jti_from_jwt(token: str) -> Optional[str]:
    """Extract the session jti from a JWT without verifying its signature."""
    try:
        parts = token.split('.')
        if len(parts) != 3:
            return None

        payload_segment = parts[1]
        padding = '=' * (-len(payload_segment) % 4)
        payload_bytes = base64.urlsafe_b64decode(payload_segment + padding)
        payload = json.loads(payload_bytes.decode('utf-8'))
        jti = payload.get('jti')
        return jti if isinstance(jti, str) and jti else None
    except Exception:
        return None


def _normalize_public_key_blob(public_key_blob: bytes) -> str:
    return f"ssh-ed25519 {base64.b64encode(public_key_blob).decode('ascii')}"


def _compute_fingerprint_from_blob(public_key_blob: bytes) -> str:
    fingerprint = base64.b64encode(hashlib.sha256(public_key_blob).digest()).decode("ascii").rstrip("=")
    return f"ssh:SHA256:{fingerprint}"


def _key_blob_from_ssh_message(message: Message) -> bytes:
    parsed = Message(message.asbytes())
    _ = parsed.get_text()
    return parsed.get_string()


def load_ssh_agent_identities() -> list[SSHAgentIdentity]:
    """Load all keys currently available through ssh-agent."""
    identities: list[SSHAgentIdentity] = []
    try:
        agent = Agent()
        for agent_key in agent.get_keys():
            public_blob = agent_key.asbytes()
            public_key_openssh = _normalize_public_key_blob(public_blob)
            fingerprint = _compute_fingerprint_from_blob(public_blob)
            identities.append(
                SSHAgentIdentity(
                    agent_key=agent_key,
                    public_key_openssh=public_key_openssh,
                    fingerprint=fingerprint,
                )
            )
    except Exception:
        return []

    return identities


def sign_canonical_payload(payload: Dict[str, Any], identity: SSHAgentIdentity) -> Optional[str]:
    """Sign canonical payload using ssh-agent and return a hex signature."""
    try:
        canonical_json = canonicalize_payload(payload)
        signature_message = identity.agent_key.sign_ssh_data(canonical_json.encode("utf-8"))
        signature_blob = _key_blob_from_ssh_message(signature_message)
        return signature_blob.hex()
    except Exception:
        return None


def find_agent_identity_by_fingerprint(fingerprint: str, identities: Optional[Sequence[SSHAgentIdentity]] = None) -> Optional[SSHAgentIdentity]:
    candidate_identities = list(identities) if identities is not None else load_ssh_agent_identities()
    for identity in candidate_identities:
        if identity.fingerprint == fingerprint:
            return identity
    return None


def verify_ssh_identity_matches_fingerprint(identity: SSHAgentIdentity, fingerprint: str) -> bool:
    """Verify the loaded ssh-agent identity matches a registered SSH fingerprint."""
    return identity.fingerprint == fingerprint
