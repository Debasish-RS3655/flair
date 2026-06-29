"""
Params command: Extract and create model parameters for a commit.
"""
from __future__ import annotations
import typer
from rich.console import Console
from pathlib import Path
import json
import hashlib

from .utils.local_commits import _get_commit_by_hash, _get_head_info, _get_latest_local_commit
from .utils.architecture import ArchitectureMismatch, compute_architecture_hash
from .utils.param_io import _load_numpy_params as _shared_load_numpy_params
from .utils.param_io import _load_pytorch_params as _shared_load_pytorch_params
from .utils.class_space import (
    ClassSpaceMismatch,
    compute_class_space_hash,
    ensure_class_space_contract,
    load_class_space_from_file,
    parse_class_space_option,
)

app = typer.Typer()
console = Console()


def _warn_param_io(message: str):
    console.print(f"[yellow]Warning: {message}[/yellow]")


def _load_params_from_file(file_path: Path, framework: str):
    if framework == "pytorch":
        return _shared_load_pytorch_params(file_path, warn=_warn_param_io)
    return _shared_load_numpy_params(file_path, warn=_warn_param_io)


def _detect_model_files() -> list[Path]:
    """Detect model files in current directory."""
    model_extensions = [
        "*.pt", "*.pth",  # PyTorch
        "*.h5", "*.keras",  # TensorFlow/Keras
        "*.onnx",  # ONNX
        "*.pb",  # TensorFlow SavedModel
    ]
    
    found_files = []
    for pattern in model_extensions:
        found_files.extend(Path.cwd().glob(pattern))
    
    return sorted(found_files)


def _detect_framework(model_path: Path) -> str | None:
    """Detect model framework from file extension."""
    ext = model_path.suffix.lower()
    
    if ext in [".pt", ".pth"]:
        return "pytorch"
    elif ext in [".h5", ".keras"]:
        return "tensorflow"
    elif ext == ".onnx":
        return "onnx"
    elif ext == ".pb":
        return "tensorflow"
    
    return None


def _extract_pytorch_weights(model_path: Path, output_path: Path) -> bool:
    """Extract weights from PyTorch model."""
    try:
        import torch
        
        console.print(f"[dim]Loading PyTorch model from {model_path.name}...[/dim]")
        
        # Load the model
        checkpoint = torch.load(model_path, map_location="cpu")
        
        # Extract state dict (could be direct state_dict or nested in checkpoint)
        if isinstance(checkpoint, dict):
            if "state_dict" in checkpoint:
                state_dict = checkpoint["state_dict"]
            elif "model_state_dict" in checkpoint:
                state_dict = checkpoint["model_state_dict"]
            else:
                # Assume the dict itself is the state dict
                state_dict = checkpoint
        else:
            # Model object itself
            if hasattr(checkpoint, "state_dict"):
                state_dict = checkpoint.state_dict()
            else:
                console.print("[red]Could not extract state dict from model[/red]")
                return False
        
        # Save extracted weights
        console.print(f"[dim]Extracting {len(state_dict)} parameters...[/dim]")
        torch.save(state_dict, output_path)
        
        size_mb = output_path.stat().st_size / (1024 * 1024)
        console.print(f"[green]✓ PyTorch weights extracted ({size_mb:.2f} MB)[/green]")
        return True
        
    except ImportError:
        console.print("[red]PyTorch not installed. Install with: pip install torch[/red]")
        return False
    except Exception as e:
        console.print(f"[red]Failed to extract PyTorch weights: {e}[/red]")
        return False


def _extract_tensorflow_weights(model_path: Path, output_path: Path) -> bool:
    """Extract weights from TensorFlow/Keras model."""
    try:
        import tensorflow as tf
        import numpy as np
        
        console.print(f"[dim]Loading TensorFlow model from {model_path.name}...[/dim]")
        
        # Load the model
        model = tf.keras.models.load_model(model_path)
        
        # Extract weights as numpy arrays
        weights = model.get_weights()
        
        console.print(f"[dim]Extracting {len(weights)} weight arrays...[/dim]")
        
        # Save weights as numpy arrays
        np.savez(output_path.with_suffix('.npz'), *weights)
        
        size_mb = output_path.with_suffix('.npz').stat().st_size / (1024 * 1024)
        console.print(f"[green]✓ TensorFlow weights extracted ({size_mb:.2f} MB)[/green]")
        return True
        
    except ImportError:
        console.print("[red]TensorFlow not installed. Install with: pip install tensorflow[/red]")
        return False
    except Exception as e:
        console.print(f"[red]Failed to extract TensorFlow weights: {e}[/red]")
        return False


def _extract_onnx_weights(model_path: Path, output_path: Path) -> bool:
    """Extract weights from ONNX model."""
    try:
        import onnx
        import numpy as np
        
        console.print(f"[dim]Loading ONNX model from {model_path.name}...[/dim]")
        
        # Load the ONNX model
        model = onnx.load(str(model_path))
        
        # Extract initializers (weights)
        weights = {}
        for initializer in model.graph.initializer:
            weights[initializer.name] = onnx.numpy_helper.to_array(initializer)
        
        console.print(f"[dim]Extracting {len(weights)} parameters...[/dim]")
        
        # Save weights as numpy arrays
        np.savez(output_path.with_suffix('.npz'), **weights)
        
        size_mb = output_path.with_suffix('.npz').stat().st_size / (1024 * 1024)
        console.print(f"[green]✓ ONNX weights extracted ({size_mb:.2f} MB)[/green]")
        return True
        
    except ImportError:
        console.print("[red]ONNX not installed. Install with: pip install onnx[/red]")
        return False
    except Exception as e:
        console.print(f"[red]Failed to extract ONNX weights: {e}[/red]")
        return False


def _compute_file_hash(file_path: Path) -> str:
    """Compute SHA256 hash of a file."""
    sha256 = hashlib.sha256()
    with open(file_path, 'rb') as f:
        for chunk in iter(lambda: f.read(8192), b''):
            sha256.update(chunk)
    return sha256.hexdigest()


def _get_previous_commit_params(previous_commit_hash: str) -> Path | None:
    """Get params file from previous commit."""
    if previous_commit_hash == "_GENESIS_COMMIT_":
        return None
    
    flair_dir = Path.cwd() / ".flair"
    local_commits_dir = flair_dir / ".local_commits"
    
    if not local_commits_dir.exists():
        return None
    
    # Find the commit directory with matching hash
    for commit_dir in local_commits_dir.iterdir():
        if not commit_dir.is_dir():
            continue
        
        commit_file = commit_dir / "commit.json"
        if not commit_file.exists():
            continue
        
        try:
            with open(commit_file, 'r') as f:
                commit_data = json.load(f)
            
            if commit_data.get("commitHash") == previous_commit_hash:
                params_info = commit_data.get("params")
                if params_info and params_info.get("file"):
                    params_file = commit_dir / params_info["file"]
                    if params_file.exists():
                        return params_file
        except Exception:
            continue
    
    return None


def _compute_pytorch_delta(
    current_path: Path,
    previous_path: Path,
    output_path: Path,
    current_architecture_hash: str,
    previous_architecture_hash: str | None,
) -> bool:
    """Compute delta between current and previous PyTorch parameters."""
    try:
        import torch

        if previous_architecture_hash and current_architecture_hash != previous_architecture_hash:
            raise ArchitectureMismatch("Architecture changed; delta computation is not allowed.")
        
        console.print(f"[dim]Computing PyTorch parameter delta...[/dim]")
        
        # Load both parameter sets
        current_params = torch.load(current_path, map_location="cpu")
        previous_params = torch.load(previous_path, map_location="cpu")
        
        # Compute delta
        delta_params = {}
        for key in current_params.keys():
            if key in previous_params:
                delta_params[key] = current_params[key] - previous_params[key]
            else:
                # New parameter, include as-is
                delta_params[key] = current_params[key]
        
        # Save delta
        torch.save(delta_params, output_path)
        
        size_mb = output_path.stat().st_size / (1024 * 1024)
        console.print(f"[green]✓ PyTorch delta computed ({size_mb:.2f} MB)[/green]")
        return True
        
    except Exception as e:
        console.print(f"[yellow]Warning: Failed to compute PyTorch delta: {e}[/yellow]")
        return False


def _compute_tensorflow_delta(
    current_path: Path,
    previous_path: Path,
    output_path: Path,
    current_architecture_hash: str,
    previous_architecture_hash: str | None,
) -> bool:
    """Compute delta between current and previous TensorFlow parameters."""
    try:
        import numpy as np

        if previous_architecture_hash and current_architecture_hash != previous_architecture_hash:
            raise ArchitectureMismatch("Architecture changed; delta computation is not allowed.")
        
        console.print(f"[dim]Computing TensorFlow parameter delta...[/dim]")
        
        # Load both parameter sets
        current_params = np.load(current_path)
        previous_params = np.load(previous_path)
        
        # Compute delta
        delta_params = {}
        for key in current_params.files:
            if key in previous_params.files:
                delta_params[key] = current_params[key] - previous_params[key]
            else:
                # New parameter, include as-is
                delta_params[key] = current_params[key]
        
        # Save delta
        np.savez(output_path, **delta_params)
        
        size_mb = output_path.stat().st_size / (1024 * 1024)
        console.print(f"[green]✓ TensorFlow delta computed ({size_mb:.2f} MB)[/green]")
        return True
        
    except Exception as e:
        console.print(f"[yellow]Warning: Failed to compute TensorFlow delta: {e}[/yellow]")
        return False


def _compute_onnx_delta(
    current_path: Path,
    previous_path: Path,
    output_path: Path,
    current_architecture_hash: str,
    previous_architecture_hash: str | None,
) -> bool:
    """Compute delta between current and previous ONNX parameters."""
    try:
        import numpy as np

        if previous_architecture_hash and current_architecture_hash != previous_architecture_hash:
            raise ArchitectureMismatch("Architecture changed; delta computation is not allowed.")
        
        console.print(f"[dim]Computing ONNX parameter delta...[/dim]")
        
        # Load both parameter sets
        current_params = np.load(current_path)
        previous_params = np.load(previous_path)
        
        # Compute delta
        delta_params = {}
        for key in current_params.files:
            if key in previous_params.files:
                delta_params[key] = current_params[key] - previous_params[key]
            else:
                # New parameter, include as-is
                delta_params[key] = current_params[key]
        
        # Save delta
        np.savez(output_path, **delta_params)
        
        size_mb = output_path.stat().st_size / (1024 * 1024)
        console.print(f"[green]✓ ONNX delta computed ({size_mb:.2f} MB)[/green]")
        return True
        
    except Exception as e:
        console.print(f"[yellow]Warning: Failed to compute ONNX delta: {e}[/yellow]")
        return False


@app.command()
def create(
    model: str = typer.Option(None, "--model", help="Path to model file"),
    classes: str = typer.Option(None, "--classes", help="Comma-separated ordered class labels (e.g., cat,dog,bird)"),
    class_space_file: str = typer.Option(None, "--class-space-file", help="Path to YAML/JSON/TXT class-space declaration"),
):
    """Extract model weights and save as params for the latest local commit.
    
    Automatically detects PyTorch, TensorFlow, or ONNX models.
    Saves params to the latest local commit directory.
    
    Examples:
      flair params create                  # Auto-detect model
      flair params create --model model.pt # Specify model file
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
        
        # Check if params already exist in this commit
        if commit_data.get("params") is not None:
            console.print("[red]✗ This commit already has parameters.[/red]")
            console.print("[yellow]To create a new commit with different parameters, run 'flair add' first.[/yellow]")
            raise typer.Exit(code=1)
        
        commit_hash = commit_data.get("commitHash")
        if not commit_hash:
            console.print("[red]Invalid commit data.[/red]")
            raise typer.Exit(code=1)
        
        from .branch import _get_current_branch, _get_current_repo, api_client, _update_branches_cache, checkout
        current_branch_data = _get_current_branch()
        if not current_branch_data:
            console.print("[red]No current branch found.[/red]")
            raise typer.Exit(code=1)
            
        branch_name = current_branch_data.get("currentBranch")

        # Resolve class-space contract before extracting parameters.
        provided_class_space = parse_class_space_option(classes)
        if class_space_file:
            file_labels = load_class_space_from_file(Path(class_space_file))
            if provided_class_space is not None and provided_class_space != file_labels:
                console.print("[red]Class-space mismatch between --classes and --class-space-file.[/red]")
                raise typer.Exit(code=1)
            provided_class_space = file_labels

        try:
            class_space, class_space_hash, contract_created, new_branch_needed = ensure_class_space_contract(
                flair_dir,
                branch_name,
                provided_class_space,
            )
        except ClassSpaceMismatch as e:
            console.print(f"[red]✗ {e}[/red]")
            raise typer.Exit(code=1)
        except ValueError as e:
            console.print(f"[red]✗ {e}[/red]")
            raise typer.Exit(code=1)

        if new_branch_needed:
            console.print("[yellow]New class space detected. Creating a new branch automatically...[/yellow]")
            class_space_hash_short = compute_class_space_hash(class_space)[:8]
            new_branch_name = f"{branch_name}-classes-{class_space_hash_short}"
            
            repo_info = _get_current_repo()
            if not repo_info or not repo_info.get("repoHash"):
                console.print("[red]Could not retrieve repo info.[/red]")
                raise typer.Exit(code=1)
                
            repo_hash = repo_info["repoHash"]
            try:
                # Create the branch via API
                api_client.create_branch(
                    repo_hash,
                    new_branch_name,
                    current_branch_data.get("branchHash"),
                    "Automatic branch for new class space"
                )
                console.print(f"✓ Branch '{new_branch_name}' created", style="green")
                
                # Refresh branches cache
                branches = api_client.get_branches(repo_hash)
                _update_branches_cache(branches)
                
                # Save the new class space for this branch
                from .utils.class_space import save_branch_class_space
                save_branch_class_space(flair_dir, new_branch_name, class_space)
                
                # Checkout the new branch
                console.print(f"[dim]Switching to new branch '{new_branch_name}'...[/dim]")
                checkout(new_branch_name)
                
                console.print("[green]✓ Automatically switched to new branch. Please run 'flair params create' again to extract parameters for the new branch.[/green]")
                raise typer.Exit(code=0)
                
            except Exception as e:
                if not isinstance(e, typer.Exit):
                    console.print(f"[red]Failed to create automatic branch: {e}[/red]")
                    raise typer.Exit(code=1)
                raise

        if contract_created:
            console.print(f"[green]✓ Created branch class-space contract in .flair/class_space_{branch_name}.yaml[/green]")

        console.print(f"[dim]Class space: {class_space}[/dim]")

        # Determine model file
        model_path = None
        
        if model:
            model_path = Path(model)
            if not model_path.exists():
                console.print(f"[red]Model file not found: {model}[/red]")
                raise typer.Exit(code=1)
        else:
            # Auto-detect model files
            found_models = _detect_model_files()
            
            if not found_models:
                console.print("[red]No model files found in current directory[/red]")
                console.print("[dim]Supported formats: .pt, .pth, .h5, .keras, .onnx, .pb[/dim]")
                raise typer.Exit(code=1)
            
            if len(found_models) == 1:
                model_path = found_models[0]
                console.print(f"[dim]Found model: {model_path.name}[/dim]")
            else:
                console.print(f"[yellow]Found {len(found_models)} model files:[/yellow]")
                for i, file in enumerate(found_models, 1):
                    console.print(f"  {i}. {file.name}")
                
                selection = typer.prompt("Select file number", type=int)
                if selection < 1 or selection > len(found_models):
                    console.print("[red]Invalid selection[/red]")
                    raise typer.Exit(code=1)
                
                model_path = found_models[selection - 1]
        
        # Detect framework
        framework = _detect_framework(model_path)
        if not framework:
            console.print(f"[red]Unsupported model format: {model_path.suffix}[/red]")
            raise typer.Exit(code=1)
        
        console.print(f"[dim]Detected framework: {framework}[/dim]")
        
        # Prepare output path in the commit directory
        if framework == "pytorch":
            output_path = commit_dir / "params.pt"
        else:
            output_path = commit_dir / "params.npz"
        
        # Extract weights based on framework
        success = False
        if framework == "pytorch":
            success = _extract_pytorch_weights(model_path, output_path)
        elif framework == "tensorflow":
            success = _extract_tensorflow_weights(model_path, output_path)
        elif framework == "onnx":
            success = _extract_onnx_weights(model_path, output_path)
        
        if success:
            # Compute hash of params file and architecture signature.
            params_hash = _compute_file_hash(output_path)
            current_params_data = _load_params_from_file(output_path, framework)
            if current_params_data is None:
                raise typer.Exit(code=1)

            current_architecture_hash = compute_architecture_hash(
                current_params_data,
                framework=framework,
                metadata={"classSpace": class_space, "classSpaceHash": class_space_hash},
            )

            # Compute delta parameters if there's a previous commit.
            head_info = _get_head_info()
            previous_commit_hash = head_info.get("previousCommit", "_GENESIS_COMMIT_") if head_info else "_GENESIS_COMMIT_"
            previous_architecture_hash = None
            architecture_changed = False
            previous_class_space_hash = None
            class_space_changed = False
            delta_params_info = None

            if previous_commit_hash and previous_commit_hash != "_GENESIS_COMMIT_":
                previous_class_space = None
                previous_commit_result = _get_commit_by_hash(previous_commit_hash)
                if previous_commit_result:
                    previous_commit_data, _ = previous_commit_result
                    previous_architecture_hash = previous_commit_data.get("architectureHash")
                    previous_class_space = previous_commit_data.get("classSpace")
                    previous_class_space_hash = previous_commit_data.get("classSpaceHash")
                    if not previous_class_space_hash and previous_commit_data.get("classSpace"):
                        if isinstance(previous_class_space, list):
                            previous_class_space_hash = compute_class_space_hash(previous_class_space)

                if not previous_architecture_hash:
                    previous_params_path = _get_previous_commit_params(previous_commit_hash)
                    if previous_params_path:
                        previous_params_data = _load_params_from_file(previous_params_path, framework)
                        if previous_params_data is not None:
                            previous_architecture_hash = compute_architecture_hash(
                                previous_params_data,
                                framework=framework,
                                metadata={
                                    "classSpace": previous_class_space,
                                    "classSpaceHash": previous_class_space_hash,
                                },
                            )

                if previous_class_space_hash and class_space_hash != previous_class_space_hash:
                    class_space_changed = True
                    architecture_changed = True
                    console.print("[yellow]⚠ Class-space change detected: this commit will be finalized as a CHECKPOINT.[/yellow]")
                    console.print(f"[yellow]  Current class-space hash: {class_space_hash[:16]}...[/yellow]")
                    console.print(f"[yellow]  Previous class-space hash: {previous_class_space_hash[:16]}...[/yellow]")

                if previous_architecture_hash and current_architecture_hash != previous_architecture_hash:
                    architecture_changed = True
                    console.print("[yellow]⚠ Architecture change detected: this commit will be finalized as a CHECKPOINT.[/yellow]")
                    console.print(f"[yellow]  Current architecture hash: {current_architecture_hash[:16]}...[/yellow]")
                    console.print(f"[yellow]  Previous architecture hash: {previous_architecture_hash[:16]}...[/yellow]")

                console.print(f"\n[cyan]Computing delta from previous commit...[/cyan]")
                console.print(f"[dim]Previous commit: {previous_commit_hash[:16]}...[/dim]")

                previous_params_path = _get_previous_commit_params(previous_commit_hash)
                if previous_params_path and not architecture_changed:
                    delta_dir = commit_dir / ".delta_params"
                    delta_dir.mkdir(exist_ok=True)

                    if framework == "pytorch":
                        delta_output_path = delta_dir / "delta.pt"
                    else:
                        delta_output_path = delta_dir / "delta.npz"

                    try:
                        if framework == "pytorch":
                            delta_success = _compute_pytorch_delta(
                                output_path,
                                previous_params_path,
                                delta_output_path,
                                current_architecture_hash,
                                previous_architecture_hash,
                            )
                        elif framework == "tensorflow":
                            delta_success = _compute_tensorflow_delta(
                                output_path,
                                previous_params_path,
                                delta_output_path,
                                current_architecture_hash,
                                previous_architecture_hash,
                            )
                        elif framework == "onnx":
                            delta_success = _compute_onnx_delta(
                                output_path,
                                previous_params_path,
                                delta_output_path,
                                current_architecture_hash,
                                previous_architecture_hash,
                            )
                        else:
                            delta_success = False
                    except ArchitectureMismatch:
                        architecture_changed = True
                        delta_success = False
                        console.print("[yellow]⚠ Architecture mismatch detected while computing delta; skipping delta generation.[/yellow]")

                    if delta_success:
                        delta_hash = _compute_file_hash(delta_output_path)
                        delta_params_info = {
                            "file": delta_output_path.name,
                            "hash": delta_hash,
                            "previousCommitHash": previous_commit_hash
                        }
                        console.print(f"[dim]Delta file: {delta_output_path.name}[/dim]")
                        console.print(f"[dim]Delta hash: {delta_hash[:16]}...[/dim]")
                elif previous_params_path and architecture_changed:
                    console.print("[yellow]⚠ Architecture changed; full checkpoint will be stored instead of a delta.[/yellow]")
                else:
                    console.print("[yellow]Warning: Previous commit params not found locally. Skipping delta computation.[/yellow]")
            else:
                console.print("\n[dim]First commit (genesis) - no delta computed[/dim]")

            # Update commit.json with params information.
            commit_file = commit_dir / "commit.json"
            with open(commit_file, 'r') as f:
                commit_data = json.load(f)

            commit_data["params"] = {
                "file": output_path.name,
                "hash": params_hash,
                "framework": framework
            }

            commit_data["architectureHash"] = current_architecture_hash
            commit_data["previousArchitectureHash"] = previous_architecture_hash
            commit_data["architectureChanged"] = architecture_changed
            commit_data["classSpace"] = class_space
            commit_data["classSpaceHash"] = class_space_hash
            commit_data["previousClassSpaceHash"] = previous_class_space_hash
            commit_data["classSpaceChanged"] = class_space_changed
            commit_data["deltaParams"] = delta_params_info

            with open(commit_file, 'w') as f:
                json.dump(commit_data, f, indent=2)

            console.print(f"\n[green]✓ Parameters saved to commit directory[/green]")
            console.print(f"  File: {output_path.name}")
            console.print(f"  Hash: {params_hash[:16]}...")
            console.print(f"  Architecture hash: {current_architecture_hash[:16]}...")
            console.print(f"  Class-space hash: {class_space_hash[:16]}...")
            if previous_architecture_hash:
                console.print(f"  Previous architecture hash: {previous_architecture_hash[:16]}...")
            if previous_class_space_hash:
                console.print(f"  Previous class-space hash: {previous_class_space_hash[:16]}...")
            if architecture_changed:
                console.print("  [yellow]Architecture changed: commit will be finalized as CHECKPOINT[/yellow]")
            if delta_params_info:
                console.print(f"  Delta: {delta_params_info['file']}")
            console.print(f"\n[dim]Next steps:[/dim]")
            console.print(f"  1. (Optional) Run 'flair zkp create' to generate zero-knowledge proof")
            console.print(f"  2. Run 'flair push -m \"Your message\"' to push to repository")
        else:
            raise typer.Exit(code=1)
    except Exception as e:
        console.print(f"[red]✗ Failed to create params: {str(e)}[/red]")
        raise typer.Exit(code=1)
