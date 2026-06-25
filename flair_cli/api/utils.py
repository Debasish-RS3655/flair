import os
import httpx
from ..core.config import load_config
from ..core.session import load_session

_cfg = load_config()

def _base_url() -> str:
    """Resolve API base URL from env or config."""
    return __import__("os").environ.get("FLAIR_API_BASE") or _cfg.api_base_url or "http://localhost:2112"

def _client_with_auth() -> httpx.Client:
    """Create HTTP client with authentication headers if session token exists."""
    headers = {}
    session = load_session()
    if session and session.token:
        headers["Authorization"] = f"Bearer {session.token}"
    return httpx.Client(base_url=_base_url(), headers=headers, timeout=30)