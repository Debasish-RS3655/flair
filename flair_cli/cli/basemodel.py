"""
Base model management commands.
Upload, check, and manage base models for repositories.
"""

from __future__ import annotations
import typer
from rich.console import Console
from pathlib import Path
import json
import httpx

from ..api import client as api_client
from ..core.config import ALLOWED_BASE_MODEL_EXTENSIONS
from ..core.session import load_session

app = typer.Typer()
console = Console()

# function to get the current repository info thats stored in .flair/repo.json
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


def _check_base_model_exists(repo_hash: str) -> tuple[bool, str | None]:
    """Check if base model already exists for repo.
    
    Returns:
        (exists: bool, url: str | None)
    """
    try:
        result = api_client.get_base_model_url(repo_hash)
        return True, result.get("data")
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 400:
            # No base model exists
            return False, None
        raise


def _check_user_authorization(repo_hash: str) -> bool:
    """Check if current user is owner or admin of the repository.
    
    Returns:
        True if user is authorized (owner or admin), False otherwise
    """
    try:
        # Get current user's wallet address
        session = load_session()
        if not session or not session.wallet_address:
            return False
        
        user_wallet = session.wallet_address
        
        # Get repository details
        repo = api_client.get_repo_by_hash(repo_hash)
        
        # Check if user is owner
        if repo.get("ownerAddress") == user_wallet:
            return True
        
        # Check if user is admin
        admin_ids = repo.get("adminIds", [])
        if user_wallet in admin_ids:
            return True
        
        return False
    except Exception:
        return False


def download_base_model(repo_hash: str, target_dir: Path, verbose: bool = True) -> bool:
    """Download base model from repository.
    
    Args:
        repo_hash: Repository hash
        target_dir: Directory to save the base model
        verbose: Print download progress
        
    Returns:
        True if successful, False otherwise
    """
    try:
        # Get base model URL and extension
        result = api_client.get_base_model_url(repo_hash)
        url = result.get("data")
        file_extension = result.get("fileExtension")
        
        if not url or not file_extension:
            if verbose:
                console.print("[yellow]No base model available for this repository[/yellow]")
            return False
        
        # Determine filename
        filename = f"base_model{file_extension}"
        target_path = target_dir / filename
        
        if verbose:
            console.print(f"[dim]Downloading base model ({file_extension})...[/dim]")
        
        # Download the file
        import httpx
        with httpx.stream("GET", url, timeout=120) as response:
            response.raise_for_status()
            with open(target_path, "wb") as f:
                for chunk in response.iter_bytes(chunk_size=8192):
                    f.write(chunk)
        
        if verbose:
            size_mb = target_path.stat().st_size / (1024 * 1024)
            console.print(f"✓ Base model downloaded: {filename} ({size_mb:.2f} MB)", style="green")
        
        return True
        
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 400:
            # No base model exists
            if verbose:
                console.print("[dim]No base model available[/dim]")
            return False
        if verbose:
            console.print(f"[red]Failed to download base model: {e}[/red]")
        return False
    except Exception as e:
        if verbose:
            console.print(f"[red]Failed to download base model: {e}[/red]")
        return False


def upload_base_model(repo_hash: str, file_path: Path, force: bool = False) -> bool:
    """Upload a base model file to repository.
    
    Args:
        repo_hash: Repository hash
        file_path: Path to base model file
        force: Skip confirmation prompts
        
    Returns:
        True if successful, False otherwise
    """
    # Validate file extension
    if file_path.suffix.lower() not in ALLOWED_BASE_MODEL_EXTENSIONS:
        console.print(f"[red]Invalid file type: {file_path.suffix}[/red]")
        console.print(f"[dim]Allowed types: {', '.join(ALLOWED_BASE_MODEL_EXTENSIONS)}[/dim]")
        return False
    
    # Check if file exists
    if not file_path.exists():
        console.print(f"[red]File not found: {file_path}[/red]")
        return False
    
    # Check if base model already exists
    exists, existing_url = _check_base_model_exists(repo_hash)
    
    if exists and not force:
        console.print("[yellow]⚠ Base model already exists for this repository[/yellow]")
        console.print(f"[dim]Current URL: {existing_url}[/dim]")
        replace = typer.confirm("Do you want to replace it?", default=False)
        if not replace:
            console.print("[dim]Upload cancelled[/dim]")
            return False
    
    # Upload the file
    try:
        console.print(f"[dim]Uploading {file_path.name} ({file_path.stat().st_size / 1024:.2f} KB)...[/dim]")
        result = api_client.upload_base_model(repo_hash, file_path)
        
        cid = result.get("cid")
        url = result.get("url")
        
        console.print("✓ Base model uploaded successfully!", style="green")
        console.print(f"  CID: {cid}")
        console.print(f"  URL: {url}")
        return True
        
    except Exception as e:
        console.print(f"[red]Failed to upload base model: {e}[/red]")
        return False


@app.command()
def add(
    filename: str = typer.Argument(..., help="Base model file to upload"),
    force: bool = typer.Option(False, "--force", "-f", help="Skip confirmation prompts")
):
    """Upload a base model file to the current repository.
    
    Example:
      flair basemodel add model.pt
      flair basemodel add architecture.onnx --force
    """
    # Get current repo
    repo = _get_current_repo()
    if not repo:
        console.print("[red]Not in a Flair repository. Run 'flair init' first.[/red]")
        raise typer.Exit(code=1)
    
    repo_hash = repo.get("hash") or repo.get("repoHash")
    if not repo_hash:
        console.print("[red]Could not determine repository hash[/red]")
        raise typer.Exit(code=1)
    
    # Check authorization
    if not _check_user_authorization(repo_hash):
        console.print("[red]Unauthorized. Only repository owner or admins can add base models.[/red]")
        raise typer.Exit(code=1)
    
    # Resolve file path
    file_path = Path(filename)
    if not file_path.is_absolute():
        file_path = Path.cwd() / filename
    
    success = upload_base_model(repo_hash, file_path, force)
    if not success:
        raise typer.Exit(code=1)


@app.command()
def check():
    """Check if current repository has a base model."""
    repo = _get_current_repo()
    if not repo:
        console.print("[red]Not in a Flair repository[/red]")
        raise typer.Exit(code=1)
    
    repo_hash = repo.get("hash") or repo.get("repoHash")
    exists, url = _check_base_model_exists(repo_hash)
    
    if exists:
        console.print("[green]✓ Base model exists[/green]")
        console.print(f"  URL: {url}")
    else:
        console.print("[dim]No base model uploaded[/dim]")


@app.command()
def download(
    target_dir: str = typer.Option(".", "--target-dir", "-C", help="Directory to save base model")
):
    """Download base model from current repository.
    
    Example:
      flair basemodel download
      flair basemodel download --target-dir ./models
    """
    repo = _get_current_repo()
    if not repo:
        console.print("[red]Not in a Flair repository[/red]")
        raise typer.Exit(code=1)
    
    repo_hash = repo.get("hash") or repo.get("repoHash")
    
    # Resolve target directory
    target_path = Path(target_dir)
    if not target_path.is_absolute():
        target_path = Path.cwd() / target_dir
    
    # Create directory if it doesn't exist
    target_path.mkdir(parents=True, exist_ok=True)
    
    success = download_base_model(repo_hash, target_path, verbose=True)
    if not success:
        raise typer.Exit(code=1)


@app.command()
def delete(
    confirm: bool = typer.Option(False, "--yes", "-y", help="Skip confirmation prompt")
):
    """Delete base model from current repository."""
    repo = _get_current_repo()
    if not repo:
        console.print("[red]Not in a Flair repository[/red]")
        raise typer.Exit(code=1)
    
    repo_hash = repo.get("hash") or repo.get("repoHash")
    
    # Check authorization
    if not _check_user_authorization(repo_hash):
        console.print("[red]Unauthorized. Only repository owner or admins can delete base models.[/red]")
        raise typer.Exit(code=1)
    
    # Check if model exists
    exists, _ = _check_base_model_exists(repo_hash)
    if not exists:
        console.print("[yellow]No base model to delete[/yellow]")
        return
    
    if not confirm:
        proceed = typer.confirm("Are you sure you want to delete the base model?", default=False)
        if not proceed:
            console.print("[dim]Deletion cancelled[/dim]")
            return
    
    try:
        api_client.delete_base_model(repo_hash)
        console.print("✓ Base model deleted", style="green")
    except Exception as e:
        console.print(f"[red]Failed to delete base model: {e}[/red]")
        raise typer.Exit(code=1)
