# SSH Integration

Flair CLI now uses standard SSH tooling for commit signing:

- private keys live in `~/.ssh`
- `ssh-agent` keeps unlocked keys in memory
- the backend stores the registered public key for the authenticated Flair account
- commit verification uses the SSH fingerprint plus the stored public key

## Key Architectural Decisions

1. SSH is the signing authority.
Flair does not implement custom key custody. Local signing uses `ssh-agent` and `ssh-add`.

2. Account authentication and signing identity are separated.
User login/session still identifies the Flair account, while SSH fingerprints identify which key signed the commit.

3. Backend trust is based on registered public keys.
The backend verifies commit signatures only against SSH public keys registered to the authenticated user.

4. Canonical payload bytes are stable across client and server.
Signing and verification rely on deterministic commit payload canonicalization so signatures are reproducible.

5. Fingerprint-based key selection is explicit.
The CLI chooses an `ssh-agent` identity only if its fingerprint matches a backend-registered key.

## Core Design Principles

1. Use standard platform primitives first.
Prefer OpenSSH key files and agent behavior over Flair-specific passphrase or key-management mechanisms.

2. Minimize secret handling.
Passphrases remain in the OS/SSH workflow; Flair does not persist or transport private key secrets.

3. Enforce explicit identity binding.
A signature is accepted only when it is tied to both an authenticated Flair account and a registered SSH fingerprint.

4. Keep signing deterministic and auditable.
Canonical payload construction and backend verification rules must remain strict and version-safe.

5. Fail closed.
If no matching agent key is loaded, no matching backend key is registered, or verification fails, commit finalization is rejected.

## Dataflow

### Registration Dataflow (`flair auth ssh setup`)

1. User logs in to Flair (`flair auth login`).
2. CLI generates a dedicated SSH keypair (or reuses an existing one).
3. CLI computes the SSH fingerprint from the public key.
4. CLI calls backend key-registration endpoint with the OpenSSH public key.
5. Backend stores the public key and fingerprint as an identity for that user account.

### Signing and Verification Dataflow (`flair push`)

1. CLI loads the authenticated Flair session principal.
2. CLI fetches the user's registered SSH keys from the backend.
3. CLI loads available identities from `ssh-agent`.
4. CLI selects the first agent identity whose fingerprint matches a registered backend fingerprint.
5. CLI builds the canonical commit payload and signs it through `ssh-agent`.
6. CLI sends commit finalization request with signature and `sshKeyFingerprint`.
7. Backend resolves the authenticated user account.
8. Backend looks up that user's registered public key for `sshKeyFingerprint`.
9. Backend re-builds canonical payload and verifies signature against the stored public key.
10. On success, backend finalizes commit; otherwise it rejects the request.

## Commands

```bash
flair auth ssh setup
flair auth ssh env
flair auth ssh status
```

### `flair auth ssh setup`

Creates a dedicated Flair signing key by default at:

```text
~/.ssh/id_ed25519_flair
```

Then it registers the public key with the Flair backend for the currently logged-in account.

Prerequisite: run `flair auth login` first so the backend can associate the key with your account.

If the key does not already exist, Flair generates it and writes the companion public key file:

```text
~/.ssh/id_ed25519_flair.pub
```

### `flair auth ssh env`

Prints a shell snippet for the current shell that starts `ssh-agent` and loads the Flair signing key with `ssh-add`.

Typical usage:

```bash
flair auth ssh env --shell powershell --output ~/.flair/activate-ssh.ps1
```

For bash-like shells:

```bash
flair auth ssh env --shell bash --output ~/.flair/activate-ssh.sh
```

The generated snippet does not set Flair-specific environment variables. It only prepares the standard SSH agent workflow.

If the key is already loaded in your current `ssh-agent` session, you do not need to run this command again.

### `flair auth ssh status`

Shows:

- the default SSH key path
- whether the key exists
- how many keys are currently loaded in `ssh-agent`
- how many SSH keys are registered for the logged-in Flair account

## Commit Signing Flow

When you run `flair push`, the CLI:

1. Loads the current Flair session principal.
2. Queries the backend for SSH keys registered to that account.
3. Reads the identities currently loaded in `ssh-agent`.
4. Picks an agent key whose fingerprint matches a registered Flair SSH key.
5. Signs the canonical commit payload through the agent.
6. Sends the signature and SSH fingerprint to the backend.
7. The backend looks up the registered public key for that fingerprint and verifies the commit signature.

## Setup Recipe

1. Sign in with `flair auth login`.
2. Run `flair auth ssh setup` to generate or register the SSH key.
3. Load the key into `ssh-agent` with `ssh-add` or use `flair auth ssh env` to generate a helper snippet.
4. Confirm the key is visible with `flair auth ssh status`.
5. Run `flair push` to sign commits with the registered SSH identity.

## Notes

- Flair no longer relies on `FLAIR_SSH_KEY_PASSPHRASE` or `SSH_ASKPASS_PASSWORD` for SSH commit signing.
- Flair does not store SSH passphrases or a local SSH metadata file.
- If you rotate a key, rerun `flair auth ssh setup` to register the new public key, then load it into `ssh-agent` with `ssh-add`.