"""
Add command: Create a new local commit with initial data.
"""
from __future__ import annotations
import typer
from rich.console import Console
from pathlib import Path
import json
from uuid import uuid4

from .utils.local_commits import _get_latest_local_commit

app = typer.Typer()
console = Console()
@app.command()
def add():
    """Create a new local commit.
    
    This creates a commit JSON file in .flair/.local_commits/ with a UUIDv4 hash.
    The commit will be associated with any params and ZKP files created next.
    
    Examples:
      flair add    # Creates a new local commit
    """
    try:
        # Check if we're in a Flair repository
        flair_dir = Path.cwd() / ".flair"
        if not flair_dir.exists():
            console.print("[red]Not in a Flair repository. Run 'flair init' first.[/red]")
            raise typer.Exit(code=1)
        
        # Check if there's an incomplete commit
        latest_commit = _get_latest_local_commit()
        if latest_commit:
            commit_data, _ = latest_commit
            if commit_data.get("params") is None or commit_data.get("zkp") is None:
                console.print("[red]✗ Cannot create a new commit yet.[/red]")
                console.print(f"[yellow]The current commit ({commit_data.get('commitHash')[:8]}...) is incomplete:[/yellow]")
                if commit_data.get("params") is None:
                    console.print("[yellow]  • Missing: params (run 'flair params create')[/yellow]")
                if commit_data.get("zkp") is None:
                    console.print("[yellow]  • Missing: ZKP proof (run 'flair zkp create')[/yellow]")
                console.print("[yellow]Complete the current commit before creating a new one.[/yellow]")
                raise typer.Exit(code=1)
        
        # Load repo info to get framework
        repo_file = flair_dir / "repo.json"
        if not repo_file.exists():
            console.print("[red]Repository info not found. Run 'flair init' first.[/red]")
            raise typer.Exit(code=1)
        
        with open(repo_file, 'r') as f:
            repo_config = json.load(f)
        
        # Create local commits directory
        local_commits_dir = flair_dir / ".local_commits"
        local_commits_dir.mkdir(exist_ok=True)
        
        # Generate new commit hash (UUIDv4)
        commit_hash = str(uuid4())
        commit_dir = local_commits_dir / commit_hash
        commit_dir.mkdir(exist_ok=True)
        
        # Create commit JSON with available data
        commit_data = {
            "commitHash": commit_hash,
            "architecture": repo_config.get("metadata", {}).get("framework") or repo_config.get("framework", "unknown"),
            "params": None,         # Will be filled by flair params create
            "deltaParams": None,    # Will be filled by flair params create (if not genesis)
            "zkp": None,            # Will be filled by flair zkp create
            "metrics": None,        # Optional, filled using flair metrics command set
            "message": None,        # Will be filled by flair commit
            "commitType": None,     # Will be filled by flair commit (CHECKPOINT or DELTA)
            "architectureHash": None,
            "previousArchitectureHash": None,
            "architectureChanged": False,
            "classSpace": None,
            "classSpaceHash": None,
            "previousClassSpaceHash": None,
            "classSpaceChanged": False,
            "mergeStrategy": None,
            "mergeParents": None,
            "createdAt": None
        }
        
        commit_file = commit_dir / "commit.json"
        with open(commit_file, 'w') as f:
            json.dump(commit_data, f, indent=2)
        
        console.print(f"\n[green]✓ New local commit created[/green]")
        console.print(f"  Commit hash: {commit_hash[:8]}...")
        console.print(f"  Location: .flair/.local_commits/{commit_hash}/")
        console.print(f"\n[dim]Next steps:[/dim]")
        console.print(f"  1. Run 'flair params create' to add model parameters")
        console.print(f"  2. Run 'flair zkp create' to generate zero-knowledge proof")
        console.print(f"  3. Run 'flair commit -m \"Your message\"' to finalize commit")
        console.print(f"  4. Run 'flair push' to upload commit to repository")
        
    except Exception as e:
        console.print(f"[red]✗ Failed to create commit: {str(e)}[/red]")
        raise typer.Exit(code=1)
