from typing import Dict, Any
from .utils import _client_with_auth  # Import the shared helper

def create_commit(payload: Dict[str, Any]) -> Dict[str, Any]:
    with _client_with_auth() as client:
        r = client.post("/commits", json=payload)
        r.raise_for_status()
        return r.json()


def list_commits(repo_id: str) -> Dict[str, Any]:
    with _client_with_auth() as client:
        r = client.get(f"/repos/{repo_id}/commits")
        r.raise_for_status()
        return r.json()

def get_commit(repo_id: str, commit_hash: str) -> Dict[str, Any]:
    with _client_with_auth() as client:
        r = client.get(f"/repos/{repo_id}/commits/{commit_hash}")
        r.raise_for_status()
        return r.json()
