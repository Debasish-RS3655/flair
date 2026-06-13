"""
Session management: stores session token and wallet address in a file under ~/.flair/session.json
NOTE: We never store private keys.

Session expiration is managed via expires_at timestamp. If the current time exceeds expires_at,
the session is considered invalid and the user must re-authenticate.

Debashish Buragohain
"""
from pathlib import Path
from pydantic import BaseModel
import json
from typing import Optional
from datetime import datetime, timedelta

SESSION_PATH = Path.home() / ".flair" / "session.json"

class Session(BaseModel):
    token: str
    # SSH-MIGRATION: wallet_address currently holds the authenticated Solana pubkey from
    # browser login. May be renamed (e.g. signing_identity / ssh_fingerprint) when auth
    # and commit signing move to SSH; push.py reads this as the commit principal.
    wallet_address: Optional[str]
    expires_at: Optional[str]  # ISO 8601 datetime string


def load_session() -> Optional[Session]:
    """Load session from disk. Returns None if session doesn't exist or is expired."""
    if SESSION_PATH.exists():
        try:
            data = json.loads(SESSION_PATH.read_text(encoding="utf-8"))
            session = Session(**data)
            
            # Check if session has expired
            if session.expires_at:
                expires = datetime.fromisoformat(session.expires_at)
                if datetime.utcnow() > expires:
                    # Session expired, clear it
                    clear_session()
                    return None
            
            return session
        except Exception:
            return None
    return None


def save_session(session: Session):
    """Save session to disk with expiration time."""
    SESSION_PATH.parent.mkdir(parents=True, exist_ok=True)
    SESSION_PATH.write_text(session.json(), encoding="utf-8")


def is_session_valid() -> bool:
    """Check if a valid, non-expired session exists."""
    session = load_session()
    return session is not None


def get_valid_token() -> Optional[str]:
    """Get valid token if session exists and hasn't expired. Returns None otherwise."""
    session = load_session()
    return session.token if session else None


def clear_session():
    """Delete session file."""
    if SESSION_PATH.exists():
        SESSION_PATH.unlink()
