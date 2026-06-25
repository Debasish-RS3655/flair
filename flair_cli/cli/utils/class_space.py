from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import yaml


class ClassSpaceMismatch(Exception):
    """Raised when a class space contract is violated."""


DEFAULT_CLASS_SPACE_FILE = "class_space.yaml"


def _normalize_label(value: Any) -> str:
    label = str(value).strip()
    if not label:
        raise ValueError("Class labels must be non-empty strings")
    return label


def canonicalize_class_space(labels: list[Any]) -> list[str]:
    """Normalize and validate class labels while preserving order."""
    if not labels:
        raise ValueError("Class space cannot be empty")

    normalized = [_normalize_label(label) for label in labels]
    duplicates = {label for label in normalized if normalized.count(label) > 1}
    if duplicates:
        dup_list = ", ".join(sorted(duplicates))
        raise ValueError(f"Class labels must be unique. Duplicates: {dup_list}")

    return normalized


def compute_class_space_hash(class_space: list[str]) -> str:
    """Compute deterministic hash for ordered class-space labels."""
    payload = json.dumps(class_space, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _parse_mapping(payload: dict[str, Any]) -> list[str]:
    if "classes" in payload and isinstance(payload["classes"], list):
        return [str(item) for item in payload["classes"]]
    if "classSpace" in payload and isinstance(payload["classSpace"], list):
        return [str(item) for item in payload["classSpace"]]
    if "labels" in payload and isinstance(payload["labels"], list):
        return [str(item) for item in payload["labels"]]
    raise ValueError("Class-space file must contain 'classes', 'classSpace', or 'labels' as a list")


def load_class_space_from_file(file_path: Path) -> list[str]:
    """Load ordered class labels from YAML/JSON/TXT file."""
    if not file_path.exists():
        raise FileNotFoundError(f"Class-space file not found: {file_path}")

    suffix = file_path.suffix.lower()
    raw_text = file_path.read_text(encoding="utf-8").strip()

    if not raw_text:
        raise ValueError(f"Class-space file is empty: {file_path}")

    if suffix in {".yaml", ".yml", ".json"}:
        payload = yaml.safe_load(raw_text)
        if isinstance(payload, list):
            labels = [str(item) for item in payload]
        elif isinstance(payload, dict):
            labels = _parse_mapping(payload)
        else:
            raise ValueError(f"Unsupported class-space structure in {file_path}")
    else:
        labels = [line.strip() for line in raw_text.splitlines() if line.strip() and not line.strip().startswith("#")]

    return canonicalize_class_space(labels)


def save_repo_class_space(flair_dir: Path, class_space: list[str]) -> Path:
    """Persist repository class-space contract to .flair/class_space.yaml."""
    output = flair_dir / DEFAULT_CLASS_SPACE_FILE
    payload = {
        "classes": class_space,
        "classSpaceHash": compute_class_space_hash(class_space),
    }
    output.write_text(yaml.safe_dump(payload, sort_keys=False), encoding="utf-8")
    return output


def load_repo_class_space(flair_dir: Path) -> list[str] | None:
    """Load repository class-space contract from .flair/class_space.yaml."""
    file_path = flair_dir / DEFAULT_CLASS_SPACE_FILE
    if not file_path.exists():
        return None
    return load_class_space_from_file(file_path)


def parse_class_space_option(classes: str | None) -> list[str] | None:
    """Parse comma-separated class labels from CLI option."""
    if not classes:
        return None

    parsed = [item.strip() for item in classes.split(",") if item.strip()]
    if not parsed:
        return None

    return canonicalize_class_space(parsed)


def ensure_class_space_contract(
    flair_dir: Path,
    provided_class_space: list[str] | None,
) -> tuple[list[str], str, bool]:
    """
    Resolve and enforce repository class-space contract.

    Returns: (class_space, class_space_hash, contract_created)
    """
    repo_class_space = load_repo_class_space(flair_dir)

    if provided_class_space is None:
        if repo_class_space is None:
            raise ValueError(
                "Class space is required. Provide --classes or --class-space-file on first params extraction."
            )
        class_space = repo_class_space
        contract_created = False
    else:
        class_space = canonicalize_class_space(provided_class_space)
        contract_created = False

        if repo_class_space is None:
            save_repo_class_space(flair_dir, class_space)
            contract_created = True
        elif repo_class_space != class_space:
            raise ClassSpaceMismatch(
                "Class-space contract violation: provided classes differ from repository class space. "
                "Create a new branch or checkpoint lineage for a new class space."
            )

    return class_space, compute_class_space_hash(class_space), contract_created
