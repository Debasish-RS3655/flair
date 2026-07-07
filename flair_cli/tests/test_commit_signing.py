from __future__ import annotations

import unittest

from flair_cli.cli.utils.commit_signing import build_canonical_payload, canonicalize_payload


class CanonicalPayloadTest(unittest.TestCase):
    def test_canonicalize_payload_preserves_backend_field_order(self) -> None:
        payload = build_canonical_payload(
            session_jti="session-123",
            signed_at="2026-07-07T12:00:00Z",
            params_ipfs_id="params-cid",
            param_hash="param-hash",
            previous_commit_hash="parent-hash",
            architecture="pytorch",
            commit_type="CHECKPOINT",
            message="initial commit",
            metrics={"accuracy": 0.99, "nested": {"b": 2, "a": 1}},
        )

        canonical_json = canonicalize_payload(payload)

        self.assertEqual(
            canonical_json,
            (
                '{"sessionJti":"session-123",'
                '"signedAt":"2026-07-07T12:00:00Z",'
                '"paramsIpfsId":"params-cid",'
                '"paramHash":"param-hash",'
                '"previousCommitHash":"parent-hash",'
                '"architecture":"pytorch",'
                '"architectureHash":null,'
                '"commitType":"CHECKPOINT",'
                '"message":"initial commit",'
                '"metrics":{"accuracy":0.99,"nested":{"a":1,"b":2}}}'
            ),
        )


if __name__ == "__main__":
    unittest.main()