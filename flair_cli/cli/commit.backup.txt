"""
Commit command: Finalize the commit.json file with message and determine commit type.
"""
from __future__ import annotations
import typer
from rich.console import Console
from pathlib import Path
import json

app = typer.Typer()
console = Console()


def _get_latest_local_commit() -> tuple[dict, Path] | None:
    """Get the latest local commit from .flair/.local_commits/"""
    flair_dir = Path.cwd() / ".flair"
    local_commits_dir = flair_dir / ".local_commits"
    
    if not local_commits_dir.exists():
        return None
    
    # Get the most recently created commit directory
    commit_dirs = sorted(local_commits_dir.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True)
    
    if not commit_dirs:
        return None
    
    commit_dir = commit_dirs[0]
    commit_file = commit_dir / "commit.json"
    
    if commit_file.exists():
        with open(commit_file, 'r') as f:
            return json.load(f), commit_dir
    
    return None


def _get_head_info() -> dict | None:
    """Get current HEAD information."""
    flair_dir = Path.cwd() / ".flair"
    head_file = flair_dir / "HEAD"
    
    if not head_file.exists():
        return None
    
    try:
        with open(head_file, 'r') as f:
            return json.load(f)
    except Exception:
        return None


def _is_genesis_commit() -> bool:
    """Check if this is the first commit in the repository."""
    head_info = _get_head_info()
    
    # If HEAD doesn't exist, this is the first commit
    if not head_info:
        return True
    
    # If previousCommit is explicitly genesis, this is the first commit
    if head_info.get("previousCommit") == "_GENESIS_COMMIT_":
        return True
    
    return False


@app.command()
def finalize(
    message: str = typer.Option("Update model", "-m", "--message", help="Commit message")
):
    """Finalize the commit.json file with message and determine commit type.
    
    Determines whether this is a CHECKPOINT (genesis/first) commit or a DELTA (subsequent) commit.
    
    - CHECKPOINT: First commit in repository, uploads full parameters
    - DELTA: Subsequent commits, uploads delta parameters (difference from previous)
    
    Prerequisites:
    - Run 'flair add' to create a local commit
    - Run 'flair params create' to add model parameters
    - Run 'flair zkp create' to generate zero-knowledge proof
    
    Examples:
      flair commit -m "Initial model commit"
      flair commit --message "Update with new training data"
    """
    try:
        # Check if we're in a Flair repository
        flair_dir = Path.cwd() / ".flair"
        if not flair_dir.exists():
            console.print("[red]Not in a Flair repository. Run 'flair init' first.[/red]")
            raise typer.Exit(code=1)
        
        # Get the latest local commit
        latest_commit = _get_latest_local_commit()
        if not latest_commit:
            console.print("[red]No local commits found. Run 'flair add' first.[/red]")
            raise typer.Exit(code=1)
        
        commit_data, commit_dir = latest_commit
        commit_hash = commit_data.get("commitHash")
        
        # Check prerequisites: params and zkp must exist
        if commit_data.get("params") is None:
            console.print("[red]✗ Missing model parameters.[/red]")
            console.print("[yellow]Run 'flair params create' first.[/yellow]")
            raise typer.Exit(code=1)
        
        if commit_data.get("zkp") is None:
            console.print("[red]✗ Missing zero-knowledge proof.[/red]")
            console.print("[yellow]Run 'flair zkp create' first.[/yellow]")
            raise typer.Exit(code=1)
        
        # Check if this commit has already been finalized
        if commit_data.get("message") is not None:
            console.print("[red]✗ This commit has already been finalized.[/red]")
            console.print(f"[yellow]Message: {commit_data.get('message')}[/yellow]")
            console.print("[yellow]To create a new commit, run 'flair add' first.[/yellow]")
            raise typer.Exit(code=1)
        
        # Determine commit type: CHECKPOINT for genesis, DELTA for subsequent
        is_genesis = _is_genesis_commit()
        commit_type = "CHECKPOINT" if is_genesis else "DELTA"
        
        # Update commit.json with message and commitType
        commit_data["message"] = message
        commit_data["commitType"] = commit_type
        commit_data["status"] = "FINALIZED"
        
        commit_file = commit_dir / "commit.json"
        with open(commit_file, 'w') as f:
            json.dump(commit_data, f, indent=2)
        
        console.print(f"\n[green]✓ Commit finalized[/green]")
        console.print(f"  Commit hash: {commit_hash[:16]}...")
        console.print(f"  Commit type: {commit_type}")
        console.print(f"  Message: {message}")
        
        if commit_type == "CHECKPOINT":
            console.print(f"  [dim]Uploading: full parameters (params)[/dim]")
        else:
            console.print(f"  [dim]Uploading: delta parameters (delta_params)[/dim]")
        
        console.print(f"\n[dim]Next step:[/dim]")
        console.print(f"  Run 'flair push' to upload commit to repository")
        
    except typer.Exit:
        raise
    except Exception as e:
        console.print(f"[red]✗ Failed to finalize commit: {str(e)}[/red]")
        raise typer.Exit(code=1)
