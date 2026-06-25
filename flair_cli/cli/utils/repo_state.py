from __future__ import annotations

import json

from .local_commits import _get_flair_dir


def _short_hash(commit_hash: str | None) -> str:
    if not commit_hash:
        return "none"
    if commit_hash == "_GENESIS_COMMIT_":
        return "_GENESIS_COMMIT_"
    return f"{commit_hash[:8]}..."


def _load_repo_hash() -> str | None:
    flair_dir = _get_flair_dir()
    repo_file = flair_dir / "repo.json"
    if not repo_file.exists():
        return None

    try:
        with open(repo_file, "r") as f:
            repo_data = json.load(f)
        return repo_data.get("repoHash") or repo_data.get("hash") or repo_data.get("metadata", {}).get("repoHash")
    except Exception:
        return None
