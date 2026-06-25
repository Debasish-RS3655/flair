"""
Clone command: clone a remote repository to local directory.
"""
from __future__ import annotations
import typer
from rich.console import Console
from pathlib import Path
import json
import os
import re
import httpx

from ..api import client as api_client

app = typer.Typer()
console = Console()


def _ensure_ext(ext: str) -> str:
    ext = ext or ""
    return ext if ext.startswith(".") else f".{ext}" if ext else ""


def _sanitize_name(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]", "_", name)


def _download_file(url: str, target_path: Path):
    target_path.parent.mkdir(parents=True, exist_ok=True)
    with httpx.stream("GET", url, timeout=120) as resp:
        resp.raise_for_status()
        with open(target_path, "wb") as f:
            for chunk in resp.iter_bytes(chunk_size=8192):
                f.write(chunk)


@app.command()
def clone(
    repo_hash: str = typer.Argument(..., help="Repository hash"),
    target_dir: str = typer.Option(None, "--target-dir", "-C", help="Target directory (defaults to repo name)"),
    branch: str = typer.Option(None, "--branch", help="Branch name to download artifacts for"),
    branch_hash: str = typer.Option(None, "--branch-hash", help="Branch hash to download artifacts for")
):
    """Clone a remote repository to local directory.
    
        Examples:
            flair clone <repo_hash>
            flair clone <repo_hash> --target-dir ./my-repo
            flair clone <repo_hash> --branch main
            flair clone <repo_hash> --branch-hash 123e4567
    """
    try:
        # Fetch clone data from backend using repo hash
        clone_data = api_client.clone_repository(repo_hash)
        
        repo_info = clone_data.get("repo", {})
        branches = clone_data.get("branches", [])
        
        repo_name = repo_info.get("name")
        repo_hash_returned = repo_info.get("hash")
        
        if not repo_name or not repo_hash_returned:
            console.print("[red]Invalid repository data from backend[/red]")
            raise typer.Exit(code=1)
        
        # Determine target directory
        if target_dir:
            local_dir = Path(target_dir)
        else:
            local_dir = Path.cwd() / repo_name
        
        # Check if directory already exists
        if local_dir.exists():
            console.print(f"[red]Directory already exists: {local_dir}[/red]")
            raise typer.Exit(code=1)
        
        # Create directory structure
        local_dir.mkdir(parents=True, exist_ok=True)
        flair_dir = local_dir / ".flair"
        flair_dir.mkdir(exist_ok=True)
        
        # Create .params, .zkp (for local artifacts), .prev_params, .prev_zkp (for downloaded artifacts)
        params_dir = flair_dir / ".params"
        params_dir.mkdir(exist_ok=True)
        zkp_dir = flair_dir / ".zkp"
        zkp_dir.mkdir(exist_ok=True)
        prev_params_dir = flair_dir / ".prev_params"
        prev_params_dir.mkdir(exist_ok=True)
        prev_zkp_dir = flair_dir / ".prev_zkp"
        prev_zkp_dir.mkdir(exist_ok=True)
        
        # Save repository metadata
        repo_file = flair_dir / "repo.json"
        repo_data = {
            "name": repo_info.get("name"),
            "hash": repo_info.get("hash"),
            "id": repo_info.get("hash"),  # Use hash as ID for now
            "owner": repo_info.get("owner"),
            "metadata": repo_info.get("metadata"),
            "baseModel": repo_info.get("baseModel"),
            "createdAt": repo_info.get("createdAt"),
            "updatedAt": repo_info.get("updatedAt")
        }
        
        with open(repo_file, "w") as f:
            json.dump(repo_data, f, indent=2)
        
        # Determine which branch to download artifacts for
        selected_branch = None
        if branch and branch_hash:
            console.print("[red]Provide either --branch or --branch-hash, not both.[/red]")
            raise typer.Exit(code=1)

        if branch_hash:
            selected_branch = next((b for b in branches if b.get("branchHash") == branch_hash), None)
            if not selected_branch:
                console.print(f"[red]Branch with hash '{branch_hash}' not found.[/red]")
                raise typer.Exit(code=1)
        elif branch:
            selected_branch = next((b for b in branches if b.get("name") == branch), None)
            if not selected_branch:
                console.print(f"[red]Branch named '{branch}' not found.[/red]")
                raise typer.Exit(code=1)
        else:
            # Use default branch if available; fallback: first branch
            default_hash = repo_info.get("defaultBranchHash")
            if default_hash:
                selected_branch = next((b for b in branches if b.get("branchHash") == default_hash), None)
            if not selected_branch and branches:
                selected_branch = branches[0]       # chooses first branch if no default set

        # Save the name of the branches in the repository
        branches_file = flair_dir / "branches.json"
        with open(branches_file, "w") as f:
            json.dump(branches, f, indent=2)
        
        # Save current branch info with previous commit
        if selected_branch:
            current_branch_file = flair_dir / "HEAD"
            latest_commit = selected_branch.get("latestCommit") or {}
            current_branch_data = {
                "currentBranch": selected_branch.get("name"),
                "branchHash": selected_branch.get("branchHash"),
                "description": selected_branch.get("description"),
                "previousCommit": latest_commit.get("commitHash")
            }
            with open(current_branch_file, "w") as f:
                json.dump(current_branch_data, f, indent=2)

        # Create a .gitignore-like flair ignore file
        flairiignore = local_dir / ".flairignore"
        flairiignore.write_text("__pycache__/\n*.pyc\n.DS_Store\n.env\nnode_modules/\n")

        # Download base model if available (to root directory)
        base_model = repo_info.get("baseModel")
        if base_model and base_model.get("uri"):
            ext = _ensure_ext(base_model.get("extension") or "")
            target = local_dir / f"base_model{ext if ext else ''}"
            console.print("\n[dim]Downloading base model...[/dim]")
            _download_file(base_model["uri"], target)
            size_mb = target.stat().st_size / (1024 * 1024)
            console.print(f"✓ Base model saved to {target.name} ({size_mb:.2f} MB)", style="green")

        # Determine which branch to download artifacts for
        selected_branch = None
        if branch and branch_hash:
            console.print("[red]Provide either --branch or --branch-hash, not both.[/red]")
            raise typer.Exit(code=1)

        if branch_hash:
            selected_branch = next((b for b in branches if b.get("branchHash") == branch_hash), None)
            if not selected_branch:
                console.print(f"[red]Branch with hash '{branch_hash}' not found.[/red]")
                raise typer.Exit(code=1)
        elif branch:
            selected_branch = next((b for b in branches if b.get("name") == branch), None)
            if not selected_branch:
                console.print(f"[red]Branch named '{branch}' not found.[/red]")
                raise typer.Exit(code=1)
        else:
            # Use default branch if available; fallback: first branch
            default_hash = repo_info.get("defaultBranchHash")
            if default_hash:
                selected_branch = next((b for b in branches if b.get("branchHash") == default_hash), None)
            if not selected_branch and branches:
                selected_branch = branches[0]       # chooses first branch if no default set

        # Download latest params and zkml proofs for the selected branch
        if selected_branch:
            latest_commit = selected_branch.get("latestCommit") or {}
            params = (latest_commit.get("params") or {}).get("ipfsObject")
            if params and params.get("uri"):
                ext = _ensure_ext(params.get("extension") or "")
                target = flair_dir / ".params" / f"params{ext if ext else ''}"
                console.print(f"[dim]Downloading params for {selected_branch.get('name')}...[/dim]")
                _download_file(params["uri"], target)

            zkml = (latest_commit.get("params") or {}).get("ZKMLProof") or {}
            for key, label in [("proof", "proof"), ("settings", "settings"), ("verification_key", "verification_key")]:
                obj = zkml.get(key)
                if obj and obj.get("uri"):
                    ext = _ensure_ext(obj.get("extension") or "zlib")
                    target = flair_dir / ".zkp" / f"{label}{ext if ext else ''}"
                    console.print(f"[dim]Downloading {label.replace('_', ' ')} for {selected_branch.get('name')}...[/dim]")
                    _download_file(obj["uri"], target)

        # Display clone info
        console.print(f"✓ Repository cloned successfully!", style="green")
        console.print(f"  Name: {repo_name}")
        console.print(f"  Owner: {repo_info.get('owner')}")
        console.print(f"  Location: {local_dir}")
        console.print(f"  Branches: {len(branches)}")

        if branches:
            console.print("\n[dim]Branches:[/dim]")
            for branch in branches:
                latest_commit = branch.get("latestCommit")
                if latest_commit:
                    console.print(f"  • {branch.get('name')} @ {latest_commit.get('commitHash', 'N/A')[:8]}")
                else:
                    console.print(f"  • {branch.get('name')} (empty)")

        console.print(f"\nTo get started:")
        console.print(f"  cd {local_dir}")
        console.print(f"  flair status")
        
    except Exception as e:
        console.print(f"Failed to clone repository: {e}", style="bold red")
        raise typer.Exit(code=1)
