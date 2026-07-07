"""SSH setup helpers for Flair CLI."""
from __future__ import annotations

import base64
import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


SSH_SETUP_METADATA_PATH = Path.home() / ".flair" / "ssh.json"


@dataclass(frozen=True)
class SSHSetupMetadata:
    key_path: str
    public_key_path: str
    principal: str
    public_key: str
    created_at: str


def default_ssh_key_path() -> Path:
    """Return the default Flair SSH key path."""
    return Path.home() / ".ssh" / "id_ed25519_flair"


def _compute_fingerprint_from_public_key(public_key_openssh: str) -> str:
    key_parts = public_key_openssh.strip().split()
    if len(key_parts) < 2:
        raise ValueError("Invalid OpenSSH public key format.")

    key_blob = base64.b64decode(key_parts[1].encode("ascii"), validate=True)
    digest = hashlib.sha256(key_blob).digest()
    fingerprint = base64.b64encode(digest).decode("ascii").rstrip("=")
    return f"ssh:SHA256:{fingerprint}"


def generate_ssh_keypair(key_path: Path, passphrase: Optional[str] = None, overwrite: bool = False) -> SSHSetupMetadata:
    """Generate an Ed25519 SSH keypair and write it to disk."""
    if key_path.exists() and not overwrite:
        raise FileExistsError(f"SSH key already exists at {key_path}")

    key_path.parent.mkdir(parents=True, exist_ok=True)

    private_key = Ed25519PrivateKey.generate()
    encryption = (
        serialization.BestAvailableEncryption(passphrase.encode("utf-8"))
        if passphrase
        else serialization.NoEncryption()
    )

    private_key_bytes = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.OpenSSH,
        encryption_algorithm=encryption,
    )
    key_path.write_bytes(private_key_bytes)

    try:
        key_path.chmod(0o600)
    except Exception:
        pass

    public_key_openssh = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.OpenSSH,
        format=serialization.PublicFormat.OpenSSH,
    ).decode("utf-8")

    public_key_path = Path(f"{key_path}.pub")
    public_key_path.write_text(public_key_openssh + "\n", encoding="utf-8")

    metadata = SSHSetupMetadata(
        key_path=str(key_path),
        public_key_path=str(public_key_path),
        principal=_compute_fingerprint_from_public_key(public_key_openssh),
        public_key=public_key_openssh,
        created_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    )
    save_ssh_setup_metadata(metadata)
    return metadata


def save_ssh_setup_metadata(metadata: SSHSetupMetadata) -> None:
    """Persist SSH setup metadata for Flair commands."""
    SSH_SETUP_METADATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    SSH_SETUP_METADATA_PATH.write_text(json.dumps(metadata.__dict__, indent=2), encoding="utf-8")


def load_ssh_setup_metadata() -> Optional[SSHSetupMetadata]:
    """Load SSH setup metadata if it exists."""
    if not SSH_SETUP_METADATA_PATH.exists():
        return None

    try:
        data = json.loads(SSH_SETUP_METADATA_PATH.read_text(encoding="utf-8"))
        return SSHSetupMetadata(
            key_path=data["key_path"],
            public_key_path=data["public_key_path"],
            principal=data["principal"],
            public_key=data["public_key"],
            created_at=data["created_at"],
        )
    except Exception:
        return None


def build_activation_script(shell: str, key_path: Path) -> str:
    """Build a shell snippet that sets the SSH-related env vars for Flair."""
    shell_name = shell.strip().lower()
    normalized_path = str(key_path)

    if shell_name in {"powershell", "pwsh"}:
        return "\n".join([
            f"$env:FLAIR_SSH_KEY_PATH = \"{normalized_path}\"",
            '$env:FLAIR_SSH_KEY_PASSPHRASE = Read-Host -AsSecureString "Enter SSH key passphrase"',
            '$env:SSH_ASKPASS_PASSWORD = $env:FLAIR_SSH_KEY_PASSPHRASE',
        ])

    if shell_name in {"cmd", "bat"}:
        return "\n".join([
            f"set FLAIR_SSH_KEY_PATH={normalized_path}",
            "set /p FLAIR_SSH_KEY_PASSPHRASE=Enter SSH key passphrase: ",
            "set SSH_ASKPASS_PASSWORD=%FLAIR_SSH_KEY_PASSPHRASE%",
        ])

    return "\n".join([
        f"export FLAIR_SSH_KEY_PATH='{normalized_path}'",
        'read -rsp "Enter SSH key passphrase: " FLAIR_SSH_KEY_PASSPHRASE',
        "echo",
        "export FLAIR_SSH_KEY_PASSPHRASE",
        'export SSH_ASKPASS_PASSWORD="$FLAIR_SSH_KEY_PASSPHRASE"',
    ])