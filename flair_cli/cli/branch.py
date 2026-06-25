"""
Branch management commands - git-like syntax with intelligent caching.
"""
from __future__ import annotations
import typer
from rich.console import Console
from rich.table import Table
from pathlib import Path
import json
import httpx
import shutil

from ..api import client as api_client

app = typer.Typer()
console = Console()


def _ensure_ext(ext: str) -> str:
    """Ensure extension has leading dot."""
    ext = ext or ""
    return ext if ext.startswith(".") else f".{ext}" if ext else ""


def _get_cache_dir() -> Path:
    """Get .flair/.cache directory."""
    flair_dir = Path.cwd() / ".flair"
    cache_dir = flair_dir / ".cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir


def _get_branch_cache_dir(branch_name: str) -> Path:
    """Get cache directory for a specific branch."""
    cache_dir = _get_cache_dir()
    branch_cache = cache_dir / branch_name
    branch_cache.mkdir(parents=True, exist_ok=True)
    return branch_cache


def _save_artifacts_to_cache(branch_name: str):
    """Save current params and zkml files to cache for a branch."""
    flair_dir = Path.cwd() / ".flair"
    branch_cache = _get_branch_cache_dir(branch_name)
    
    # Params from .flair/.params
    params_dir = flair_dir / ".params"
    if params_dir.exists():
        for file_path in params_dir.glob("params*"):
            if file_path.is_file():
                dest = branch_cache / file_path.name
                shutil.copy2(file_path, dest)
    
    # ZKML files from .flair/.zkp
    zkp_dir = flair_dir / ".zkp"
    if zkp_dir.exists():
        for file_path in zkp_dir.glob("zkml_*"):
            if file_path.is_file():
                dest = branch_cache / file_path.name
                shutil.copy2(file_path, dest)


def _restore_artifacts_from_cache(branch_name: str) -> bool:
    """Restore params and zkml files from cache for a branch. Returns True if successful."""
    branch_cache = _get_branch_cache_dir(branch_name)
    flair_dir = Path.cwd() / ".flair"
    
    # Check if cache has any artifacts
    if not list(branch_cache.glob("*")):
        return False
    
    # Ensure directories exist
    params_dir = flair_dir / ".params"
    zkp_dir = flair_dir / ".zkp"
    params_dir.mkdir(exist_ok=True)
    zkp_dir.mkdir(exist_ok=True)
    
    # Remove current artifacts from .flair/.params and .flair/.zkp
    for file_path in params_dir.glob("params*"):
        if file_path.is_file():
            file_path.unlink()
    
    for file_path in zkp_dir.glob("zkml_*"):
        if file_path.is_file():
            file_path.unlink()
    
    # Restore cached artifacts
    for cached_file in branch_cache.glob("*"):
        if cached_file.is_file():
            if cached_file.name.startswith("params"):
                dest = params_dir / cached_file.name
            else:
                dest = zkp_dir / cached_file.name
            shutil.copy2(cached_file, dest)
    
    return True


def _cleanup_old_caches(max_branches: int = 4):
    """Keep only the latest N cached branches."""
    cache_dir = _get_cache_dir()
    if not cache_dir.exists():
        return
    
    # Get list of all branch caches
    branch_caches = sorted(
        [d for d in cache_dir.iterdir() if d.is_dir()],
        key=lambda d: d.stat().st_mtime,
        reverse=True
    )
    
    # Remove oldest caches if we exceed max
    for old_cache in branch_caches[max_branches:]:
        shutil.rmtree(old_cache)


def _download_file(url: str, target_path: Path):
    """Download a file from URL to target path."""
    target_path.parent.mkdir(parents=True, exist_ok=True)
    with httpx.stream("GET", url, timeout=120) as resp:
        resp.raise_for_status()
        with open(target_path, "wb") as f:
            for chunk in resp.iter_bytes(chunk_size=8192):
                f.write(chunk)


def _download_branch_artifacts(repo_hash: str, branch_name: str):
    """Download latest commit artifacts for a specific branch."""
    try:
        # Get branch info
        branch_data = api_client.get_branch_by_name(repo_hash, branch_name)
        if not branch_data:
            console.print(f"[red]Branch '{branch_name}' not found[/red]")
            return False
        
        latest_commit = branch_data.get("latestCommit") or {}
        if not latest_commit:
            console.print(f"[dim]No commits in branch '{branch_name}'[/dim]")
            return True
        
        flair_dir = Path.cwd() / ".flair"
        params_dir = flair_dir / ".params"
        zkp_dir = flair_dir / ".zkp"
        
        # Ensure directories exist
        params_dir.mkdir(exist_ok=True)
        zkp_dir.mkdir(exist_ok=True)
        
        # Download params to .flair/.params
        params = (latest_commit.get("params") or {}).get("ipfsObject")
        if params and params.get("uri"):
            ext = _ensure_ext(params.get("extension") or "")
            target = params_dir / f"params{ext if ext else ''}"
            console.print(f"[dim]Downloading params for {branch_name}...[/dim]")
            _download_file(params["uri"], target)
        
        # Download ZKML files to .flair/.zkp
        zkml = (latest_commit.get("params") or {}).get("ZKMLProof") or {}
        for key, label in [("proof", "zkml_proof"), ("settings", "zkml_settings"), ("verification_key", "zkml_verification_key")]:
            obj = zkml.get(key)
            if obj and obj.get("uri"):
                ext = _ensure_ext(obj.get("extension") or "json")
                target = zkp_dir / f"{label}{ext if ext else ''}"
                console.print(f"[dim]Downloading {label.replace('_', ' ')} for {branch_name}...[/dim]")
                _download_file(obj["uri"], target)
        
        return True
        
    except Exception as e:
        console.print(f"[red]Failed to download artifacts: {e}[/red]")
        return False


def _get_current_repo() -> dict | None:
    """Get current repository info from .flair/repo.json"""
    flair_dir = Path.cwd() / ".flair"
    repo_file = flair_dir / "repo.json"
    if not repo_file.exists():
        return None
    try:
        with open(repo_file, "r") as f:
            return json.load(f)
    except Exception:
        return None


def _get_current_branch() -> dict | None:
    """Get current branch from .flair/HEAD"""
    flair_dir = Path.cwd() / ".flair"
    head_file = flair_dir / "HEAD"
    if not head_file.exists():
        return None
    try:
        with open(head_file, "r") as f:
            return json.load(f)
    except Exception:
        return None


def _set_current_branch(branch_data: dict):
    """Update .flair/HEAD with current branch info"""
    flair_dir = Path.cwd() / ".flair"
    head_file = flair_dir / "HEAD"
    with open(head_file, "w") as f:
        json.dump(branch_data, f, indent=2)


def _get_all_branches() -> list[dict]:
    """Get all branches from .flair/branches.json"""
    flair_dir = Path.cwd() / ".flair"
    branches_file = flair_dir / "branches.json"
    if not branches_file.exists():
        return []
    try:
        with open(branches_file, "r") as f:
            return json.load(f)
    except Exception:
        return []


def _update_branches_cache(branches: list[dict]):
    """Update .flair/branches.json cache"""
    flair_dir = Path.cwd() / ".flair"
    branches_file = flair_dir / "branches.json"
    with open(branches_file, "w") as f:
        json.dump(branches, f, indent=2)
    """Get current repository info from .flair/repo.json"""
    flair_dir = Path.cwd() / ".flair"
    repo_file = flair_dir / "repo.json"
    if not repo_file.exists():
        return None
    try:
        with open(repo_file, "r") as f:
            return json.load(f)
    except Exception:
        return None


def _get_current_branch() -> dict | None:
    """Get current branch from .flair/HEAD"""
    flair_dir = Path.cwd() / ".flair"
    head_file = flair_dir / "HEAD"
    if not head_file.exists():
        return None
    try:
        with open(head_file, "r") as f:
            return json.load(f)
    except Exception:
        return None


def _set_current_branch(branch_data: dict):
    """Update .flair/HEAD with current branch info"""
    flair_dir = Path.cwd() / ".flair"
    head_file = flair_dir / "HEAD"
    with open(head_file, "w") as f:
        json.dump(branch_data, f, indent=2)


def _get_all_branches() -> list[dict]:
    """Get all branches from .flair/branches.json"""
    flair_dir = Path.cwd() / ".flair"
    branches_file = flair_dir / "branches.json"
    if not branches_file.exists():
        return []
    try:
        with open(branches_file, "r") as f:
            return json.load(f)
    except Exception:
        return []


def _update_branches_cache(branches: list[dict]):
    """Update .flair/branches.json cache"""
    flair_dir = Path.cwd() / ".flair"
    branches_file = flair_dir / "branches.json"
    with open(branches_file, "w") as f:
        json.dump(branches, f, indent=2)


@app.command(name="branch")
def list_or_create_branch(
    branch_name: str = typer.Argument(None, help="Branch name to create"),
    delete: str = typer.Option(None, "-d", "--delete", help="Delete specified branch"),
    description: str = typer.Option(None, help="Branch description")
):
    """List all branches or create a new branch.
    
    Examples:
      flair branch              # List all branches
      flair branch new-feature  # Create new branch from current
      flair branch -d old-branch  # Delete a branch
    """
    repo = _get_current_repo()
    if not repo:
        console.print("[red]Not in a Flair repository. Run 'flair init' first.[/red]")
        raise typer.Exit(code=1)
    
    repo_hash = repo.get("hash") or repo.get("repoHash")
    current_branch = _get_current_branch()
    
    # Delete branch
    if delete:
        if current_branch and current_branch.get("currentBranch") == delete:
            console.print(f"[red]Cannot delete current branch '{delete}'. Switch to another branch first.[/red]")
            raise typer.Exit(code=1)
        
        try:
            # Get branch hash first
            branches = _get_all_branches()
            target_branch = next((b for b in branches if b.get("name") == delete), None)
            if not target_branch:
                console.print(f"[red]Branch '{delete}' not found.[/red]")
                raise typer.Exit(code=1)
            
            api_client.delete_branch(repo_hash, target_branch['branchHash'])
            console.print(f"✓ Branch '{delete}' deleted", style="green")
            
            # Refresh branches cache
            branches = api_client.get_branches(repo_hash)
            _update_branches_cache(branches)
            
        except Exception as e:
            console.print(f"[red]Failed to delete branch: {e}[/red]")
            raise typer.Exit(code=1)
        return
    
    # Create new branch
    if branch_name:
        if not current_branch:
            console.print("[red]No current branch set. Cannot create branch from nowhere.[/red]")
            raise typer.Exit(code=1)
        
        try:
            new_branch = api_client.create_branch(
                repo_hash,
                branch_name,
                current_branch.get("branchHash"),
                description
            )
            console.print(f"✓ Branch '{branch_name}' created", style="green")
            
            # Refresh branches cache
            branches = api_client.get_branches(repo_hash)
            _update_branches_cache(branches)
            
        except Exception as e:
            console.print(f"[red]Failed to create branch: {e}[/red]")
            raise typer.Exit(code=1)
        return
    
    # List branches (default behavior)
    try:
        branches = api_client.get_branches(repo_hash)
        
        if not branches:
            console.print("[dim]No branches found. Create one with 'flair branch <name>'[/dim]")
            return
        
        current_name = current_branch.get("currentBranch") if current_branch else None
        
        console.print("\n[bold]Branches:[/bold]")
        for branch in branches:
            prefix = "* " if branch.get("name") == current_name else "  "
            style = "green" if branch.get("name") == current_name else "white"
            console.print(f"{prefix}{branch.get('name')}", style=style)
        
        console.print()
        
    except Exception as e:
        console.print(f"[red]Failed to list branches: {e}[/red]")
        raise typer.Exit(code=1)


@app.command()
def checkout(
    branch_name: str = typer.Argument(..., help="Branch name to switch to"),
    no_cache: bool = typer.Option(False, "--no-cache", help="Force download instead of using cache")
):
    """Switch to a different branch with intelligent artifact caching.
    
    - If branch is cached, artifacts are restored from cache
    - If branch is not cached, artifacts are downloaded and cached
    - Current artifacts are cached before switching
    
    Example:
      flair checkout main
      flair checkout feature-branch
      flair checkout feature-branch --no-cache
    """
    repo = _get_current_repo()
    if not repo:
        console.print("[red]Not in a Flair repository[/red]")
        raise typer.Exit(code=1)
    
    repo_hash = repo.get("hash") or repo.get("repoHash")
    current_branch = _get_current_branch()
    
    if current_branch and current_branch.get("currentBranch") == branch_name:
        console.print(f"[dim]Already on branch '{branch_name}'[/dim]")
        return
    
    try:
        # Fetch branch details by name
        branch_data = api_client.get_branch_by_name(repo_hash, branch_name)
        
        if not branch_data or isinstance(branch_data, list):
            console.print(f"[red]Branch '{branch_name}' not found[/red]")
            raise typer.Exit(code=1)
        
        # Step 1: Save current branch artifacts to cache
        if current_branch:
            current_branch_name = current_branch.get("currentBranch")
            console.print(f"[dim]Caching artifacts for '{current_branch_name}'...[/dim]")
            _save_artifacts_to_cache(current_branch_name)
        
        # Step 2: Try to restore from cache (unless --no-cache flag)
        artifacts_restored = False
        if not no_cache:
            artifacts_restored = _restore_artifacts_from_cache(branch_name)
            if artifacts_restored:
                console.print(f"[green]✓ Restored artifacts from cache[/green]")
        
        # Step 3: If not cached or --no-cache, download artifacts
        if not artifacts_restored:
            console.print(f"[dim]Downloading artifacts for '{branch_name}'...[/dim]")
            if _download_branch_artifacts(repo_hash, branch_name):
                _save_artifacts_to_cache(branch_name)
                console.print(f"[green]✓ Artifacts downloaded and cached[/green]")
        
        # Step 4: Update HEAD to point to new branch
        head_data = {
            "currentBranch": branch_data.get("name"),
            "branchHash": branch_data.get("branchHash"),
            "description": branch_data.get("description")
        }
        _set_current_branch(head_data)
        
        # Step 5: Cleanup old caches (keep only 4 branches)
        _cleanup_old_caches(max_branches=4)
        
        console.print(f"✓ Switched to branch '{branch_name}'", style="green")
        
    except Exception as e:
        console.print(f"[red]Failed to switch branch: {e}[/red]")
        raise typer.Exit(code=1)