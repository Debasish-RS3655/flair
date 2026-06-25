"""
Commit signing utilities for canonical payload construction and client-side signing using SSH.
"""
from __future__ import annotations
import json
import hashlib
import base64
from pathlib import Path
from typing import Any, Dict, Optional


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
    Uses exact insertion order from build_canonical_payload and no whitespace.
    """
    return json.dumps(payload, separators=(",", ":"))


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


def get_ssh_key_path(key_path: Optional[str] = None) -> Optional[str]:
    """
    Locate SSH private key path.
    Precedence:
    1. Provided key_path
    2. FLAIR_SSH_KEY env var
    3. Standard SSH locations:
       - ~/.ssh/id_ed25519
       - ~/.ssh/id_rsa
       - ~/.ssh/id_ecdsa
    """
    if key_path:
        path = Path(key_path)
        if path.exists():
            return str(path.resolve())
            
    import os
    env_path = os.getenv("FLAIR_SSH_KEY")
    if env_path:
        path = Path(env_path)
        if path.exists():
            return str(path.resolve())
            
    home = Path.home()
    standard_paths = [
        home / ".ssh" / "id_ed25519",
        home / ".ssh" / "id_rsa",
        home / ".ssh" / "id_ecdsa",
    ]
    for path in standard_paths:
        if path.exists():
            return str(path.resolve())
            
    return None


def get_ssh_key_fingerprint(key_path: str) -> Optional[str]:
    """
    Get the SSH key fingerprint in format "SHA256:<hash>".
    Calls `ssh-keygen -lf <key_path>`.
    """
    import subprocess
    try:
        res = subprocess.run(
            ["ssh-keygen", "-lf", key_path],
            capture_output=True,
            text=True,
            check=True
        )
        parts = res.stdout.strip().split()
        if len(parts) >= 2:
            return parts[1]  # E.g. "SHA256:..."
    except Exception:
        pass
    return None


def sign_canonical_payload(
    payload: Dict[str, Any],
    key_path: str
) -> Optional[str]:
    """
    Sign canonical payload using SSH private key.
    Writes payload to a temp file, signs it with `ssh-keygen -Y sign`,
    reads the armored signature block from the generated .sig file,
    and cleans up the temp files.
    """
    import subprocess
    import tempfile
    import os
    
    canonical_json = canonicalize_payload(payload)
    
    temp_payload_fd, temp_payload_path = tempfile.mkstemp()
    try:
        with os.fdopen(temp_payload_fd, 'wb') as f:
            f.write(canonical_json.encode('utf-8'))
            
        sig_path = temp_payload_path + ".sig"
        if os.path.exists(sig_path):
            os.remove(sig_path)
            
        subprocess.run(
            ["ssh-keygen", "-Y", "sign", "-f", key_path, "-n", "flair", temp_payload_path],
            check=True,
            capture_output=True
        )
        
        if os.path.exists(sig_path):
            with open(sig_path, 'r', encoding='utf-8') as f:
                sig_content = f.read()
            try:
                os.remove(sig_path)
            except Exception:
                pass
            return sig_content
    except Exception:
        pass
    finally:
        try:
            os.remove(temp_payload_path)
        except Exception:
            pass
            
    return None


def verify_ssh_key_matches_identity(key_path: str, expected_identity: str) -> bool:
    """
    Verify that the given key's fingerprint matches the expected identity (fingerprint).
    If expected_identity is not an SSH fingerprint (e.g. during transition from Solana address),
    returns True to allow migration.
    """
    if not expected_identity:
        return False
    if not expected_identity.startswith("SHA256:"):
        return True
    fingerprint = get_ssh_key_fingerprint(key_path)
    return fingerprint == expected_identity
