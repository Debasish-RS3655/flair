from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from typing import Any


class ArchitectureMismatch(Exception):
    """Raised when two parameter architectures do not match."""


def _shape_to_list(value: Any) -> list[int]:
    """Best-effort conversion of a tensor/array shape to a JSON-friendly list."""
    if hasattr(value, "shape"):
        shape = getattr(value, "shape")
        try:
            return [int(dimension) for dimension in shape]
        except Exception:
            pass

    if hasattr(value, "size") and callable(getattr(value, "size")):
        try:
            return [int(dimension) for dimension in value.size()]
        except Exception:
            pass

    try:
        import numpy as np

        return list(np.asarray(value).shape)
    except Exception:
        return []


def _normalize_metadata(metadata: Mapping[str, Any] | None) -> dict[str, Any]:
    if not metadata:
        return {}

    excluded_keys = {
        "architectureHash",
        "previousArchitectureHash",
        "architectureChanged",
        "classSpaceHash",
        "previousClassSpaceHash",
        "classSpaceChanged",
        "commitType",
    }
    normalized: dict[str, Any] = {}
    for key in sorted(metadata.keys()):
        if key in excluded_keys:
            continue
        value = metadata[key]
        if value is None:
            continue
        normalized[key] = value
    return normalized


def compute_architecture_signature(
    params: Mapping[str, Any],
    framework: str | None = None,
    metadata: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Build a canonical architecture signature from names, order, and shapes."""
    signature = [
        {
            "name": name,
            "shape": _shape_to_list(value),
        }
        for name, value in params.items()
    ]

    payload: dict[str, Any] = {"signature": signature}
    if framework:
        payload["framework"] = framework.lower()

    normalized_metadata = _normalize_metadata(metadata)
    if normalized_metadata:
        payload["metadata"] = normalized_metadata

    return payload


def compute_architecture_hash(
    params: Mapping[str, Any],
    framework: str | None = None,
    metadata: Mapping[str, Any] | None = None,
) -> str:
    """Compute a deterministic hash for a parameter architecture."""
    payload = compute_architecture_signature(params, framework=framework, metadata=metadata)
    canonical_json = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()


def ensure_matching_architecture(current_architecture_hash: str, previous_architecture_hash: str | None) -> None:
    """Raise ArchitectureMismatch if hashes are both present and different."""
    if previous_architecture_hash and current_architecture_hash != previous_architecture_hash:
        raise ArchitectureMismatch(
            "Architecture changed: current commit cannot be treated as a DELTA against the previous commit."
        )


def resolve_commit_type(current_architecture_hash: str, previous_architecture_hash: str | None) -> tuple[str, bool]:
    """Return the commit type and whether the architecture changed."""
    if not previous_architecture_hash:
        return "CHECKPOINT", False

    if current_architecture_hash != previous_architecture_hash:
        return "CHECKPOINT", True

    return "DELTA", False
