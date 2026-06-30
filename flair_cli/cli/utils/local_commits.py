from __future__ import annotations

import json
from pathlib import Path

import typer


def _get_flair_dir() -> Path:
    """Get .flair directory in current repo."""
    flair_dir = Path.cwd() / ".flair"
    if not flair_dir.exists():
        raise typer.BadParameter("Not in a Flair repository. Run 'flair init' first.")
    return flair_dir


def _get_head_info() -> dict | None:
    """Get current HEAD information from .flair/HEAD."""
    flair_dir = Path.cwd() / ".flair"
    head_file = flair_dir / "HEAD"

    if not head_file.exists():
        return None

    try:
        with open(head_file, "r") as f:
            return json.load(f)
    except Exception:
        return None


def _get_commit_by_hash(commit_hash: str) -> tuple[dict, Path] | None:
    """Get commit data and directory by hash."""
    flair_dir = Path.cwd() / ".flair"
    local_commits_dir = flair_dir / ".local_commits"

    if not local_commits_dir.exists():
        return None

    commit_dir = local_commits_dir / commit_hash
    commit_file = commit_dir / "commit.json"

    if commit_file.exists():
        with open(commit_file, "r") as f:
            return json.load(f), commit_dir

    return None


def _get_latest_local_commit() -> tuple[dict, Path] | None:
    """Get the latest local commit and its directory."""
    flair_dir = Path.cwd() / ".flair"
    local_commits_dir = flair_dir / ".local_commits"

    if not local_commits_dir.exists():
        return None

    commit_dirs = sorted(local_commits_dir.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True)

    if not commit_dirs:
        return None

    commit_dir = commit_dirs[0]
    commit_file = commit_dir / "commit.json"

    if commit_file.exists():
        with open(commit_file, "r") as f:
            return json.load(f), commit_dir

    return None


def _get_all_local_commits() -> list[tuple[dict, Path]]:
    """Get all local commits sorted by creation time (oldest first)."""
    flair_dir = Path.cwd() / ".flair"
    local_commits_dir = flair_dir / ".local_commits"

    if not local_commits_dir.exists():
        return []

    commit_dirs = sorted(local_commits_dir.iterdir(), key=lambda p: p.stat().st_mtime)

    commits: list[tuple[dict, Path]] = []
    for commit_dir in commit_dirs:
        commit_file = commit_dir / "commit.json"
        if commit_file.exists():
            try:
                with open(commit_file, "r") as f:
                    commit_data = json.load(f)
                commits.append((commit_data, commit_dir))
            except Exception:
                continue

    return commits


def _is_commit_complete(commit_data: dict, commit_dir: Path) -> bool:
    """Check if a commit is complete (has params, ZKP, and finalized message)."""
    # Check if message exists (finalized with flair commit -m)
    if not commit_data.get("message"):
        return False
    
    # Check if commitType exists (set during finalization)
    if not commit_data.get("commitType"):
        return False
    
    # Check if params exist
    params_info = commit_data.get("params")
    if not params_info or not params_info.get("file"):
        return False
    
    params_file = commit_dir / params_info["file"]
    if not params_file.exists():
        return False
    
    # Check if ZKP files exist
    zkp_info = commit_data.get("zkp")
    if not zkp_info:
        return False
    
    proof_file = commit_dir / zkp_info.get("proof_file", "proof.zlib")
    vk_file = commit_dir / zkp_info.get("verification_key_file", "verification_key.zlib")
    settings_file = commit_dir / zkp_info.get("settings_file", "settings.zlib")
    
    if not all([proof_file.exists(), vk_file.exists(), settings_file.exists()]):
        return False
    
    return True
