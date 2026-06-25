from __future__ import annotations

from pathlib import Path
from typing import Callable


def _load_pytorch_params(file_path: Path, warn: Callable[[str], None] | None = None):
    """Load PyTorch parameters from file."""
    try:
        import torch

        return torch.load(file_path, map_location="cpu")
    except Exception as e:
        if warn:
            warn(f"Failed to load PyTorch params from {file_path}: {e}")
        return None


def _load_numpy_params(file_path: Path, warn: Callable[[str], None] | None = None):
    """Load NumPy parameters from file."""
    try:
        import numpy as np

        data = np.load(file_path)
        return {key: data[key] for key in data.files}
    except Exception as e:
        if warn:
            warn(f"Failed to load NumPy params from {file_path}: {e}")
        return None


def _save_pytorch_params(params, file_path: Path, warn: Callable[[str], None] | None = None) -> bool:
    """Save PyTorch parameters to file."""
    try:
        import torch

        torch.save(params, file_path)
        return True
    except Exception as e:
        if warn:
            warn(f"Failed to save PyTorch params: {e}")
        return False


def _save_numpy_params(params: dict, file_path: Path, warn: Callable[[str], None] | None = None) -> bool:
    """Save NumPy parameters to file."""
    try:
        import numpy as np

        np.savez(file_path, **params)
        return True
    except Exception as e:
        if warn:
            warn(f"Failed to save NumPy params: {e}")
        return False
