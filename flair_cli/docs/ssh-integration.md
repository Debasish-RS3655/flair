# SSH Integration

Flair CLI now supports SSH keys as the commit signing mechanism alongside the existing Solana wallet flow.

## What the CLI uses

- `flair auth ssh setup` creates or registers a dedicated SSH key for Flair commit signing.
- `flair auth ssh env` generates a shell activation snippet for the current session.
- `flair auth ssh status` verifies the key, metadata, env vars, and session principal.

The signing path uses these values:

- `FLAIR_SSH_KEY_PATH` for the private key location
- `FLAIR_SSH_KEY_PASSPHRASE` for the key passphrase
- `SSH_ASKPASS_PASSWORD` as a fallback passphrase source for non-interactive signing

## Recommended key location

The default setup command uses a dedicated Flair key instead of reusing a personal SSH identity:

```text
~/.ssh/id_ed25519_flair
```

The setup command also stores metadata in:

```text
~/.flair/ssh.json
```

That metadata lets Flair discover the configured SSH key automatically even if `FLAIR_SSH_KEY_PATH` is not set yet.

## Typical setup flow

```bash
flair auth ssh setup
```

If you want an encrypted SSH key, allow the setup command to prompt for a passphrase. If you want a key without a passphrase, use `--no-passphrase`.

Then generate the shell activation snippet for the shell you actually use:

```bash
flair auth ssh env --shell powershell --output ~/.flair/activate-ssh.ps1
```

For bash-like shells:

```bash
flair auth ssh env --shell bash --output ~/.flair/activate-ssh.sh
```

The activation script is designed to be sourced in the current shell session so the environment variables are available to the CLI process.

## Commit signing flow

When you run `flair push`, the CLI:

1. Loads the current session principal.
2. Resolves the SSH key path from `FLAIR_SSH_KEY_PATH`, saved Flair metadata, or the default key path.
3. Loads the SSH private key and prompts via the shell script env vars when a passphrase is required.
4. Signs the canonical commit payload.
5. Sends the signature to the backend, which verifies it against the stored SSH public key for the matching `ssh:SHA256:<fingerprint>` principal.

## Notes

- The CLI does not store your SSH passphrase in the repo or in `~/.flair/ssh.json`.
- The `env` command is the supported way to prepare `FLAIR_SSH_KEY_PASSPHRASE` and `SSH_ASKPASS_PASSWORD` for a shell session.
- If you rotate your SSH key, rerun `flair auth ssh setup` and then re-generate the env snippet.