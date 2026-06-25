"""Log command: show local commit history."""

from __future__ import annotations

import json

import typer
from rich.console import Console

from ..api import client as api_client
from .utils.local_commits import _get_commit_by_hash, _get_flair_dir, _get_head_info
from .utils.repo_state import _load_repo_hash, _short_hash

console = Console()


def _resolve_branch_head(branch_name: str | None) -> tuple[str | None, str | None]:
    """Resolve target branch and starting commit hash for traversal."""
    head_info = _get_head_info() or {}
    current_branch = head_info.get("currentBranch")

    if not branch_name or branch_name == current_branch:
        start_hash = head_info.get("latestCommitHash") or head_info.get("previousCommit")
        return current_branch, start_hash

    # Try local branches cache first.
    try:
        flair_dir = _get_flair_dir()
        branches_file = flair_dir / "branches.json"
        if branches_file.exists():
            with open(branches_file, "r") as f:
                branches = json.load(f)
            target = next((b for b in branches if b.get("name") == branch_name), None)
            if target:
                latest = target.get("latestCommit") or {}
                start_hash = latest.get("commitHash") or target.get("latestCommitHash")
                if start_hash:
                    return branch_name, start_hash
    except Exception:
        pass

    # Fallback to API branch lookup.
    repo_hash = _load_repo_hash()
    if repo_hash:
        try:
            target = api_client.get_branch_by_name(repo_hash, branch_name)
            if target:
                latest = target.get("latestCommit") or {}
                start_hash = latest.get("commitHash")
                return branch_name, start_hash
        except Exception:
            pass

    return branch_name, None


def log(
    graph: bool = False,
    branch: str | None = None,
    limit: int = 50,
) -> None:
    """Show local commit history, newest first."""
    if limit <= 0:
        console.print("[red]--limit must be greater than 0[/red]")
        raise typer.Exit(code=1)

    try:
        _get_flair_dir()
    except typer.BadParameter as e:
        console.print(f"[red]{e}[/red]")
        raise typer.Exit(code=1)

    resolved_branch, start_hash = _resolve_branch_head(branch)
    if not start_hash:
        if branch:
            console.print(f"[yellow]No commits found for branch '{branch}'.[/yellow]")
        else:
            console.print("[yellow]No commits found.[/yellow]")
        raise typer.Exit(code=0)

    printed = 0
    current_hash = start_hash

    while current_hash and current_hash != "_GENESIS_COMMIT_" and printed < limit:
        commit_result = _get_commit_by_hash(current_hash)
        if not commit_result:
            console.print(f"[yellow]Stopped: commit {current_hash[:8]}... not found locally.[/yellow]")
            break

        commit_data, _ = commit_result
        message = commit_data.get("message") or "(no message)"
        prefix = "* " if graph else ""

        console.print(f"{prefix}{_short_hash(current_hash)} {message}")

        printed += 1
        current_hash = commit_data.get("previousCommitHash")

    if printed == 0:
        if resolved_branch:
            console.print(f"[yellow]No local commits available for branch '{resolved_branch}'.[/yellow]")
        else:
            console.print("[yellow]No local commits available.[/yellow]")
