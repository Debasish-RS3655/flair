# SSH Integration

Flair CLI now uses standard SSH tooling for commit signing:

- private keys live in `~/.ssh`
- `ssh-agent` keeps unlocked keys in memory
- the backend stores the registered public key for the authenticated Flair account
- commit verification uses the SSH fingerprint plus the stored public key

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

## Notes

- Flair no longer relies on `FLAIR_SSH_KEY_PASSPHRASE` or `SSH_ASKPASS_PASSWORD` for SSH commit signing.
- Flair does not store SSH passphrases or a local SSH metadata file.
- If you rotate a key, rerun `flair auth ssh setup` to register the new public key, then load it into `ssh-agent` with `ssh-add`.