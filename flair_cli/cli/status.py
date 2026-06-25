"""Status command: show local repository and commit synchronization state."""

from __future__ import annotations

from pathlib import Path

import httpx
import typer
from rich.console import Console

from ..api import client as api_client
from ..api.utils import _base_url, _client_with_auth
from .utils.local_commits import _get_all_local_commits, _get_flair_dir, _get_head_info, _get_latest_local_commit
from .utils.repo_state import _load_repo_hash, _short_hash

console = Console()


def _is_params_present(commit_data: dict, commit_dir: Path) -> bool:
    params_info = commit_data.get("params")
    if not params_info or not params_info.get("file"):
        return False
    return (commit_dir / params_info["file"]).exists()


def _is_zkp_present(commit_data: dict, commit_dir: Path) -> bool:
    zkp_info = commit_data.get("zkp")
    if not zkp_info:
        return False

    proof_file = commit_dir / zkp_info.get("proof_file", "proof.zlib")
    vk_file = commit_dir / zkp_info.get("verification_key_file", "verification_key.zlib")
    settings_file = commit_dir / zkp_info.get("settings_file", "settings.zlib")
    return all([proof_file.exists(), vk_file.exists(), settings_file.exists()])


def _is_message_present(commit_data: dict) -> bool:
    return bool(commit_data.get("message"))


def _is_commit_complete(commit_data: dict, commit_dir: Path) -> bool:
    return (
        bool(commit_data.get("commitType"))
        and _is_params_present(commit_data, commit_dir)
        and _is_zkp_present(commit_data, commit_dir)
        and _is_message_present(commit_data)
    )


def _get_remote_latest_commit(repo_hash: str, branch_hash: str) -> str | None:
    try:
        with _client_with_auth() as client:
            response = client.get(
                f"{_base_url()}/api/repo/hash/{repo_hash}/branch/hash/{branch_hash}/commit/latest"
            )
            response.raise_for_status()
            data = response.json().get("data", {})
            return data.get("commitHash")
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            return None
        raise
    except Exception:
        return None


def _count_unpushed_commits(repo_hash: str | None, branch_name: str | None, branch_hash: str | None) -> int:
    all_local = _get_all_local_commits()
    complete_local = [(c, d) for (c, d) in all_local if _is_commit_complete(c, d)]

    if not complete_local:
        return 0

    remote_head = None
    if repo_hash and branch_hash:
        remote_head = _get_remote_latest_commit(repo_hash, branch_hash)
    elif repo_hash and branch_name:
        try:
            branch_data = api_client.get_branch_by_name(repo_hash, branch_name)
            resolved_branch_hash = branch_data.get("branchHash")
            if resolved_branch_hash:
                remote_head = _get_remote_latest_commit(repo_hash, resolved_branch_hash)
        except Exception:
            remote_head = None

    if not remote_head:
        return len(complete_local)

    for idx, (commit_data, _) in enumerate(complete_local):
        if commit_data.get("commitHash") == remote_head:
            return len(complete_local) - (idx + 1)

    return len(complete_local)


def status() -> None:
    """Show branch, head, local commit completeness, and unpushed commit count."""
    try:
        flair_dir = _get_flair_dir()
    except typer.BadParameter as e:
        console.print(f"[red]{e}[/red]")
        raise typer.Exit(code=1)

    head_info = _get_head_info() or {}
    branch_name = head_info.get("currentBranch") or "unknown"
    branch_hash = head_info.get("branchHash")
    head_hash = head_info.get("latestCommitHash") or head_info.get("previousCommit")

    local_latest = _get_latest_local_commit()
    has_unfinished = False
    params_ok = False
    zkp_ok = False
    message_ok = False
    local_commit_hash = None

    if local_latest:
        local_commit_data, local_commit_dir = local_latest
        local_commit_hash = local_commit_data.get("commitHash")
        params_ok = _is_params_present(local_commit_data, local_commit_dir)
        zkp_ok = _is_zkp_present(local_commit_data, local_commit_dir)
        message_ok = _is_message_present(local_commit_data)
        has_unfinished = not _is_commit_complete(local_commit_data, local_commit_dir)

    repo_hash = _load_repo_hash()
    unpushed_count = _count_unpushed_commits(repo_hash, branch_name if branch_name != "unknown" else None, branch_hash)

    mark = lambda ok: "✓" if ok else "✗"

    console.print(f"Branch: {branch_name}")
    console.print(f"HEAD: {_short_hash(head_hash)}")
    console.print(f"Current local commit: {_short_hash(local_commit_hash)}")
    console.print(f"Unfinished local commit: {'yes' if has_unfinished else 'no'}")
    console.print(f"Params: {mark(params_ok)}")
    console.print(f"ZKP: {mark(zkp_ok)}")
    console.print(f"Message: {mark(message_ok)}")
    console.print(f"Unpushed commits: {unpushed_count}")
