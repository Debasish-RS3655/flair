"""
Configuration management for Flair CLI.
Uses YAML file stored at ~/.flair/config.yaml and Pydantic models for validation.

Precedence for config values:
1. Environment variables (FLAIR_*)
2. ~/.flair/config.yaml (if exists)
3. Built-in defaults (localhost for dev)

Debashish Buragohain
"""
from pathlib import Path
from typing import Optional
import yaml
from pydantic import BaseModel
import os

# Allowed base model file extensions
ALLOWED_BASE_MODEL_EXTENSIONS = [
    # The "Blueprint" (Code & Config)
    ".py", ".json", ".yaml",
    # Graph Definitions (Production/Edge)
    ".onnx", ".pb", ".tflite",
    # Full Model Containers (Architecture + Initial Weights)
    ".h5", ".keras", ".pt", ".pth", ".pkl", ".joblib"
]


class FlairConfig(BaseModel):
    api_base_url: Optional[str] = "http://localhost:2112"
    auth_url: Optional[str] = "http://localhost:5173"
    # Session timeout in hours (default 7 days)
    session_timeout_hours: Optional[int] = 168

CONFIG_PATH = Path.home() / ".flair" / "config.yaml"
CONFIG_DIR = CONFIG_PATH.parent


def load_config() -> FlairConfig:
    """Load config from file, falling back to defaults."""
    if CONFIG_PATH.exists():
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}
            return FlairConfig(**data)
        except Exception as e:
            # If config file is malformed, warn and use defaults
            print(f"Warning: Could not parse {CONFIG_PATH}: {e}. Using defaults.")
            return FlairConfig()
    
    # Auto-generate on first use
    _generate_default_config()
    return FlairConfig()


def _generate_default_config():
    """Generate default config file on first use."""
    if not CONFIG_DIR.exists():
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    
    # Don't overwrite if it already exists
    if CONFIG_PATH.exists():
        return
    
    default_cfg = FlairConfig()
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            yaml.safe_dump(default_cfg.dict(exclude_none=False), f, default_flow_style=False)
    except Exception as e:
        print(f"Warning: Could not create {CONFIG_PATH}: {e}")


def save_config(cfg: FlairConfig):
    """Save config to file."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        yaml.safe_dump(cfg.dict(exclude_none=True), f, default_flow_style=False)