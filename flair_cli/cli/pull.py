import json
from pathlib import Path
import typer
from rich.console import Console
import httpx

from ..api import client as api_client
from ..api.utils import _base_url, _client_with_auth
from ..core import session
from .utils.local_commits import _get_all_local_commits, _get_flair_dir, _get_head_info

app = typer.Typer(help="Pull latest commit statuses from remote")
console = Console()

def _load_repo_config() -> dict:
    """Load repository info from .flair/repo.json"""
    flair_dir = _get_flair_dir()
    config_file = flair_dir / "repo.json"
    
    if not config_file.exists():
        raise typer.BadParameter("Repository info not found. Run 'flair init' first.")
    
    with open(config_file, 'r') as f:
        return json.load(f)

@app.command()
def pull(
    branch_name: str = typer.Argument(None, help="Branch name to pull from"),
    upstream: str = typer.Option(None, "-u", "--set-upstream", help="Remote name (default: origin)")
):
    """Synchronize local commit statuses with the remote repository manager."""
    try:
        current_session = session.load_session()
        if not current_session:
            console.print("[red]Not authenticated. Run 'flair auth login' first.[/red]")
            raise typer.Exit(code=1)

        repo_config = _load_repo_config()
        repo_hash = repo_config.get("repoHash") or repo_config.get("metadata", {}).get("repoHash")
        if not repo_hash:
            console.print("[red]Repository hash not found in config.[/red]")
            raise typer.Exit(code=1)

        head_info = _get_head_info()
        
        target_branch_name = branch_name
        if not target_branch_name:
            if head_info:
                target_branch_name = head_info.get("currentBranch")
            else:
                target_branch_name = "main"
        
        branch_hash = None
        if not branch_name and head_info:
            branch_hash = head_info.get("branchHash")
            
        if not branch_hash:
            try:
                branch_data = api_client.get_branch_by_name(repo_hash, target_branch_name)
                if isinstance(branch_data, dict):
                    branch_hash = branch_data.get("branchHash")
            except Exception:
                pass
                
        if not branch_hash:
            console.print(f"[red]Branch '{target_branch_name}' not found on remote.[/red]")
            raise typer.Exit(code=1)

        all_local_commits = _get_all_local_commits()
        if not all_local_commits:
            console.print("[yellow]No local commits found to sync.[/yellow]")
            raise typer.Exit(code=0)

        # Find the last merged/merger commit as a cursor
        cursor_hash = "_GENESIS_COMMIT_"
        for commit_data, _ in reversed(all_local_commits):
            ctype = commit_data.get("commitType")
            status = commit_data.get("status")
            if ctype in ("CHECKPOINT", "MERGE") and status in ("MERGER", "MERGED"):
                cursor_hash = commit_data.get("commitHash")
                if cursor_hash:
                    break
                else:
                    cursor_hash = "_GENESIS_COMMIT_"

        console.print(f"[cyan]Syncing commit statuses since: {cursor_hash[:16]}...[/cyan]")

        with _client_with_auth() as client:
            response = client.get(
                f"{_base_url()}/api/repo/hash/{repo_hash}/branch/hash/{branch_hash}/commit/status/sync",
                params={"since": cursor_hash}
            )
            response.raise_for_status()
            sync_data = response.json().get("data", [])

        # Create a mapping of commit hash -> status
        remote_status_map = {item["commitHash"]: item["status"] for item in sync_data if "commitHash" in item and "status" in item}

        if not remote_status_map:
            console.print("[green]✓ Local commits are already up to date.[/green]")
            raise typer.Exit(code=0)

        updated_count = 0
        for commit_data, commit_dir in all_local_commits:
            commit_hash = commit_data.get("commitHash")
            if commit_hash in remote_status_map:
                new_status = remote_status_map[commit_hash]
                if commit_data.get("status") != new_status:
                    commit_data["status"] = new_status
                    commit_file = commit_dir / "commit.json"
                    try:
                        with open(commit_file, 'w') as f:
                            json.dump(commit_data, f, indent=2)
                        updated_count += 1
                        console.print(f"  [dim]Updated {commit_hash[:8]}... status -> {new_status}[/dim]")
                    except Exception as e:
                        console.print(f"[yellow]Warning: Failed to write {commit_hash}: {e}[/yellow]")

        console.print(f"[bold green]✓ Successfully synced {updated_count} commit(s).[/bold green]")

    except httpx.HTTPStatusError as e:
        console.print(f"[red]Error communicating with server: HTTP {e.response.status_code}[/red]")
        raise typer.Exit(code=1)
    except Exception as e:
        console.print(f"[red]Error during pull: {e}[/red]")
        raise typer.Exit(code=1)
