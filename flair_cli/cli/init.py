"""
Initialize a Flair repository in the current directory.
Creates a .flair folder and registers the repository with the backend.
"""

from __future__ import annotations
import typer
from rich.console import Console
from pathlib import Path
import json

from ..api import client as api_client
from ..core.config import ALLOWED_BASE_MODEL_EXTENSIONS

app = typer.Typer()
console = Console()

def _find_base_model_files() -> list[Path]:
    """Find base model files in current directory."""
    files = []
    for ext in ALLOWED_BASE_MODEL_EXTENSIONS:
        files.extend(Path.cwd().glob(f"*{ext}"))
    return files


@app.command()
def init(
    name: str = typer.Option(None, help="Repository name (defaults to current folder name)"),
    description: str = typer.Option("", help="Short description"),
    use_case: str = typer.Option("General", "--use-case", help="Use case description"),
    framework: str = typer.Option("PyTorch", help="ML framework (PyTorch / TensorFlow / Tensorflow)"),
    skip_base_model: bool = typer.Option(False, "--skip-base-model", help="Skip base model upload prompt")
):
    """Initialize a new Flair repository in the current directory."""
    flair_dir = Path.cwd() / ".flair"

    # If already initialized, show repo info and exit
    if flair_dir.exists():
        console.print("[yellow]✓ This directory is already initialized as a Flair repository[/yellow]")
        repo_file = flair_dir / "repo.json"
        if repo_file.exists():
            try:
                with open(repo_file, "r") as f:
                    repo_data = json.load(f)
                console.print(f"Repository: {repo_data.get('name')} (ID: {repo_data.get('id')})")
            except Exception:
                console.print("[dim]Existing .flair/repo.json could not be read[/dim]")
        return

    # Default repo name to current folder name
    if not name:
        name = Path.cwd().name
        console.print(f"[dim]Using current folder name as repository name: {name}[/dim]")

    payload = {
        "metadata": {
            "description": description,
            "useCase": use_case,
            "framework": framework
        },
        "name": name
    }

    try:
        resp = api_client.create_repo(payload)

        flair_dir.mkdir(exist_ok=True)
        repo_file = flair_dir / "repo.json"
        with open(repo_file, "w") as f:
            json.dump(resp, f, indent=2)

        settings_file = Path.cwd() / "config.yaml"
        if not settings_file.exists():
            settings_content = "commitRetentionLimit: 25\n"
            with open(settings_file, "w") as f:
                f.write(settings_content)

        console.print("✓ Repository initialized successfully!", style="green")
        console.print(f"  Name: {resp.get('name')}")
        console.print(f"  Hash: {resp.get('repoHash')}")
        console.print(f"  Location: {flair_dir}")
        
        # Check for base model files and prompt to upload
        if not skip_base_model:
            base_model_files = _find_base_model_files()
            if base_model_files:
                console.print(f"\n[cyan]Found {len(base_model_files)} base model file(s) in current directory:[/cyan]")
                for idx, file in enumerate(base_model_files, 1):
                    console.print(f"  {idx}. {file.name}")
                
                upload = typer.confirm("\nWould you like to upload a base model now?", default=False)
                if upload:
                    if len(base_model_files) == 1:
                        selected_file = base_model_files[0]
                    else:
                        selection = typer.prompt(
                            f"Select file number (1-{len(base_model_files)})",
                            type=int,
                            default=1
                        )
                        if 1 <= selection <= len(base_model_files):
                            selected_file = base_model_files[selection - 1]
                        else:
                            console.print("[yellow]Invalid selection, skipping base model upload[/yellow]")
                            return
                    
                    # Upload the selected base model
                    try:
                        from . import basemodel
                        repo_hash = resp.get("repoHash")
                        success = basemodel.upload_base_model(repo_hash, selected_file, force=True)
                        if not success:
                            console.print("[yellow]Base model upload failed, but repository is initialized[/yellow]")
                    except Exception as e:
                        console.print(f"[yellow]Could not upload base model: {e}[/yellow]")
                        console.print("[dim]You can upload it later with: flair basemodel add_base <filename>[/dim]")
        
    except Exception as e:
        console.print(f"Failed to initialize repository: {e}", style="bold red")
        raise typer.Exit(code=1)
