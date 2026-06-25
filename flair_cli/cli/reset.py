"""
Reset command: Move HEAD back to a previous local commit.
Discards unpushed commits and restores working model parameters.
"""
from __future__ import annotations
import typer
from rich.console import Console
from pathlib import Path
import json
import shutil
import re

from .utils.local_commits import _get_commit_by_hash, _get_flair_dir, _get_head_info
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


def _reconstruct_params_from_checkpoint(target_commit_hash: str, framework: str) -> dict | None:
    """Reconstruct parameters by traversing back to checkpoint and applying deltas."""
    return _shared_reconstruct_params_from_checkpoint(
        target_commit_hash,
        framework,
        info=lambda msg: console.print(f"[dim]{msg}[/dim]") if not msg.startswith("✓") else console.print(f"[green]{msg}[/green]"),
        warn=lambda msg: console.print(f"[yellow]Warning: {msg}[/yellow]"),
    )


def _get_target_full_params(target_commit_hash: str, framework: str) -> dict | None:
    """Get or reconstruct target commit's full parameters."""
    if target_commit_hash == "_GENESIS_COMMIT_":
        return None
    
    # Try to get target commit
    commit_result = _get_commit_by_hash(target_commit_hash)
    if not commit_result:
        console.print(f"[yellow]Warning: Target commit {target_commit_hash[:16]}... not found[/yellow]")
        return None
    
    commit_data, commit_dir = commit_result
    
    # Check if full params exist
    params_info = commit_data.get("params")
    if params_info and params_info.get("file"):
        params_file = commit_dir / params_info["file"]
        if params_file.exists():
            console.print(f"[dim]Loading target full params[/dim]")
            if framework == "pytorch":
                return _load_pytorch_params(params_file)
            else:
                return _load_numpy_params(params_file)
    
    # Full params missing, need to reconstruct
    console.print(f"[dim]Target full params not found, reconstructing...[/dim]")
    return _reconstruct_params_from_checkpoint(target_commit_hash, framework)


def _count_head_distance(current_hash: str) -> int:
    """Count how many commits we can go back from current hash (for validation)."""
    count = 0
    current = current_hash
    
    while current and current != "_GENESIS_COMMIT_":
        commit_result = _get_commit_by_hash(current)
        if not commit_result:
            break
        commit_data, _ = commit_result
        count += 1
        current = commit_data.get("previousCommitHash")
    
    return count


def _traverse_to_target(current_hash: str, target_index: int) -> str | None:
    """Traverse backwards from current_hash by target_index steps.
    
    Returns: commit hash at target_index steps back, or None if not enough commits
    """
    current = current_hash
    steps = 0
    
    while steps < target_index and current and current != "_GENESIS_COMMIT_":
        commit_result = _get_commit_by_hash(current)
        if not commit_result:
            return None
        commit_data, _ = commit_result
        current = commit_data.get("previousCommitHash")
        steps += 1
    
    if steps != target_index:
        return None
    
    return current


def _restore_working_params(target_params: dict, framework: str) -> bool:
    """Restore working directory model parameters.
    
    Saves parameters to the model file in current directory.
    """
    console.print("[dim]Restoring working model parameters...[/dim]")
    
    try:
        # Detect model files in current directory
        if framework == "pytorch":
            model_files = list(Path.cwd().glob("*.pt")) + list(Path.cwd().glob("*.pth"))
        else:  # numpy/tensorflow
            model_files = list(Path.cwd().glob("*.npy")) + list(Path.cwd().glob("*.npz"))
        
        if not model_files:
            console.print("[yellow]⚠ No model files found in current directory[/yellow]")
            console.print("[yellow]  Parameters loaded but not saved to working directory[/yellow]")
            return True  # Not a failure, just a warning
        
        # Update the first model file found
        target_file = model_files[0]
        console.print(f"[dim]Updating model file: {target_file.name}[/dim]")
        
        if framework == "pytorch":
            success = _save_pytorch_params(target_params, target_file)
        else:
            success = _save_numpy_params(target_params, target_file)
        
        if success:
            console.print(f"[green]✓ Working model restored[/green]")
            return True
        else:
            console.print("[red]✗ Failed to restore working model parameters[/red]")
            return False
            
    except Exception as e:
        console.print(f"[yellow]⚠ Could not restore working model: {e}[/yellow]")
        return True  # Don't fail hard on this


@app.command()
def reset(
    target: str = typer.Argument("HEAD~1", help="Target commit (e.g., HEAD~2, HEAD~1)"),
    hard: bool = typer.Option(False, "--hard", help="Hard reset (discard local commits)"),
    to_remote: bool = typer.Option(False, "--to-remote", help="Reset to REMOTE_HEAD")
):
    """Reset HEAD to a previous local commit.
    
    Discards unpushed commits and restores working model parameters.
    Can only reset to unpushed commits (cannot go before REMOTE_HEAD).
    
    In v1, only supports resetting to recent local commits via HEAD~N syntax.
    
    Behavior:
    - `flair reset` defaults to `flair reset --hard HEAD~1`
    - `flair reset --hard HEAD~N` moves HEAD back by N commits
    - `flair reset --to-remote` moves HEAD to REMOTE_HEAD, discards all unpushed commits
    
    Examples:
      flair reset              # Undo latest commit (default)
      flair reset --hard HEAD~1  # Explicit HEAD~1
      flair reset --hard HEAD~3  # Go back 3 commits
      flair reset --to-remote  # Discard all unpushed commits
    """
    try:
        flair_dir = _get_flair_dir()
        
        # Get current HEAD
        head_info = _get_head_info()
        if not head_info:
            console.print("[red]No commits found.[/red]")
            raise typer.Exit(code=1)
        
        current_head_hash = head_info.get("latestCommitHash") or head_info.get("previousCommit")
        if not current_head_hash:
            console.print("[red]Could not determine current HEAD.[/red]")
            raise typer.Exit(code=1)
        
        # Get REMOTE_HEAD (previously pushed commit)
        # In the current architecture, REMOTE_HEAD is implicit from push history
        # For reset purposes, we need to get the last successfully pushed commit
        # This is typically the previousCommit from a fresh clone, or tracked elsewhere
        # For now, we check if there's a remote tracking, but in simple case, 
        # we can infer it from the push log or just use genesis as fallback
        
        console.print("\n[cyan]Analyzing reset target...[/cyan]\n")
        
        # Determine target commit hash
        target_commit_hash = None
        
        if to_remote:
            # Reset to remote HEAD
            # Get the remote head - this is stored in HEAD when we fetch/push
            # For MVP, assume REMOTE_HEAD is tracked in the branch or we read from last successful push
            # Check if there's a .flair/REMOTE_HEAD or similar tracking
            remote_head_file = flair_dir / "REMOTE_HEAD"
            if remote_head_file.exists():
                try:
                    with open(remote_head_file, 'r') as f:
                        remote_head_data = json.load(f)
                        target_commit_hash = remote_head_data.get("latestCommitHash")
                except Exception:
                    pass
            
            if not target_commit_hash:
                console.print("[red]✗ Remote HEAD not found.[/red]")
                console.print("[yellow]Cannot determine which commits are unpushed.[/yellow]")
                raise typer.Exit(code=1)
            
            console.print(f"[dim]Target: REMOTE_HEAD = {target_commit_hash[:16]}...[/dim]")
        
        else:
            # Parse HEAD~N syntax
            match = re.match(r'^HEAD~(\d+)$', target)
            if not match:
                console.print(f"[red]✗ Invalid target syntax: '{target}'[/red]")
                console.print("[yellow]Use HEAD~N where N is the number of commits to go back.[/yellow]")
                raise typer.Exit(code=1)
            
            steps_back = int(match.group(1))
            
            if steps_back <= 0:
                console.print("[red]✗ Must go back at least 1 commit.[/red]")
                raise typer.Exit(code=1)
            
            # Validate we have enough commits
            distance = _count_head_distance(current_head_hash)
            if steps_back > distance:
                console.print(f"[red]✗ Cannot go back {steps_back} commits.[/red]")
                console.print(f"[yellow]Only {distance} commit(s) available locally.[/yellow]")
                raise typer.Exit(code=1)
            
            # Traverse to target
            target_commit_hash = _traverse_to_target(current_head_hash, steps_back)
            if not target_commit_hash:
                console.print(f"[red]✗ Could not resolve HEAD~{steps_back}[/red]")
                raise typer.Exit(code=1)
            
            console.print(f"[dim]Target: HEAD~{steps_back} = {target_commit_hash[:16]}...[/dim]")
        
        # Validate target is not before REMOTE_HEAD
        remote_head_file = flair_dir / "REMOTE_HEAD"
        if remote_head_file.exists():
            try:
                with open(remote_head_file, 'r') as f:
                    remote_head_data = json.load(f)
                    remote_head_hash = remote_head_data.get("latestCommitHash")
                    
                    # Check if target is before remote head
                    if remote_head_hash and target_commit_hash != remote_head_hash:
                        # Traverse forward from remote_head to see if we reach target
                        # If we can't reach target by going forward from remote_head, target is before remote_head
                        check_hash = remote_head_hash
                        found = False
                        
                        for _ in range(100):  # Reasonable limit
                            if check_hash == target_commit_hash:
                                found = True
                                break
                            
                            commit_result = _get_commit_by_hash(check_hash)
                            if not commit_result:
                                break
                            
                            commit_data, _ = commit_result
                            next_hash = commit_data.get("previousCommitHash")
                            
                            # Try to find next commit in local history
                            check_hash = next_hash
                            if not check_hash or check_hash == "_GENESIS_COMMIT_":
                                break
                        
                        # Actually, better logic: if target is reached by going backwards from current,
                        # and current is reached by going forward from remote_head, then target is >= remote_head
                        # Check if target >= remote_head by counting distance from remote
                        check_hash = current_head_hash
                        found_target_before_remote = False
                        
                        for _ in range(100):
                            if check_hash == target_commit_hash:
                                # Found target before reaching remote (or at remote)
                                break
                            if check_hash == remote_head_hash:
                                # Reached remote before finding target = target is behind remote
                                found_target_before_remote = True
                                break
                            
                            commit_result = _get_commit_by_hash(check_hash)
                            if not commit_result:
                                break
                            
                            commit_data, _ = commit_result
                            check_hash = commit_data.get("previousCommitHash")
                            if not check_hash or check_hash == "_GENESIS_COMMIT_":
                                break
                        
                        if found_target_before_remote:
                            console.print(f"[red]✗ Cannot reset to {target_commit_hash[:16]}...[/red]")
                            console.print(f"[yellow]Target is before REMOTE_HEAD {remote_head_hash[:16]}...[/yellow]")
                            console.print("[yellow]Can only reset within unpushed commits.[/yellow]")
                            raise typer.Exit(code=1)
            except Exception as e:
                console.print(f"[yellow]⚠ Warning: Could not validate against remote: {e}[/yellow]")
                pass
        
        console.print(f"[dim]Current HEAD: {current_head_hash[:16]}...[/dim]\n")
        
        # Collect commits to delete (from current, going back to but not including target)
        console.print("[cyan]Step 1/4: Collecting commits to delete...[/cyan]")
        commits_to_delete = []
        check_hash = current_head_hash
        
        while check_hash and check_hash != target_commit_hash and check_hash != "_GENESIS_COMMIT_":
            commits_to_delete.append(check_hash)
            
            commit_result = _get_commit_by_hash(check_hash)
            if not commit_result:
                break
            
            commit_data, _ = commit_result
            check_hash = commit_data.get("previousCommitHash")
        
        if not commits_to_delete:
            console.print("[yellow]No commits to delete.[/yellow]")
            raise typer.Exit(code=0)
        
        console.print(f"[green]✓ Will delete {len(commits_to_delete)} commit(s):[/green]")
        for commit_hash in commits_to_delete:
            console.print(f"  [dim]• {commit_hash[:16]}...[/dim]")
        
        print()
        
        # Load target commit to get framework and parameters before deletion
        console.print("[cyan]Step 2/4: Loading target commit state...[/cyan]")
        target_commit_result = _get_commit_by_hash(target_commit_hash)
        if not target_commit_result:
            console.print(f"[red]✗ Target commit not found: {target_commit_hash[:16]}...[/red]")
            raise typer.Exit(code=1)
        
        target_commit_data, target_commit_dir = target_commit_result
        framework = target_commit_data.get("architecture", "pytorch").lower()
        
        # Get target commit's full parameters
        target_params = _get_target_full_params(target_commit_hash, framework)
        if target_params is None:
            console.print("[red]✗ Failed to load or reconstruct target parameters[/red]")
            raise typer.Exit(code=1)
        
        console.print(f"[green]✓ Target commit state loaded[/green]")
        console.print(f"  Parameters: {len(target_params)} items\n")
        
        # Delete local commit directories
        console.print("[cyan]Step 3/4: Deleting local commits...[/cyan]")
        local_commits_dir = flair_dir / ".local_commits"
        deleted_count = 0
        
        for commit_hash in commits_to_delete:
            commit_dir = local_commits_dir / commit_hash
            if commit_dir.exists():
                try:
                    shutil.rmtree(commit_dir)
                    deleted_count += 1
                    console.print(f"  [dim]✓ Deleted {commit_hash[:16]}...[/dim]")
                except Exception as e:
                    console.print(f"  [red]✗ Failed to delete {commit_hash[:16]}...: {e}[/red]")
                    raise typer.Exit(code=1)
        
        console.print(f"[green]✓ Deleted {deleted_count} local commit(s)[/green]\n")
        
        # Restore working model parameters
        console.print("[cyan]Step 4/4: Restoring working model...[/cyan]")
        if not _restore_working_params(target_params, framework):
            console.print("[red]✗ Failed to restore working model[/red]")
            raise typer.Exit(code=1)
        
        print()
        
        # Update HEAD to target
        new_head_data = {
            "currentBranch": head_info.get("currentBranch", "main"),
            "branchHash": head_info.get("branchHash"),
            "latestCommitHash": target_commit_hash,
            "previousCommit": target_commit_hash
        }
        
        head_file = flair_dir / "HEAD"
        with open(head_file, 'w') as f:
            json.dump(new_head_data, f, indent=2)
        
        console.print("[bold green]═══════════════════════════════════[/bold green]")
        console.print(f"[bold green]✓ Reset successful![/bold green]")
        console.print("[bold green]═══════════════════════════════════[/bold green]\n")
        console.print(f"[green]Deleted {len(commits_to_delete)} unpushed commit(s)[/green]")
        console.print(f"[green]HEAD moved to: {target_commit_hash[:16]}...[/green]")
        console.print(f"[green]Working model restored to target state[/green]\n")
        
    except typer.Exit:
        raise
    except Exception as e:
        console.print(f"[red]✗ Reset failed: {str(e)}[/red]")
        raise typer.Exit(code=1)
