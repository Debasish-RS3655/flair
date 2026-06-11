"""
Commit signing utilities for canonical payload construction and ED25519 signing.
Mirrors server-side canonical payload structure for client-side signature generation.
"""
from __future__ import annotations
import json
import hashlib
import base64
from pathlib import Path
from typing import Any, Dict, Optional
import base58

try:
    from nacl.signing import SigningKey
    import nacl.bindings
    HAS_NACL = True
except ImportError:
    HAS_NACL = False


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
        "architecture": architecture,
        "architectureHash": None,
        "commitType": commit_type,
        "message": message,
        "metrics": normalize_json_value(metrics or {}),
        "paramHash": param_hash,
        "paramsIpfsId": params_ipfs_id,
        "previousCommitHash": previous_commit_hash,
    }


def canonicalize_payload(payload: Dict[str, Any]) -> str:
    """
    Convert canonical payload to deterministic JSON string.
    Uses sorted keys and no whitespace for exact server-side matching.
    """
    normalized = normalize_json_value(payload)
    return json.dumps(normalized, separators=(",", ":"), sort_keys=True)


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


def get_solana_keypair_from_file(keypair_path: Optional[str] = None) -> Optional[bytes]:
    """
    Load Solana keypair (private key bytes) from file.
    Tries standard locations if not provided:
    - ~/.config/solana/id.json
    - SOLANA_KEYPAIR env var
    - Provided path
    
    Returns: 64-byte secret key (private + public), or None if not found
    """
    if not HAS_NACL:
        return None

    search_paths = []
    
    if keypair_path:
        search_paths.append(Path(keypair_path))
    
    home = Path.home()
    search_paths.append(home / ".config" / "solana" / "id.json")
    
    import os
    env_path = os.getenv("SOLANA_KEYPAIR")
    if env_path:
        search_paths.append(Path(env_path))
    
    for path in search_paths:
        if path.exists():
            try:
                with open(path, "r") as f:
                    keypair_data = json.load(f)
                
                if isinstance(keypair_data, list):
                    # Solana keypair format is [u8; 64]
                    secret_key_bytes = bytes(keypair_data)
                    if len(secret_key_bytes) == 64:
                        return secret_key_bytes
            except Exception as e:
                continue
    
    return None


def sign_canonical_payload(
    payload: Dict[str, Any],
    secret_key_bytes: bytes
) -> Optional[str]:
    """
    Sign canonical payload using Solana ED25519 private key.
    
    Args:
        payload: Canonical commit payload
        secret_key_bytes: 64-byte Solana keypair (private + public)
    
    Returns: Hex-encoded signature, or None on error
    """
    if not HAS_NACL:
        return None
    
    try:
        canonical_json = canonicalize_payload(payload)
        payload_bytes = canonical_json.encode("utf-8")
        
        # Extract private key (first 32 bytes of Solana keypair)
        signing_key = SigningKey(secret_key_bytes[:32])
        
        # Sign using detached signature (no message prepended)
        signature = nacl.bindings.crypto_sign_detached(payload_bytes, bytes(signing_key))
        
        # Return as hex string
        return signature.hex()
    except Exception as e:
        return None


def verify_keypair_matches_address(secret_key_bytes: bytes, solana_address: str) -> bool:
    """
    Verify that the given keypair's public key matches the Solana address.
    Helps catch keypair mismatch errors early.
    """
    if not HAS_NACL:
        return False
    
    try:
        # Extract private key and get public key
        signing_key = SigningKey(secret_key_bytes[:32])
        public_key_bytes = bytes(signing_key.verify_key)
        
        # Encode as base58
        public_key_b58 = base58.encode(public_key_bytes).decode("utf-8")
        
        return public_key_b58 == solana_address
    except Exception as e:
        return False
