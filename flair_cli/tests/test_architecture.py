from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

from flair_cli.cli.utils.architecture import (
    ArchitectureMismatch,
    compute_architecture_hash,
    ensure_matching_architecture,
    resolve_commit_type,
)
from flair_cli.cli.utils.reconstruction import _reconstruct_params_from_checkpoint


class ArchitectureUtilsTest(unittest.TestCase):
    def test_same_architecture_resolves_to_delta(self):
        params = {
            "conv.weight": np.zeros((64, 3, 7, 7), dtype=np.float32),
            "conv.bias": np.zeros((64,), dtype=np.float32),
        }
        current_hash = compute_architecture_hash(params, framework="pytorch")
        previous_hash = compute_architecture_hash(params, framework="pytorch")

        commit_type, architecture_changed = resolve_commit_type(current_hash, previous_hash)

        self.assertEqual(commit_type, "DELTA")
        self.assertFalse(architecture_changed)

    def test_changed_tensor_shape_forces_checkpoint(self):
        previous_params = {
            "head.weight": np.zeros((32, 16), dtype=np.float32),
        }
        current_params = {
            "head.weight": np.zeros((64, 16), dtype=np.float32),
        }
        previous_hash = compute_architecture_hash(previous_params, framework="pytorch")
        current_hash = compute_architecture_hash(current_params, framework="pytorch")

        commit_type, architecture_changed = resolve_commit_type(current_hash, previous_hash)

        self.assertEqual(commit_type, "CHECKPOINT")
        self.assertTrue(architecture_changed)
        self.assertNotEqual(current_hash, previous_hash)

    def test_added_parameter_forces_checkpoint(self):
        previous_params = {
            "layer.weight": np.zeros((8, 8), dtype=np.float32),
        }
        current_params = {
            "layer.weight": np.zeros((8, 8), dtype=np.float32),
            "layer.bias": np.zeros((8,), dtype=np.float32),
        }
        previous_hash = compute_architecture_hash(previous_params, framework="pytorch")
        current_hash = compute_architecture_hash(current_params, framework="pytorch")

        commit_type, architecture_changed = resolve_commit_type(current_hash, previous_hash)

        self.assertEqual(commit_type, "CHECKPOINT")
        self.assertTrue(architecture_changed)
        self.assertNotEqual(current_hash, previous_hash)

    def test_removed_parameter_forces_checkpoint(self):
        previous_params = {
            "layer.weight": np.zeros((8, 8), dtype=np.float32),
            "layer.bias": np.zeros((8,), dtype=np.float32),
        }
        current_params = {
            "layer.weight": np.zeros((8, 8), dtype=np.float32),
        }
        previous_hash = compute_architecture_hash(previous_params, framework="pytorch")
        current_hash = compute_architecture_hash(current_params, framework="pytorch")

        commit_type, architecture_changed = resolve_commit_type(current_hash, previous_hash)

        self.assertEqual(commit_type, "CHECKPOINT")
        self.assertTrue(architecture_changed)
        self.assertNotEqual(current_hash, previous_hash)

    def test_delta_guard_raises_on_architecture_mismatch(self):
        with self.assertRaises(ArchitectureMismatch):
            ensure_matching_architecture("abc", "def")


class ReconstructionBoundaryTest(unittest.TestCase):
    def _write_npz(self, path: Path, payload: dict[str, np.ndarray]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        np.savez(path, **payload)

    def _write_commit(self, commit_dir: Path, commit_data: dict) -> None:
        commit_dir.mkdir(parents=True, exist_ok=True)
        with open(commit_dir / "commit.json", "w", encoding="utf-8") as handle:
            json.dump(commit_data, handle, indent=2)

    def test_reconstruction_stops_at_nearest_checkpoint(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            flair_dir = root / ".flair"
            local_commits_dir = flair_dir / ".local_commits"
            local_commits_dir.mkdir(parents=True)

            checkpoint_a_hash = "checkpoint-a"
            delta_b_hash = "delta-b"
            checkpoint_c_hash = "checkpoint-c"
            delta_d_hash = "delta-d"

            architecture_a = {
                "w": np.zeros((2, 2), dtype=np.float32),
                "b": np.zeros((2,), dtype=np.float32),
            }
            architecture_b = {
                "w": np.zeros((3, 2), dtype=np.float32),
            }

            arch_hash_a = compute_architecture_hash(architecture_a, framework="pytorch")
            arch_hash_b = compute_architecture_hash(architecture_b, framework="pytorch")

            commit_a_dir = local_commits_dir / checkpoint_a_hash
            self._write_npz(commit_a_dir / "params.npz", architecture_a)
            self._write_commit(
                commit_a_dir,
                {
                    "commitHash": checkpoint_a_hash,
                    "commitType": "CHECKPOINT",
                    "architecture": "pytorch",
                    "architectureHash": arch_hash_a,
                    "previousArchitectureHash": None,
                    "architectureChanged": False,
                    "params": {"file": "params.npz"},
                    "deltaParams": None,
                },
            )

            commit_b_dir = local_commits_dir / delta_b_hash
            self._write_npz(commit_b_dir / "params.npz", {"w": np.ones((2, 2), dtype=np.float32)})
            self._write_npz(commit_b_dir / ".delta_params" / "delta.npz", {"w": np.ones((2, 2), dtype=np.float32)})
            self._write_commit(
                commit_b_dir,
                {
                    "commitHash": delta_b_hash,
                    "commitType": "DELTA",
                    "architecture": "pytorch",
                    "architectureHash": arch_hash_a,
                    "previousArchitectureHash": arch_hash_a,
                    "architectureChanged": False,
                    "params": {"file": "params.npz"},
                    "deltaParams": {"file": "delta.npz"},
                    "previousCommitHash": checkpoint_a_hash,
                },
            )

            commit_c_dir = local_commits_dir / checkpoint_c_hash
            self._write_npz(commit_c_dir / "params.npz", architecture_b)
            self._write_commit(
                commit_c_dir,
                {
                    "commitHash": checkpoint_c_hash,
                    "commitType": "CHECKPOINT",
                    "architecture": "pytorch",
                    "architectureHash": arch_hash_b,
                    "previousArchitectureHash": arch_hash_a,
                    "architectureChanged": True,
                    "params": {"file": "params.npz"},
                    "deltaParams": None,
                    "previousCommitHash": delta_b_hash,
                },
            )

            commit_d_dir = local_commits_dir / delta_d_hash
            current_d_params = {"w": np.full((3, 2), 2.0, dtype=np.float32)}
            self._write_npz(commit_d_dir / "params.npz", current_d_params)
            self._write_npz(commit_d_dir / ".delta_params" / "delta.npz", {"w": np.ones((3, 2), dtype=np.float32)})
            self._write_commit(
                commit_d_dir,
                {
                    "commitHash": delta_d_hash,
                    "commitType": "DELTA",
                    "architecture": "pytorch",
                    "architectureHash": arch_hash_b,
                    "previousArchitectureHash": arch_hash_b,
                    "architectureChanged": False,
                    "params": {"file": "params.npz"},
                    "deltaParams": {"file": "delta.npz"},
                    "previousCommitHash": checkpoint_c_hash,
                },
            )

            with patch("pathlib.Path.cwd", return_value=root):
                reconstructed_b = _reconstruct_params_from_checkpoint(delta_b_hash, "pytorch")
                reconstructed_d = _reconstruct_params_from_checkpoint(delta_d_hash, "pytorch")

            self.assertIsNotNone(reconstructed_b)
            self.assertIsNotNone(reconstructed_d)

            np.testing.assert_allclose(reconstructed_b["w"], np.ones((2, 2), dtype=np.float32))
            np.testing.assert_allclose(reconstructed_d["w"], np.full((3, 2), 2.0, dtype=np.float32))

            self.assertEqual(reconstructed_b["w"].shape, (2, 2))
            self.assertEqual(reconstructed_d["w"].shape, (3, 2))


if __name__ == "__main__":
    unittest.main()
