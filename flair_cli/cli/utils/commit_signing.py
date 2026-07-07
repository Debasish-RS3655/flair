"""
Commit signing utilities for canonical payload construction and SSH signing.

The payload canonicalization logic is shared by all signing methods.
"""
from __future__ import annotations
import base64
import hashlib
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from ...core.ssh import load_ssh_setup_metadata


@dataclass(frozen=True)
class SSHKeypair:
        private_key: Ed25519PrivateKey
        public_key_openssh: str


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


def _default_ssh_private_key_paths() -> list[Path]:
    home = Path.home()
    return [
        home / ".ssh" / "id_ed25519",
        home / ".ssh" / "id_ecdsa",
        home / ".ssh" / "id_rsa",
    ]


def _load_ssh_private_key(path: Path, passphrase: Optional[str] = None) -> Optional[Ed25519PrivateKey]:
    try:
        key_bytes = path.read_bytes()
        password_bytes = passphrase.encode("utf-8") if passphrase else None
        loaded = serialization.load_ssh_private_key(key_bytes, password=password_bytes)
        if isinstance(loaded, Ed25519PrivateKey):
            return loaded
        return None
    except Exception:
        return None


def _extract_public_key_from_private_key(private_key: Ed25519PrivateKey) -> str:
    public_key = private_key.public_key()
    raw_public_bytes = public_key.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )

    key_type = b"ssh-ed25519"
    blob = (
        len(key_type).to_bytes(4, "big") + key_type +
        len(raw_public_bytes).to_bytes(4, "big") + raw_public_bytes
    )
    return f"ssh-ed25519 {base64.b64encode(blob).decode('ascii')}"


def _compute_ssh_principal(public_key_openssh: str) -> Optional[str]:
    parts = public_key_openssh.strip().split()
    if len(parts) < 2 or parts[0] != "ssh-ed25519":
        return None

    try:
        blob = base64.b64decode(parts[1].encode("ascii"), validate=True)
    except Exception:
        return None

    fingerprint = base64.b64encode(hashlib.sha256(blob).digest()).decode("ascii").rstrip("=")
    return f"ssh:SHA256:{fingerprint}"


def get_ssh_keypair_from_file(key_path: Optional[str] = None) -> Optional[SSHKeypair]:
    """Load an SSH private key from disk and return its OpenSSH public key string."""
    search_paths: list[Path] = []

    if key_path:
        search_paths.append(Path(key_path).expanduser())

    env_path = os.getenv("FLAIR_SSH_KEY_PATH")
    if env_path:
        search_paths.append(Path(env_path).expanduser())

    setup_metadata = load_ssh_setup_metadata()
    if setup_metadata and setup_metadata.key_path:
        search_paths.append(Path(setup_metadata.key_path).expanduser())

    search_paths.extend(_default_ssh_private_key_paths())

    seen_paths: set[Path] = set()
    for path in search_paths:
        if path in seen_paths:
            continue
        seen_paths.add(path)

        if not path.exists():
            continue

        passphrase = os.getenv("FLAIR_SSH_KEY_PASSPHRASE") or os.getenv("SSH_ASKPASS_PASSWORD")
        private_key = _load_ssh_private_key(path, passphrase)
        if not private_key:
            continue

        return SSHKeypair(
            private_key=private_key,
            public_key_openssh=_extract_public_key_from_private_key(private_key),
        )

    return None


def sign_canonical_payload(payload: Dict[str, Any], keypair: SSHKeypair) -> Optional[str]:
    """Sign canonical payload using an SSH Ed25519 private key and return a hex signature."""
    try:
        canonical_json = canonicalize_payload(payload)
        signature = keypair.private_key.sign(canonical_json.encode("utf-8"))
        return signature.hex()
    except Exception:
        return None


def verify_ssh_keypair_matches_principal(keypair: SSHKeypair, principal: str) -> bool:
    """Verify the loaded SSH keypair matches the authenticated SSH principal."""
    expected_principal = _compute_ssh_principal(keypair.public_key_openssh)
    return bool(expected_principal) and expected_principal == principal
