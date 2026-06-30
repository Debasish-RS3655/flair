"""
Commit command: Finalize the commit.json file with message and determine commit type.
Handles delta computation, full parameter reconstruction, and cleanup of old parameters.
"""
from __future__ import annotations
import typer
from rich.console import Console
from pathlib import Path
import json
import hashlib

from .utils.local_commits import _get_commit_by_hash, _get_head_info, _get_latest_local_commit
from .utils.architecture import ArchitectureMismatch, compute_architecture_hash, resolve_commit_type
from .utils.class_space import compute_class_space_hash
from .utils.param_io import _load_numpy_params as _shared_load_numpy_params
from .utils.param_io import _load_pytorch_params as _shared_load_pytorch_params
from .utils.param_io import _save_numpy_params as _shared_save_numpy_params
from .utils.param_io import _save_pytorch_params as _shared_save_pytorch_params
from .utils.reconstruction import _reconstruct_params_from_checkpoint as _shared_reconstruct_params_from_checkpoint

app = typer.Typer()
console = Console()


def _warn_param_io(message: str):
    console.print(f"[yellow]Warning: {message}[/yellow]")


def _load_pytorch_params(file_path: Path):
    return _shared_load_pytorch_params(file_path, warn=_warn_param_io)


def _load_numpy_params(file_path: Path):
    return _shared_load_numpy_params(file_path, warn=_warn_param_io)


def _save_pytorch_params(params, file_path: Path) -> bool:
    return _shared_save_pytorch_params(params, file_path, warn=_warn_param_io)


def _save_numpy_params(params: dict, file_path: Path) -> bool:
    return _shared_save_numpy_params(params, file_path, warn=_warn_param_io)


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


def _compute_pytorch_delta(
    current_params,
    previous_params,
    current_architecture_hash: str | None = None,
    previous_architecture_hash: str | None = None,
) -> dict | None:
    """Compute delta between current and previous PyTorch parameters."""
    try:
        import torch

        if current_architecture_hash and previous_architecture_hash:
            if current_architecture_hash != previous_architecture_hash:
                raise ArchitectureMismatch("Architecture changed; delta computation is not allowed.")

        delta = {}
        for key in current_params.keys():
            if key in previous_params:
                delta[key] = current_params[key] - previous_params[key]
            else:
                delta[key] = current_params[key]
        return delta
    except Exception as e:
        console.print(f"[yellow]Warning: Failed to compute PyTorch delta: {e}[/yellow]")
        return None


def _compute_numpy_delta(
    current_params: dict,
    previous_params: dict,
    current_architecture_hash: str | None = None,
    previous_architecture_hash: str | None = None,
) -> dict | None:
    """Compute delta between current and previous NumPy parameters."""
    try:
        import numpy as np

        if current_architecture_hash and previous_architecture_hash:
            if current_architecture_hash != previous_architecture_hash:
                raise ArchitectureMismatch("Architecture changed; delta computation is not allowed.")

        delta = {}
        for key in current_params.keys():
            if key in previous_params:
                delta[key] = current_params[key] - previous_params[key]
            else:
                delta[key] = current_params[key]
        return delta
    except Exception as e:
        console.print(f"[yellow]Warning: Failed to compute NumPy delta: {e}[/yellow]")
        return None


def _reconstruct_params_from_checkpoint(target_commit_hash: str, framework: str) -> tuple[dict, str] | None:
    """Reconstruct parameters by traversing back to checkpoint and applying deltas.

    Returns: (reconstructed_params, checkpoint_hash) or None if failed
    """
    return _shared_reconstruct_params_from_checkpoint(
        target_commit_hash,
        framework,
        info=lambda msg: console.print(f"[dim]{msg}[/dim]") if not msg.startswith("✓") else console.print(f"[green]{msg}[/green]"),
        warn=lambda msg: console.print(f"[yellow]Warning: {msg}[/yellow]"),
        include_checkpoint_hash=True,
    )


def _get_previous_full_params(previous_commit_hash: str, framework: str) -> dict | None:
    """Get or reconstruct previous commit's full parameters."""
    if previous_commit_hash == "_GENESIS_COMMIT_":
        return None
    
    # Try to get previous commit
    commit_result = _get_commit_by_hash(previous_commit_hash)
    if not commit_result:
        console.print(f"[yellow]Warning: Previous commit {previous_commit_hash[:16]}... not found[/yellow]")
        return None
    
    commit_data, commit_dir = commit_result
    
    # Check if full params exist
    params_info = commit_data.get("params")
    if params_info and params_info.get("file"):
        params_file = commit_dir / params_info["file"]
        if params_file.exists():
            console.print(f"[dim]Loading previous full params[/dim]")
            if framework == "pytorch":
                return _load_pytorch_params(params_file)
            else:
                return _load_numpy_params(params_file)
    
    # Full params missing, need to reconstruct
    console.print(f"[dim]Previous commit full params not found, reconstructing...[/dim]")
    result = _reconstruct_params_from_checkpoint(previous_commit_hash, framework)
    if result:
        reconstructed_params, _ = result
        return reconstructed_params
    
    return None


def _cleanup_old_full_params() -> int:
    """Delete full params from old DELTA commits, keeping only latest two commits.
    
    Returns: Number of commits cleaned
    """
    flair_dir = Path.cwd() / ".flair"
    local_commits_dir = flair_dir / ".local_commits"
    
    if not local_commits_dir.exists():
        return 0
    
    head_info = _get_head_info()
    if not head_info:
        return 0
    
    # Get the two most recent commits (previous and current being worked on)
    all_commits = sorted(local_commits_dir.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True)
    
    if len(all_commits) < 3:  # Nothing to clean if less than 3 commits
        return 0
    
    keep_commits = set()
    cleaned_count = 0
    
    # Keep the 2 most recent
    for i in range(min(2, len(all_commits))):
        commit_dir = all_commits[i]
        commit_file = commit_dir / "commit.json"
        if commit_file.exists():
            with open(commit_file, 'r') as f:
                commit_data = json.load(f)
                keep_commits.add(commit_dir.name)
    
    # Clean older DELTA commits (keep all CHECKPOINT)
    for i in range(2, len(all_commits)):
        commit_dir = all_commits[i]
        commit_file = commit_dir / "commit.json"
        
        if not commit_file.exists():
            continue
        
        with open(commit_file, 'r') as f:
            commit_data = json.load(f)
        
        # Only clean DELTA commits, keep CHECKPOINT
        if commit_data.get("commitType") != "DELTA":
            keep_commits.add(commit_dir.name)
            continue
        
        # Check if params file exists and delete it
        params_info = commit_data.get("params")
        if params_info and params_info.get("file"):
            params_file = commit_dir / params_info["file"]
            if params_file.exists():
                try:
                    params_file.unlink()
                    cleaned_count += 1
                    console.print(f"[dim]Cleaned full params from {commit_dir.name[:8]}...[/dim]")
                except Exception as e:
                    console.print(f"[yellow]Warning: Failed to delete {params_file}: {e}[/yellow]")
    
    return cleaned_count


def _compute_file_hash(file_path: Path) -> str:
    """Compute SHA256 hash of a file."""
    sha256 = hashlib.sha256()
    with open(file_path, 'rb') as f:
        for chunk in iter(lambda: f.read(8192), b''):
            sha256.update(chunk)
    return sha256.hexdigest()


def _load_staged_metrics(flair_dir: Path) -> dict | None:
    """Load staged metrics from .flair/metrics.json when present."""
    metrics_file = flair_dir / "metrics.json"
    if not metrics_file.exists():
        return None

    try:
        with open(metrics_file, "r") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            console.print("[yellow]Warning: .flair/metrics.json is not a JSON object; ignoring staged metrics.[/yellow]")
            return None
        return data
    except Exception as e:
        console.print(f"[yellow]Warning: Failed to read .flair/metrics.json: {e}[/yellow]")
        return None


def _delete_staged_metrics(flair_dir: Path) -> None:
    """Delete staged metrics file after successful commit finalization."""
    metrics_file = flair_dir / "metrics.json"
    if not metrics_file.exists():
        return
    try:
        metrics_file.unlink()
        console.print("[dim]Cleared staged metrics (.flair/metrics.json)[/dim]")
    except Exception as e:
        console.print(f"[yellow]Warning: Commit finalized but failed to delete staged metrics: {e}[/yellow]")


@app.command()
def finalize(
    message: str = typer.Option("Update model", "-m", "--message", help="Commit message")
):
    """Finalize the commit.json file with message and determine commit type.
    
    Determines whether this is a CHECKPOINT (genesis/first) commit or a DELTA (subsequent) commit.
    For DELTA commits, computes parameter differences from previous commit.
    
    - CHECKPOINT: First commit in repository, stores full parameters
    - DELTA: Subsequent commits, stores delta + full params, cleans up old full params
    
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
        
        # Determine commit type: CHECKPOINT for genesis or when architecture changes.
        framework = commit_data.get("architecture", "pytorch").lower()
        head_info = _get_head_info()
        previous_commit_hash = head_info.get("previousCommit") if head_info else "_GENESIS_COMMIT_"

        current_architecture_hash = commit_data.get("architectureHash")
        previous_architecture_hash = commit_data.get("previousArchitectureHash")
        architecture_changed = bool(commit_data.get("architectureChanged"))
        current_class_space = commit_data.get("classSpace")
        current_class_space_hash = commit_data.get("classSpaceHash")
        previous_class_space_hash = commit_data.get("previousClassSpaceHash")
        class_space_changed = bool(commit_data.get("classSpaceChanged"))

        if current_class_space_hash is None and isinstance(current_class_space, list) and current_class_space:
            current_class_space_hash = compute_class_space_hash(current_class_space)

        if not current_class_space_hash:
            console.print("[red]✗ Missing class-space metadata on commit.[/red]")
            console.print("[yellow]Run 'flair params create --classes ...' to set class-space contract.[/yellow]")
            raise typer.Exit(code=1)

        if not current_architecture_hash:
            params_info = commit_data.get("params")
            if not params_info or not params_info.get("file"):
                console.print("[red]✗ Current params info missing[/red]")
                raise typer.Exit(code=1)

            current_params_file = commit_dir / params_info["file"]
            if not current_params_file.exists():
                console.print(f"[red]✗ Current params file not found: {current_params_file}[/red]")
                raise typer.Exit(code=1)

            if framework == "pytorch":
                current_params = _load_pytorch_params(current_params_file)
            else:
                current_params = _load_numpy_params(current_params_file)

            if current_params is None:
                raise typer.Exit(code=1)

            current_architecture_hash = compute_architecture_hash(
                current_params,
                framework=framework,
                metadata={"classSpace": current_class_space, "classSpaceHash": current_class_space_hash},
            )

        if previous_commit_hash and previous_commit_hash != "_GENESIS_COMMIT_" and not previous_architecture_hash:
            previous_commit_result = _get_commit_by_hash(previous_commit_hash)
            if previous_commit_result:
                previous_commit_data, previous_commit_dir = previous_commit_result
                previous_architecture_hash = previous_commit_data.get("architectureHash")
                if not previous_class_space_hash:
                    previous_class_space_hash = previous_commit_data.get("classSpaceHash")
                    previous_class_space = previous_commit_data.get("classSpace")
                    if not previous_class_space_hash and isinstance(previous_class_space, list) and previous_class_space:
                        previous_class_space_hash = compute_class_space_hash(previous_class_space)
                if not previous_architecture_hash:
                    previous_params_info = previous_commit_data.get("params")
                    if previous_params_info and previous_params_info.get("file"):
                        previous_params_file = previous_commit_dir / previous_params_info["file"]
                        if previous_params_file.exists():
                            if framework == "pytorch":
                                previous_params = _load_pytorch_params(previous_params_file)
                            else:
                                previous_params = _load_numpy_params(previous_params_file)
                            if previous_params is not None:
                                previous_architecture_hash = compute_architecture_hash(
                                    previous_params,
                                    framework=framework,
                                    metadata={
                                        "classSpaceHash": previous_class_space_hash,
                                    },
                                )

        if previous_class_space_hash and current_class_space_hash != previous_class_space_hash:
            class_space_changed = True
            architecture_changed = True

        if class_space_changed:
            console.print("[yellow]⚠ Class-space change detected: finalizing as CHECKPOINT.[/yellow]")
            console.print(f"[yellow]  Current class-space hash: {current_class_space_hash[:16]}...[/yellow]")
            if previous_class_space_hash:
                console.print(f"[yellow]  Previous class-space hash: {previous_class_space_hash[:16]}...[/yellow]")

        inferred_commit_type, inferred_architecture_changed = resolve_commit_type(
            current_architecture_hash,
            previous_architecture_hash if previous_commit_hash and previous_commit_hash != "_GENESIS_COMMIT_" else None,
        )
        architecture_changed = architecture_changed or inferred_architecture_changed
        commit_type = "CHECKPOINT" if architecture_changed else inferred_commit_type

        console.print(f"\n[cyan]Finalizing {commit_type} commit...[/cyan]")

        if architecture_changed:
            console.print("[yellow]⚠ Architecture change detected: finalizing as CHECKPOINT.[/yellow]")
            console.print(f"[yellow]  Current architecture hash: {current_architecture_hash[:16]}...[/yellow]")
            if previous_architecture_hash:
                console.print(f"[yellow]  Previous architecture hash: {previous_architecture_hash[:16]}...[/yellow]")

        # For DELTA commits, compute delta from previous.
        if commit_type == "DELTA":
            if previous_commit_hash and previous_commit_hash != "_GENESIS_COMMIT_":
                console.print(f"[dim]Previous commit: {previous_commit_hash[:16]}...[/dim]")

                params_info = commit_data.get("params")
                if not params_info or not params_info.get("file"):
                    console.print("[red]✗ Current params info missing[/red]")
                    raise typer.Exit(code=1)

                current_params_file = commit_dir / params_info["file"]
                if not current_params_file.exists():
                    console.print(f"[red]✗ Current params file not found: {current_params_file}[/red]")
                    raise typer.Exit(code=1)

                if framework == "pytorch":
                    current_params = _load_pytorch_params(current_params_file)
                else:
                    current_params = _load_numpy_params(current_params_file)

                if current_params is None:
                    raise typer.Exit(code=1)

                previous_params = _get_previous_full_params(previous_commit_hash, framework)

                if previous_params is None:
                    console.print("[red]✗ Could not get or reconstruct previous parameters[/red]")
                    raise typer.Exit(code=1)

                console.print("[dim]Computing delta...[/dim]")
                try:
                    if framework == "pytorch":
                        delta_params = _compute_pytorch_delta(
                            current_params,
                            previous_params,
                            current_architecture_hash,
                            previous_architecture_hash,
                        )
                    else:
                        delta_params = _compute_numpy_delta(
                            current_params,
                            previous_params,
                            current_architecture_hash,
                            previous_architecture_hash,
                        )
                except ArchitectureMismatch:
                    console.print("[yellow]⚠ Architecture mismatch detected; finalizing as CHECKPOINT instead of DELTA.[/yellow]")
                    architecture_changed = True
                    commit_type = "CHECKPOINT"
                    delta_params = None

                if delta_params is None:
                    if architecture_changed:
                        console.print("[yellow]Architecture changed; delta generation skipped.[/yellow]")
                    else:
                        raise typer.Exit(code=1)
                elif not architecture_changed:
                    delta_dir = commit_dir / ".delta_params"
                    delta_dir.mkdir(exist_ok=True)

                    if framework == "pytorch":
                        delta_file = delta_dir / "delta.pt"
                        success = _save_pytorch_params(delta_params, delta_file)
                    else:
                        delta_file = delta_dir / "delta.npz"
                        success = _save_numpy_params(delta_params, delta_file)

                    if not success:
                        raise typer.Exit(code=1)

                    delta_hash = _compute_file_hash(delta_file)
                    size_mb = delta_file.stat().st_size / (1024 * 1024)

                    console.print(f"[green]✓ Delta computed and saved[/green]")
                    console.print(f"  File: {delta_file.name}")
                    console.print(f"  Size: {size_mb:.2f} MB")
                    console.print(f"  Hash: {delta_hash[:16]}...")

                    commit_data["deltaParams"] = {
                        "file": delta_file.name,
                        "hash": delta_hash,
                        "previousCommitHash": previous_commit_hash,
                    }
        
        # Update commit.json with message and commitType
        commit_data["architectureHash"] = current_architecture_hash
        commit_data["previousArchitectureHash"] = previous_architecture_hash
        commit_data["architectureChanged"] = architecture_changed
        commit_data["classSpaceHash"] = current_class_space_hash
        commit_data["previousClassSpaceHash"] = previous_class_space_hash
        commit_data["classSpaceChanged"] = class_space_changed
        commit_data["message"] = message
        commit_data["commitType"] = commit_type

        if commit_type == "CHECKPOINT" and architecture_changed:
            commit_data["deltaParams"] = None

        staged_metrics = _load_staged_metrics(flair_dir)
        if staged_metrics is not None:
            commit_data["metrics"] = staged_metrics
        
        commit_file = commit_dir / "commit.json"
        with open(commit_file, 'w') as f:
            json.dump(commit_data, f, indent=2)
        
        # Clean up old full params from DELTA commits
        if commit_type == "DELTA":
            console.print("\n[dim]Cleaning up old full parameters...[/dim]")
            cleaned = _cleanup_old_full_params()
            if cleaned > 0:
                console.print(f"[dim]Cleaned {cleaned} commit(s)[/dim]")
        
        console.print(f"\n[green]✓ Commit finalized[/green]")
        console.print(f"  Commit hash: {commit_hash[:16]}...")
        console.print(f"  Commit type: {commit_type}")
        console.print(f"  Message: {message}")
        
        if commit_type == "CHECKPOINT":
            console.print(f"  [dim]Uploading: full parameters (params)[/dim]")
            if architecture_changed:
                console.print("  [yellow]Architecture changed: uploaded as a full checkpoint.[/yellow]")
        else:
            console.print(f"  [dim]Uploading: delta parameters (delta_params)[/dim]")
            console.print(f"  [dim]Retained: full parameters (for reconstruction)[/dim]")

        _delete_staged_metrics(flair_dir)
        
        console.print(f"\n[dim]Next step:[/dim]")
        console.print(f"  Run 'flair push' to upload commit to repository")
        
    except typer.Exit:
        raise
    except Exception as e:
        console.print(f"[red]✗ Failed to finalize commit: {str(e)}[/red]")
        raise typer.Exit(code=1)
