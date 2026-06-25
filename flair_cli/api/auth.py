from typing import Dict, Any
from .utils import _base_url # Import the shared helper
import httpx

def verify_auth(wallet_address: str, siws_message: str, signature: str) -> Dict[str, Any]:
    # Note: verify_auth used a raw client in your original code, so we adapt slightly
    with httpx.Client(base_url=_base_url(), timeout=30) as client:
        r = client.post("/auth/siws", json={
            "address": wallet_address, 
            "message": siws_message, 
            "signature": signature
        })
        r.raise_for_status()
        return r.json()