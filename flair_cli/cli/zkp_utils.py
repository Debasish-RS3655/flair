"""
Utility functions for model conversion and ZKP operations.
Handles conversion of PyTorch and TensorFlow models to ONNX format.
"""

from pathlib import Path
from typing import Tuple
import json
import numpy as np


def detect_input_shape_from_model(model_path: Path, framework: str) -> list:
    """
    Detect input shape from model file.
    
    Returns default shapes if detection fails.
    """
    try:
        if framework.lower() == "pytorch":
            return _detect_pytorch_shape(model_path)
        elif framework.lower() == "tensorflow":
            return _detect_tensorflow_shape(model_path)
        elif framework.lower() == "onnx":
            return _detect_onnx_shape(model_path)
    except Exception as e:
        print(f"Warning: Could not detect shape: {e}")
    
    # Return default shape
    return [1, 3, 224, 224]


def _detect_pytorch_shape(model_path: Path) -> list:
    """Detect input shape from PyTorch model."""
    try:
        import torch
        
        # Try to load model and inspect
        model = torch.load(model_path, map_location='cpu')
        
        # Common model attribute names for input size
        for attr in ['input_size', 'input_shape', 'in_features']:
            if hasattr(model, attr):
                val = getattr(model, attr)
                if isinstance(val, (list, tuple)):
                    return list(val)
        
        # Check first layer
        for module in model.modules():
            if hasattr(module, 'in_channels'):
                return [1, module.in_channels, 224, 224]
        
    except Exception as e:
        print(f"Could not detect PyTorch shape: {e}")
    
    return [1, 3, 224, 224]


def _detect_tensorflow_shape(model_path: Path) -> list:
    """Detect input shape from TensorFlow model."""
    try:
        import tensorflow as tf
        
        model = tf.keras.models.load_model(model_path)
        if model.input_shape:
            shape = list(model.input_shape)
            # Replace None (batch dimension) with 1
            shape[0] = 1
            return shape
    except Exception as e:
        print(f"Could not detect TensorFlow shape: {e}")
    
    return [1, 224, 224, 3]


def _detect_onnx_shape(model_path: Path) -> list:
    """Detect input shape from ONNX model."""
    try:
        import onnx
        
        model = onnx.load(model_path)
        graph = model.graph
        
        if graph.input:
            input_tensor = graph.input[0]
            if input_tensor.type.HasField('tensor_type'):
                dims = input_tensor.type.tensor_type.shape.dim
                shape = []
                for dim in dims:
                    if dim.HasField('dim_value'):
                        shape.append(dim.dim_value)
                    else:
                        shape.append(1)  # Default for dynamic dimensions
                return shape if shape else [1, 3, 224, 224]
    except Exception as e:
        print(f"Could not detect ONNX shape: {e}")
    
    return [1, 3, 224, 224]


def validate_model_format(model_path: Path) -> bool:
    """Validate that model file is readable."""
    if not model_path.exists():
        return False
    
    try:
        size = model_path.stat().st_size
        return size > 0
    except Exception:
        return False


def get_model_info(model_path: Path, framework: str) -> dict:
    """Get model metadata and information."""
    info = {
        "path": str(model_path),
        "name": model_path.name,
        "size_mb": round(model_path.stat().st_size / (1024 * 1024), 2),
        "framework": framework,
        "input_shape": detect_input_shape_from_model(model_path, framework)
    }
    
    # Add framework-specific info
    if framework.lower() == "pytorch":
        info["supported_backends"] = ["pytorch", "numpy"]
    elif framework.lower() == "tensorflow":
        info["supported_backends"] = ["tensorflow", "numpy"]
    else:
        info["supported_backends"] = ["numpy"]
    
    return info
