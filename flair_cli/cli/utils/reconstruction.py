from __future__ import annotations

from typing import Callable

from .local_commits import _get_commit_by_hash
from .param_io import _load_numpy_params, _load_pytorch_params


def _reconstruct_params_from_checkpoint(
    target_commit_hash: str,
    framework: str,
    info: Callable[[str], None] | None = None,
    warn: Callable[[str], None] | None = None,
    include_checkpoint_hash: bool = False,
):
    """Reconstruct parameters by traversing back to CHECKPOINT and replaying deltas."""
    if info:
        info("Reconstructing parameters from checkpoint...")

    current_hash = target_commit_hash
    checkpoint_hash = None
    traversal_stack: list[tuple[str, dict]] = []

    while current_hash and current_hash != "_GENESIS_COMMIT_":
        commit_result = _get_commit_by_hash(current_hash)
        if not commit_result:
            if warn:
                warn(f"Commit {current_hash[:16]}... not found during traversal")
            break

        commit_data, _ = commit_result
        traversal_stack.append((current_hash, commit_data))

        if commit_data.get("commitType") == "CHECKPOINT":
            checkpoint_hash = current_hash
            break

        current_hash = commit_data.get("previousCommitHash")

    if not checkpoint_hash:
        if warn:
            warn("Could not find CHECKPOINT commit")
        return None

    if info:
        info(f"Found CHECKPOINT at: {checkpoint_hash[:16]}...")

    checkpoint_commit_result = _get_commit_by_hash(checkpoint_hash)
    if not checkpoint_commit_result:
        if warn:
            warn("Could not load CHECKPOINT commit")
        return None

    checkpoint_data, checkpoint_dir = checkpoint_commit_result

    params_info = checkpoint_data.get("params")
    if not params_info or not params_info.get("file"):
        if warn:
            warn("CHECKPOINT has no params")
        return None

    params_file = checkpoint_dir / params_info["file"]
    if not params_file.exists():
        if warn:
            warn(f"CHECKPOINT params file not found: {params_file}")
        return None

    if framework == "pytorch":
        current_params = _load_pytorch_params(params_file, warn=warn)
    else:
        current_params = _load_numpy_params(params_file, warn=warn)

    if current_params is None:
        return None

    if info:
        info("Loaded CHECKPOINT params")

    traversal_stack.reverse()

    for commit_hash, commit_data in traversal_stack[1:]:
        delta_info = commit_data.get("deltaParams")
        if not delta_info or not delta_info.get("file"):
            if warn:
                warn(f"No delta found for {commit_hash[:16]}..., cannot reconstruct")
            return None

        commit_result = _get_commit_by_hash(commit_hash)
        if not commit_result:
            continue

        _, commit_dir = commit_result
        delta_file = commit_dir / ".delta_params" / delta_info["file"]

        if not delta_file.exists():
            if warn:
                warn(f"Delta file not found: {delta_file}")
            return None

        if framework == "pytorch":
            delta_params = _load_pytorch_params(delta_file, warn=warn)
        else:
            delta_params = _load_numpy_params(delta_file, warn=warn)

        if delta_params is None:
            return None

        for key in delta_params.keys():
            if key in current_params:
                current_params[key] = current_params[key] + delta_params[key]
            else:
                current_params[key] = delta_params[key]

        if info:
            info(f"Applied delta from {commit_hash[:16]}...")

    if info:
        info("✓ Parameters reconstructed from CHECKPOINT")

    if include_checkpoint_hash:
        return current_params, checkpoint_hash
    return current_params
