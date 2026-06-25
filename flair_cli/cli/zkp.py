"""
Zero-Knowledge Proof (ZKP) commands for Flair CLI.
Creates and verifies ZKPs for models in different frameworks.

Supports:
- PyTorch models (.pt, .pth)
- TensorFlow models (.h5, .keras)
- ONNX models (.onnx)

Automatically converts models to ONNX format if needed before proof creation.
Uses EZKL directly within the CLI - no external server needed.
"""

from __future__ import annotations
import typer
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn
from pathlib import Path
import json
import zlib
import base64
from datetime import datetime
from typing import Optional
import os
import asyncio
import numpy as np

from ..core import config as config_mod
from .utils.local_commits import _get_flair_dir, _get_latest_local_commit

app = typer.Typer()
console = Console()
def _get_zkp_dir() -> Path:
    """Get or create the .zkp directory inside .flair."""
    zkp_dir = _get_flair_dir() / ".zkp"
    zkp_dir.mkdir(parents=True, exist_ok=True)
    return zkp_dir


def _load_repo_config() -> dict:
    """Load repository info from .flair/repo.json"""
    flair_dir = _get_flair_dir()
    config_file = flair_dir / "repo.json"
    
    if not config_file.exists():
        raise typer.BadParameter(
            "Repository info not found. Run 'flair init' first."
        )
    
    with open(config_file, 'r') as f:
        return json.load(f)


def _get_current_commit_hash() -> Optional[str]:
    """Get current commit hash from .flair/HEAD"""
    flair_dir = _get_flair_dir()
    head_file = flair_dir / "HEAD"
    
    if not head_file.exists():
        return None
    
    try:
        with open(head_file, 'r') as f:
            head_data = json.load(f)
            return head_data.get("previousCommitHash")
    except Exception:
        return None


def _find_model_file(framework: str) -> Optional[Path]:
    """Find a model file for the given framework in current directory."""
    extensions_map = {
        "pytorch": [".pt", ".pth"],
        "tensorflow": [".h5", ".keras"],
        "onnx": [".onnx"]
    }
    
    extensions = extensions_map.get(framework.lower(), [])
    for ext in extensions:
        files = list(Path.cwd().glob(f"*{ext}"))
        if files:
            return files[0]
    
    return None


def _convert_to_onnx(model_path: Path, framework: str) -> Path:
    """Convert a model to ONNX format if needed."""
    if model_path.suffix == ".onnx":
        return model_path
    
    console.print(f"\n[yellow]Converting {framework} model to ONNX format...[/yellow]")
    
    try:
        if framework.lower() == "pytorch":
            _pytorch_to_onnx(model_path)
        elif framework.lower() == "tensorflow":
            _tensorflow_to_onnx(model_path)
        else:
            raise ValueError(f"Unsupported framework: {framework}")
    except Exception as e:
        raise typer.BadParameter(
            f"Failed to convert model to ONNX: {str(e)}\n"
            "Make sure you have the required packages installed:\n"
            "  PyTorch: pip install torch onnx\n"
            "  TensorFlow: pip install tensorflow tf2onnx"
        )
    
    onnx_path = model_path.parent / f"{model_path.stem}.onnx"
    return onnx_path


def _pytorch_to_onnx(model_path: Path) -> None:
    """Convert PyTorch model to ONNX."""
    try:
        import torch
        import onnx
    except ImportError:
        raise ImportError("PyTorch or ONNX not installed. Install with: pip install torch onnx")
    
    try:
        model = torch.load(model_path, map_location='cpu')
        dummy_input = torch.randn(1, 3, 224, 224)  # Adjust based on your model
        
        onnx_path = model_path.parent / f"{model_path.stem}.onnx"
        torch.onnx.export(
            model,
            dummy_input,
            str(onnx_path),
            export_params=True,
            opset_version=12,
            do_constant_folding=True,
            input_names=['input'],
            output_names=['output'],
            verbose=False
        )
        console.print(f"[green]✓ Successfully converted to {onnx_path}[/green]")
    except Exception as e:
        raise RuntimeError(f"PyTorch to ONNX conversion failed: {str(e)}")


def _tensorflow_to_onnx(model_path: Path) -> None:
    """Convert TensorFlow model to ONNX."""
    try:
        import tf2onnx
        import tensorflow as tf
    except ImportError:
        raise ImportError("tf2onnx or TensorFlow not installed. Install with: pip install tf2onnx tensorflow")
    
    try:
        model = tf.keras.models.load_model(model_path)
        onnx_path = model_path.parent / f"{model_path.stem}.onnx"
        
        spec = (tf.TensorSpec((None, 224, 224, 3), tf.float32, name="input"),)
        output_path = str(onnx_path.parent / onnx_path.stem)
        
        model_proto, _ = tf2onnx.convert.from_keras(model, input_signature=spec, output_path=output_path)
        console.print(f"[green]✓ Successfully converted to {onnx_path}[/green]")
    except Exception as e:
        raise RuntimeError(f"TensorFlow to ONNX conversion failed: {str(e)}")


def _compress_to_zlib_file(data: bytes, out_path: Path) -> None:
    """Compress bytes with zlib and write to a file."""
    out_path.write_bytes(zlib.compress(data))


def _decompress_zlib_file(path: Path) -> bytes:
    """Read zlib-compressed file and return decompressed bytes."""
    return zlib.decompress(path.read_bytes())


def _compute_cid_v1_raw(file_path: Path) -> str:
    """Compute IPFS CIDv1 (raw, sha2-256, base32) for a file's contents."""
    import hashlib

    data = file_path.read_bytes()
    digest = hashlib.sha256(data).digest()
    multihash = bytes([0x12, 0x20]) + digest  # 0x12=sha2-256, 0x20=32 bytes
    cid_bytes = bytes([0x01, 0x55]) + multihash  # 0x01=cidv1, 0x55=raw codec
    b32 = base64.b32encode(cid_bytes).decode('ascii').lower().rstrip('=')
    return f"b{b32}"


def _make_random_array(dims):
    """Generate a NumPy array of shape dims, float32 in [0,1)."""
    return np.random.rand(*dims).astype(np.float32)


def _to_backend(array: np.ndarray, backend: str):
    """Convert NumPy array to the chosen backend tensor/array."""
    if backend == 'torch' or backend == 'pytorch':
        try:
            import torch
            return torch.from_numpy(array)
        except ImportError:
            console.print("[yellow]Warning: torch not available, using numpy[/yellow]")
            return array
    elif backend == 'tensorflow':
        try:
            import tensorflow as tf
            return tf.convert_to_tensor(array)
        except ImportError:
            console.print("[yellow]Warning: tensorflow not available, using numpy[/yellow]")
            return array
    else:  # numpy
        return array


# main function to create the zkml proof from the onnx model
async def _process_model_with_ezkl(model_path: Path, input_dims: list, backend: str, zkp_dir: Path) -> None:
    """
    Process model and generate ZKP proof using EZKL directly.
    Artifacts are written to zlib files in zkp_dir.
    """
    try:
        import ezkl
    except ImportError:
        raise ImportError(
            "EZKL not installed. Install with: pip install ezkl\n"
            "Note: EZKL requires Python 3.9-3.11"
        )
    
    # Paths for EZKL artifacts
    data_path = zkp_dir / "input.json"
    cal_path = zkp_dir / "calibration.json"
    settings_path = zkp_dir / "settings.json"
    compiled_path = zkp_dir / "network.compiled"
    witness_path = zkp_dir / "witness.json"
    pk_path = zkp_dir / "test.pk"
    vk_path = zkp_dir / "test.vk"
    proof_path = zkp_dir / "test.pf"
    
    try:
        console.print("[cyan]Step 1/10: Generating input data...[/cyan]")
        # 1) Generate input
        np_input = _make_random_array(input_dims)
        tensor_input = _to_backend(np_input, backend)
        flat_in = np_input.reshape(-1).tolist()
        with open(data_path, 'w') as f:
            json.dump({"input_data": [flat_in]}, f)
        
        console.print("[cyan]Step 2/10: Generating calibration data...[/cyan]")
        # 2) Calibration
        calib_batch = 20
        cal_dims = [calib_batch] + input_dims[1:]
        np_calib = _make_random_array(cal_dims)
        flat_cal = np_calib.reshape(-1).tolist()
        with open(cal_path, 'w') as f:
            json.dump({"input_data": [flat_cal]}, f)
        
        console.print("[cyan]Step 3/10: Generating settings...[/cyan]")
        # 3) gen settings
        py_args = ezkl.PyRunArgs()
        py_args.input_visibility = "public"
        py_args.output_visibility = "public"
        py_args.param_visibility = "private"
        if not ezkl.gen_settings(str(model_path), str(settings_path), py_run_args=py_args):
            raise RuntimeError("gen_settings failed")
        
        console.print("[cyan]Step 4/10: Calibrating settings...[/cyan]")
        # 4) calibrate
        await ezkl.calibrate_settings(str(cal_path), str(model_path), str(settings_path), "resources")
        
        console.print("[cyan]Step 5/10: Compiling circuit...[/cyan]")
        # 5) compile
        if not ezkl.compile_circuit(str(model_path), str(compiled_path), str(settings_path)):
            raise RuntimeError("compile_circuit failed")
        
        console.print("[cyan]Step 6/10: Getting SRS (Structured Reference String)...[/cyan]")
        # 6) get SRS
        await ezkl.get_srs(str(settings_path))
        
        console.print("[cyan]Step 7/10: Generating witness...[/cyan]")
        # 7) witness
        if not await ezkl.gen_witness(str(data_path), str(compiled_path), str(witness_path)):
            raise RuntimeError("gen_witness failed")
        
        console.print("[cyan]Step 8/10: Setting up proving and verification keys...[/cyan]")
        # 8) setup keys
        if not ezkl.setup(str(compiled_path), str(vk_path), str(pk_path)):
            raise RuntimeError("setup failed")
        
        console.print("[cyan]Step 9/10: Generating proof...[/cyan]")
        # 9) prove
        if not ezkl.prove(str(witness_path), str(compiled_path), str(pk_path), str(proof_path), "single"):
            raise RuntimeError("prove failed")
        
        console.print("[cyan]Step 10/10: Verifying proof...[/cyan]")
        # 10) verify
        if not ezkl.verify(str(proof_path), str(settings_path), str(vk_path)):
            raise RuntimeError("verify failed")
        
        console.print("[green]✓ All EZKL steps completed successfully![/green]")
        
        # Read and compress outputs to zlib binary files
        proof_zlib = zkp_dir / "proof.zlib"
        vk_zlib = zkp_dir / "verification_key.zlib"
        settings_zlib = zkp_dir / "settings.zlib"

        with open(proof_path, "r") as pf:
            _compress_to_zlib_file(pf.read().encode('utf-8'), proof_zlib)
        with open(vk_path, "rb") as vk:
            _compress_to_zlib_file(vk.read(), vk_zlib)
        with open(settings_path, "r") as st:
            _compress_to_zlib_file(st.read().encode('utf-8'), settings_zlib)
        
        # Cleanup intermediate files
        console.print("[dim]Cleaning up intermediate files...[/dim]")
        to_del = [
            data_path, cal_path, compiled_path, witness_path,
            pk_path, proof_path, vk_path, settings_path
        ]
        for f in to_del:
            if f.exists():
                try:
                    f.unlink()
                except Exception as e:
                    console.print(f"[yellow]Warning: Could not delete {f.name}: {e}[/yellow]")
        
        return None
        
    except Exception as e:
        # Cleanup on error
        console.print(f"[yellow]Cleaning up after error...[/yellow]")
        for f in [data_path, cal_path, compiled_path, witness_path, pk_path, proof_path, vk_path, settings_path]:
            if f.exists():
                try:
                    f.unlink()
                except:
                    pass
        raise e


async def _verify_proof_with_ezkl(proof_files: dict, zkp_dir: Path) -> bool:
    """
    Verify a ZKP proof using EZKL directly from zlib-compressed files.
    
    Returns True if verified, False otherwise.
    """
    try:
        import ezkl
    except ImportError:
        raise ImportError(
            "EZKL not installed. Install with: pip install ezkl\n"
            "Note: EZKL requires Python 3.9-3.11"
        )
    
    # Paths for verification
    pf_p = zkp_dir / "decoded_proof.pf"
    vk_p = zkp_dir / "decoded_vk"
    st_p = zkp_dir / "decoded_settings.json"

    proof_zlib = zkp_dir / proof_files.get("proof_file", "proof.zlib")
    vk_zlib = zkp_dir / proof_files.get("verification_key_file", "verification_key.zlib")
    settings_zlib = zkp_dir / proof_files.get("settings_file", "settings.zlib")
    
    try:
        console.print("[cyan]Decoding proof artifacts from zlib files...[/cyan]")

        if not proof_zlib.exists() or not vk_zlib.exists() or not settings_zlib.exists():
            missing = [p.name for p in (proof_zlib, vk_zlib, settings_zlib) if not p.exists()]
            raise FileNotFoundError(f"Missing proof artifacts: {', '.join(missing)}")

        with open(pf_p, 'w') as f:
            f.write(_decompress_zlib_file(proof_zlib).decode('utf-8'))
        with open(vk_p, 'wb') as f:
            f.write(_decompress_zlib_file(vk_zlib))
        with open(st_p, 'w') as f:
            f.write(_decompress_zlib_file(settings_zlib).decode('utf-8'))
        
        console.print("[cyan]Running EZKL verification...[/cyan]")
        # Verify
        verified = ezkl.verify(str(pf_p), str(st_p), str(vk_p))
        
        console.print("[dim]Cleaning up verification files...[/dim]")
        # Cleanup
        for p in (pf_p, vk_p, st_p):
            if p.exists():
                try:
                    p.unlink()
                except Exception as e:
                    console.print(f"[yellow]Warning: Could not delete {p.name}: {e}[/yellow]")
        
        return verified
        
    except Exception as e:
        # Cleanup on error
        for p in (pf_p, vk_p, st_p):
            if p.exists():
                try:
                    p.unlink()
                except:
                    pass
        raise e


@app.command("create")
def create_zkp(
    model_path: Optional[str] = typer.Option(None, "--model", "-m", help="Path to model file"),
    input_dims: str = typer.Option("[1, 3, 224, 224]", "--input-dims", help="Input dimensions as JSON array"),
    backend: Optional[str] = typer.Option(None, "--backend", help="Backend to use (pytorch/tensorflow/numpy)")
):
    """Create a Zero-Knowledge Proof for a model.
    
    Automatically detects the model file and framework from repo config,
    converts to ONNX format if needed, then generates
    a ZKP proof using EZKL directly. Results are saved in .flair/.zkp/
    
    Example:
        flair zkp create --input-dims "[1, 3, 224, 224]"
        flair zkp create --model model.pt --backend pytorch
    """
    try:
        # Check if the latest commit already has ZKP
        local_commit_result = _get_latest_local_commit()
        if local_commit_result:
            commit_data, _ = local_commit_result
            if commit_data.get("zkp") is not None:
                console.print("[red]✗ This commit already has a zero-knowledge proof.[/red]")
                console.print("[yellow]To create a new commit with a different ZKP, run 'flair add' first.[/yellow]")
                raise typer.Exit(code=1)
        
        # Load repo config
        repo_config = _load_repo_config()
        framework = (repo_config.get("metadata", {}).get("framework") or repo_config.get("framework", "")).lower()
        
        if not framework:
            raise typer.BadParameter(
                "Framework not found in repo info. Ensure repository was initialized properly."
            )
        
        # Determine backend
        backend_to_use = backend or framework
        if backend_to_use not in ("pytorch", "tensorflow", "numpy"):
            raise typer.BadParameter(
                f"Unsupported backend: {backend_to_use}. Use: pytorch, tensorflow, or numpy"
            )
        
        # Find model file
        model_file = None
        if model_path:
            model_file = Path(model_path)
            if not model_file.exists():
                raise typer.BadParameter(f"Model file not found: {model_path}")
        else:
            model_file = _find_model_file(framework)
            if not model_file:
                raise typer.BadParameter(
                    f"No {framework} model file found in current directory.\n"
                    f"Expected extensions: {_get_extensions_for_framework(framework)}\n"
                    f"Use --model to specify a custom path."
                )
        
        console.print(f"\n[cyan]Creating ZKP for model: {model_file.name}[/cyan]")
        console.print(f"[dim]Framework: {framework}[/dim]")
        
        # Convert to ONNX if needed
        onnx_file = _convert_to_onnx(model_file, framework)
        
        # Parse input dimensions
        try:
            dims = json.loads(input_dims)
        except json.JSONDecodeError:
            raise typer.BadParameter(f"Invalid JSON for input-dims: {input_dims}")
        
        # Prepare ZKP directory (local commit directory, not .zkp)
        local_commit_result = _get_latest_local_commit()
        if not local_commit_result:
            console.print("[red]No local commits found. Run 'flair add' first.[/red]")
            raise typer.Exit(code=1)
        
        commit_data, commit_dir = local_commit_result
        
        console.print("\n[cyan]Generating Zero-Knowledge Proof using EZKL...[/cyan]")
        console.print("[dim]This may take several minutes depending on model complexity...[/dim]\n")
        
        # Run EZKL proof generation
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(
                    _process_model_with_ezkl(onnx_file, dims, backend_to_use, commit_dir)
                )                
            finally:
                loop.close()
        except ImportError as e:
            raise typer.BadParameter(str(e))
        except Exception as e:
            raise RuntimeError(f"Error during ZKP generation: {str(e)}")
        
        # Save proof artifacts
        console.print("\n[cyan]Saving proof artifacts...[/cyan]")

        proof_path = commit_dir / "proof.zlib"
        vk_path = commit_dir / "verification_key.zlib"
        settings_path = commit_dir / "settings.zlib"
        
        # Get current commit hash from HEAD
        commit_hash = _get_current_commit_hash()
        
        zkp_data = {
            "timestamp": datetime.now().isoformat(),
            "model_file": str(model_file),
            "framework": framework,
            "input_dims": dims,
            "format": "zlib",
            "proof_file": proof_path.name,
            "verification_key_file": vk_path.name,
            "settings_file": settings_path.name,
            "proof_cid": _compute_cid_v1_raw(proof_path),
            "verification_key_cid": _compute_cid_v1_raw(vk_path),
            "settings_cid": _compute_cid_v1_raw(settings_path),
            "base_commit_hash": commit_hash
        }
        
        # Update commit.json with ZKP data
        commit_file = commit_dir / "commit.json"
        with open(commit_file, 'r') as f:
            commit_data = json.load(f)
        
        commit_data["zkp"] = zkp_data
        
        with open(commit_file, 'w') as f:
            json.dump(commit_data, f, indent=2)
        
        console.print(f"[green]✓ ZKP created successfully![/green]")
        console.print(f"[dim]Saved to: {commit_dir.name}/[/dim]")
        console.print(f"[dim]Proof files: proof.zlib, verification_key.zlib, settings.zlib[/dim]")
        
        # Clean up ONNX file if it was converted
        if onnx_file != model_file and onnx_file.exists():
            onnx_file.unlink()
            console.print(f"[dim]Cleaned up temporary ONNX file[/dim]")
        
        console.print(f"\n[dim]Next steps:[/dim]")
        console.print(f"  • Run 'flair push -m \"Your message\"' to push this commit to the repository")
        
    except typer.BadParameter:
        raise
    except Exception as e:
        console.print(f"[red]✗ Error creating ZKP: {str(e)}[/red]")
        raise typer.Exit(code=1)


@app.command("verify")
def verify_zkp():
    """Verify a Zero-Knowledge Proof.
    
    Reads the proof from .flair/.zkp/proof.json and verifies it using
    EZKL directly. Results are saved to .flair/.zkp/.verified
    
    Example:
        flair zkp verify
    """
    try:
        zkp_dir = _get_zkp_dir()
        proof_file = zkp_dir / "proof.json"
        
        if not proof_file.exists():
            raise typer.BadParameter(
                f"No proof found. Run 'flair zkp create' first.\n"
                f"Expected: {proof_file}"
            )
        
        # Load proof data
        with open(proof_file, 'r') as f:
            proof_data = json.load(f)
        
        console.print("[cyan]Verifying Zero-Knowledge Proof...[/cyan]")
        console.print(f"[dim]Proof timestamp: {proof_data.get('timestamp')}[/dim]\n")
        
        # Prepare ZKP directory
        zkp_dir = _get_zkp_dir()
        
        # Run EZKL verification
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                verified = loop.run_until_complete(
                    _verify_proof_with_ezkl(proof_data, zkp_dir)
                )
            finally:
                loop.close()
        except ImportError as e:
            raise typer.BadParameter(str(e))
        except Exception as e:
            raise RuntimeError(f"Error during verification: {str(e)}")
        
        # Save verification result
        verification_log = {
            "timestamp": datetime.now().isoformat(),
            "proof_timestamp": proof_data.get('timestamp'),
            "verified": verified,
            "model_file": proof_data.get('model_file'),
            "framework": proof_data.get('framework'),
            "input_dims": proof_data.get('input_dims'),
            "previous_commit_hash": proof_data.get('previous_commit_hash')
        }
        
        verified_file = zkp_dir / ".verified"
        with open(verified_file, 'w') as f:
            json.dump(verification_log, f, indent=2)
        
        if verified:
            console.print(f"\n[green]✓ Proof verified successfully![/green]")
            console.print(f"[dim]Verification log saved to: {verified_file}[/dim]")
        else:
            console.print(f"\n[red]✗ Proof verification failed![/red]")
            console.print(f"[dim]Verification log saved to: {verified_file}[/dim]")
            raise typer.Exit(code=1)
        
    except typer.BadParameter:
        raise
    except Exception as e:
        console.print(f"[red]✗ Error verifying proof: {str(e)}[/red]")
        raise typer.Exit(code=1)


@app.command("status")
def status():
    """Show ZKP status for the current repository.
    
    Displays information about created proofs and verification status.
    """
    try:
        zkp_dir = _get_zkp_dir()
        proof_file = zkp_dir / "proof.json"
        verified_file = zkp_dir / ".verified"
        
        console.print(f"\n[cyan]ZKP Status for {Path.cwd().name}[/cyan]")
        console.print(f"[dim]Location: {zkp_dir}[/dim]\n")
        
        if not proof_file.exists():
            console.print("[yellow]No proofs created yet. Run 'flair zkp create'[/yellow]")
            return
        
        # Load and display proof info
        with open(proof_file, 'r') as f:
            proof_data = json.load(f)
        
        console.print("[cyan]Proof Information:[/cyan]")
        console.print(f"  Model: {proof_data.get('model_file')}")
        console.print(f"  Framework: {proof_data.get('framework')}")
        console.print(f"  Input Dims: {proof_data.get('input_dims')}")
        console.print(f"  Created: {proof_data.get('timestamp')}")
        
        # Load verification status
        if verified_file.exists():
            with open(verified_file, 'r') as f:
                verified_data = json.load(f)
            
            status_icon = "[green]✓[/green]" if verified_data.get('verified') else "[red]✗[/red]"
            console.print(f"\n[cyan]Verification Status: {status_icon}[/cyan]")
            console.print(f"  Verified: {verified_data.get('timestamp')}")
        else:
            console.print("\n[yellow]Not yet verified. Run 'flair zkp verify'[/yellow]")
        
    except typer.BadParameter:
        raise
    except Exception as e:
        console.print(f"[red]✗ Error: {str(e)}[/red]")
        raise typer.Exit(code=1)


def _get_extensions_for_framework(framework: str) -> str:
    """Get file extensions for a framework."""
    extensions_map = {
        "pytorch": ".pt, .pth",
        "tensorflow": ".h5, .keras",
        "onnx": ".onnx"
    }
    return extensions_map.get(framework.lower(), "unknown")
