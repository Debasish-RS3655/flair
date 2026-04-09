# Flair CLI

Flair CLI is a local-first command-line tool for versioning trained machine learning models. It brings Git-style workflows—commits, branches, merges, rollback, and deterministic history—to model parameters and training artifacts, while preserving reproducibility and optional privacy-preserving collaboration.


## Table of Contents

- [Authentication](#authentication)
- [Status Command](#status-command)
- [Log Command](#log-command)
- [Diff Command](#diff-command)
- [Metrics Command](#metrics-command)
- [Repository Commands](#repository-commands)
   - [Create sample model files](#create-sample-model-files)
   - [Init repository with automatic base model detection](#init-repository-with-automatic-base-model-detection)
   - [Skip base model prompt during init](#skip-base-model-prompt-during-init)
- [Clone a repository](#cloning-a-repository)
- [Base model Commands](#base-model-commands)
   - [Upload base model manually](#upload-base-model-manually)
   - [Replace existing base model](#replace-existing-base-model-admin-command)
   - [Force upload without prompts](#force-upload-without-prompts)
   - [Check if base model exists](#check-if-base-model-exists)
   - [Delete base model](#delete-base-model-admin-command)
   - [Download base model](#download-base-model)
- [Branch Functions](#branch-functions)
   - [Create a new branch](#create-a-new-branch)
   - [List all branches](#list-all-branches)
   - [Delete a branch](#delete-a-branch)
   - [Switch branches](#switch-branches)
- [Commit Workflow](#commit-workflow)
   - [Create a new local commit](#create-a-new-local-commit)
   - [Create model params](#create-model-params)
   - [Zero-Knowledge Proofs (ZKP)](#zero-knowledge-proofs-zkp)
   - [Finalize commit with message](#finalize-commit-with-message)
- [Push Commits](#push-commits)
- [Revert Commits](#revert-commits)
- [Reset Commits](#reset-commits)
- [Directory structure (CLI)](#directory-structure-cli)
- [Complete Workflow Example](#complete-workflow-example)
- [Validation Rules](#validation-rules)

## Authentication

```bash
flair auth login
## Opening browser for SIWS authentication...
## ✓ Authenticated as you@example.com
flair auth status
## Logged in: you@example.com
flair auth logout
## ✓ Logged out
```

## Status Command

Use `flair status` to quickly inspect local repository state and sync progress.

It reports:
- Current branch
- Current HEAD
- Current local commit
- Whether there is an unfinished local commit
- Whether params / ZKP / message are present for the latest local commit
- Number of unpushed commits

```bash
flair status
## Branch: main
## HEAD: a1b2c3d4...
## Current local commit: z9y8x7w6...
## Unfinished local commit: yes
## Params: ✓
## ZKP: ✗
## Message: ✗
## Unpushed commits: 2
```

Notes:
- `Unfinished local commit` is `yes` when the latest local commit is missing params, ZKP, message, or commit type.
- `Unpushed commits` counts complete local commits that are not yet part of the remote branch head.

## Log Command

Use `flair log` to view readable commit history (newest first).

```bash
flair log
## d4e5f6g7... Fine-tuned hyperparameters
## c3d4e5f6... Improved accuracy to 95%
## b2c3d4e5... Updated with training data v2
## a1b2c3d4... Initial model commit
```

Optional flags:

```bash
flair log --graph
flair log --branch experimental
flair log --limit 10
```

Notes:
- `--graph` adds a simple graph-style prefix to each entry.
- `--branch` targets a specific branch head when available.
- `--limit` controls the maximum number of commits printed (default: 50).

## Diff Command

Use `flair diff` to semantically compare two model commits. This command is designed for federated learning and model reproducibility validation.

The diff is **semantic**, not raw tensors. It focuses on understanding how the model changed, not exact numerical values.

### Basic Usage

Compare two commits and get an overview:

```bash
flair diff 9f2c... b71e...
## Commit A: 9f2c...
## Commit B: b71e...
## 
## Architecture: unchanged
## Parameters changed: 12.4M / 14.1M (87.9%)
## 
## Overall Change
## ┌─────────────────────────────────────────────┐
## │ Mean parameter delta norm: 0.021            │
## │ Max parameter delta norm: 0.184             │
## │ Cosine similarity between models: 0.992     │
## └─────────────────────────────────────────────┘
## 
## Largest layer changes:
##   classifier.fc3.weight Δ norm: 0.184 (100.0% changed)
##   classifier.fc3.bias Δ norm: 0.071 (55.2% changed)
##   encoder.layer4.weight Δ norm: 0.053 (38.1% changed)
##   encoder.layer4.bias Δ norm: 0.028 (22.0% changed)
##   encoder.layer3.weight Δ norm: 0.019 (15.3% changed)
##
## Federated Merge Readiness
##   Architecture compatible: ✓
##   Parameter dimensions compatible: ✓
##   Update magnitude: moderate
##   Recommended merge weight: 0.18
```

Notes:
- The diff output only shows metadata fields that are actually stored in both commits.
- Training-only values such as `epochs`, `learning_rate`, and `accuracy` are not shown unless they are explicitly stored in a structured `metrics` object.

### Detailed Mode

Show all changed layers, not just the top 5:

```bash
flair diff <commitA> <commitB> --detailed
```

This produces a full table with all layers:

```
Layer Statistics
┌──────────────────────────────┬───────────┬──────────┬────────────┬──────────────┐
│ Layer                        │ Shape     │ Δ Norm   │ % Changed  │ Max │Δ│      │
├──────────────────────────────┼───────────┼──────────┼────────────┼──────────────┤
│ classifier.fc3.weight        │ 10x512    │ 0.184234 │ 100.00%    │ 0.024582     │
│ classifier.fc3.bias          │ 10        │ 0.071456 │ 55.20%     │ 0.018934     │
│ encoder.layer4.weight        │ 128x256   │ 0.053189 │ 38.10%     │ 0.012745     │
│ encoder.layer4.bias          │ 128       │ 0.028456 │ 22.00%     │ 0.008921     │
│ encoder.layer3.weight        │ 128x128   │ 0.019234 │ 15.30%     │ 0.005678     │
└──────────────────────────────┴───────────┴──────────┴────────────┴──────────────┘
```

### JSON Output

For programmatic consumption, use `--json`:

```bash
flair diff <commitA> <commitB> --json
```

Returns a machine-readable JSON object with structure:

```json
{
  "commitA": "9f2c...",
  "commitB": "b71e...",
  "architectureCompatible": true,
  "overall": {
    "total_parameters": 14768384,
    "changed_parameters": 12957568,
    "percent_changed": 87.8,
    "mean_delta_norm": 0.021342,
    "max_delta_norm": 0.184234,
    "cosine_similarity": 0.9924
  },
  "layers": [
    {
      "name": "classifier.fc3.weight",
      "shape": [10, 512],
      "delta_norm": 0.184234,
      "percent_changed": 100.0,
      "max_abs_difference": 0.024582
    }
  ],
   "metadataChanges": {
      "contributor": { "old": "Rahul", "new": "Raj" },
      "notes": { "old": "baseline run", "new": "added augmentation" }
   },
   "metricChanges": {
      "validation_loss": { "old": 0.42, "new": 0.31 },
      "f1_score": { "old": 0.91, "new": 0.94 }
   },
  "mergeReadiness": {
    "architecture_compatible": true,
    "parameter_dimensions_compatible": true,
    "merge_possible": true,
    "update_magnitude": "moderate",
    "recommended_merge_weight": 0.18
  }
}
```

### What the Diff Computes

**Architecture Validation**

If the two commits have different `architectureHash` values, the diff terminates with an error:

```
Cannot diff commits with different model architectures.
  Architecture Hash A: a1b2c3d4...
  Architecture Hash B: x9y8z7w6...
```

**Overall Statistics**

- **Total parameters**: Count of all model weights and biases
- **Changed parameters**: Number of elements where values differ
- **Percent changed**: Percentage of total parameters that changed
- **Mean delta norm**: Average L2 norm of per-parameter deltas
- **Max delta norm**: Largest L2 norm across all parameters
- **Cosine similarity**: Similarity between full flattened parameter vectors (1.0 = identical, 0.0 = orthogonal)

**Per-Layer Statistics**

For each parameter/layer:
- **Δ Norm**: L2 norm of the difference tensor
- **Percent Changed**: Percentage of non-zero deltas in this layer
- **Max |Δ|**: Maximum absolute value of any single change

Results are sorted by delta norm (descending) to highlight the most-changed layers first.

**Metadata Comparison**

If commits have different non-internal metadata fields that are present in both commits, they're listed. Training-only values like `epochs`, `learning_rate`, and top-level `accuracy` are intentionally omitted unless stored under a structured `metrics` object:

```
Metadata changes:
   contributor: Alice -> Raj
   notes: baseline -> fine-tuned with augmentation
```

**Metric Comparison**

If both commits store a structured `metrics` object, matching metric keys are highlighted:

```
Metrics:
  validation_loss: 0.42 -> 0.31 ↓
   f1_score: 0.91 -> 0.94 ↑
```

If no `metrics` object exists in commit metadata, this section is omitted.
When present, metric values are sourced from each commit's stored `metrics` object (for example, values staged with `flair metrics set` and captured during `flair commit`).

## Metrics Command

Use `flair metrics` to stage metrics in `.flair/metrics.json`.

Supported options for `flair metrics set`:
- `--epoch`
- `--accuracy`
- `--val-loss`
- `--train-loss`
- `--precision`
- `--recall`
- `--f1`
- `--learning-rate`
- `--notes`

```bash
flair metrics set --epoch 15 --accuracy 0.935 --val-loss 0.31
flair metrics import
flair metrics import --source ./mlruns --run-id <run_id>
flair metrics show
flair metrics reset
```

Behavior:
- Staging file is always `.flair/metrics.json`
- `set` merges provided fields and updates `updatedAt`
- `import` scans MLflow logs (default `./mlruns`), imports the latest run metrics, and merges into staged metrics
- `show` prints current staged metrics
- `reset` deletes staged metrics
- `flair commit` copies staged metrics into commit metadata under `metrics` and then clears `.flair/metrics.json`

**Federated Merge Readiness**

This section is designed for federated learning workflows:

- **Architecture compatible**: ✓ if `architectureHash` matches
- **Parameter dimensions compatible**: ✓ if all shapes match
- **Update magnitude**: `small` (mean delta < 0.01), `moderate` (0.01–0.1), or `large` (> 0.1)
- **Recommended merge weight**: Heuristic weight (0–1) for how much to blend this update into the global model, based on cosine similarity and magnitude

Example interpretation:
- A `small` update with high similarity (0.99+) → blend weight ~0.15
- A `moderate` update with good similarity (0.95+) → blend weight ~0.18
- A `large` update with lower similarity (< 0.9) → blend weight ~0.12

## Repository Commands

### Create sample model files

Generate sample model scaffolds to help you get started quickly. The generated files include example architectures and usage patterns.

```bash
flair new --example pytorch
## ✓ PyTorch sample model created: model_pytorch.py
## 
## The file includes:
##   • Sample CNN model class
##   • Example save/load functions
##   • Usage examples
## 
## To save your model for Flair:
##   1. Modify the model as needed
##   2. Run the script to generate model.pt
##   3. Use 'flair params create --model model.pt'

flair new --example tensorflow
## ✓ TensorFlow sample model created: model_tensorflow.py
## 
## The file includes:
##   • Sample CNN model (Sequential API)
##   • Alternative Functional API example
##   • Example save/load functions
##   • Usage examples

flair new --example pytorch --output my_model.py  # Custom output filename
## ✓ PyTorch sample model created: my_model.py
```

**Note:** The generated files are only sample scaffolds. You are free to modify or ignore them. Flair does not require any specific architecture format.

### Init repository with automatic base model detection

```bash
flair init --description "My model"
## Found 2 base model file(s):
##   1. model.pt
##   2. architecture.onnx
## Would you like to upload a base model now? [y/N]: y
## Select file number (1-2): 1
## ✓ Base model uploaded successfully!
```

### Skip base model prompt during init

```bash
flair init --skip-base-model
## ✓ Repository initialized without base model upload
```

## cloning a repository

saves to .flair/repo.json and .flair/branch.json and creates three files
saves repo metadata to .flair/repo.json plus branch pointers in .flair/HEAD and .flair/branches.json,
and downloads the latest artifacts (base_model.<ext>, params.<ext>, zkml_proof.json,
zkml_settings.json, zkml_verification_key.json) into the repo root

```bash
flair clone <repo_hash>
flair clone <repo_hash> --target-dir ./repo
flair clone <repo_hash> --branch main
flair clone <repo_hash> --branch-hash main
## Cloning repository...
## ✓ Saved metadata to .flair/repo.json
## ✓ Downloaded base_model, params, zkml_proof, zkml_settings, zkml_verification_key
## Current branch: main
```

## Base model Commands

### Upload base model manually

```bash
flair basemodel add model.pt
## Uploading model.pt (42.0 MB)...
## ✓ Base model uploaded
```

### Replace existing base model (admin command)

```bash
flair basemodel add new_model.h5
## ⚠ Base model already exists
## Do you want to replace it? [y/N]: y
## Uploading new_model.h5 (55.3 MB)...
## ✓ Base model replaced
```

### Force upload without prompts

```bash
flair basemodel add model.keras --force
## Uploading model.keras (120.7 MB)...
## ✓ Base model uploaded (forced)
```

### Check if base model exists

```bash
flair basemodel check
## Base model exists: true
## Name: base_model.pt
## Size: 42.0 MB
```

### Delete base model (admin command)

```bash
flair basemodel delete
## ✓ Base model deleted
```

### Download base model

```bash
flair basemodel download
flair basemodel download --target-dir ./models
## Downloading base model to ./models/base_model.pt
## ✓ Download complete
```

## Branch Functions

### create a new branch
```bash
flair branch new-feature  # Create new branch from current
## ✓ Branch 'new-feature' created from current
```

### list all branches
```bash
flair branch              # List all branches
## Branches:
## * main
##   new-feature
```

### delete a branch
```bash
flair branch -d old-branch  # Delete a branch
## ✓ Branch 'old-branch' deleted
```


### switch branches
```bash
flair checkout main              # Uses cache if available, downloads otherwise
flair checkout feature --no-cache # Force fresh download from API
## Caching artifacts for 'main'...
## ✓ Restored artifacts from cache
## ✓ Switched to branch 'feature'
```

## Commit Workflow

### Create a new local commit
Creates a new commit in `.flair/.local_commits/` with a unique UUID. This must be done before creating params or ZKP.

Commit structure:

```json
{
   "commitHash": "commit_hash",
   "architecture": "pytorch|tensorflow|onnx",
   "params": "parameters if a checkpoint commit",
   "deltaParams": "delta parameters if a delta commit",
   "zkp": "zkps",
   "metrics": {
      "epochs": null,
      "learning_rate": null,
      "accuracy": null
   },
   "message": "commit message",
   "commitType": "CHECKPOINT|DELTA",
   "architectureHash": "current hash of the model architecture",
   "previousArchitectureHash": "previous hash of the model architecture",
   "architectureChanged": "true|false",
   "createdAt": "time when flair commit is executed",
   "status": "CREATED"
}
```

```bash
flair add
## ✓ New local commit created
##   Commit hash: a1b2c3d4...
##   Location: .flair/.local_commits/a1b2c3d4.../
## 
## Next steps:
##   1. Run 'flair params create' to add model parameters
##   2. Run 'flair zkp create' to generate zero-knowledge proof
##   3. Run 'flair commit -m "Your message"' to finalize commit
##   4. Run 'flair push' to upload commit to repository
```

**Note:** You cannot create a new commit until the current one is complete (has both params and ZKP).

### Create model params
Extracts model parameters and saves them to the current commit directory.
Automatically detects framework (.pt, .pth for PyTorch, .h5, .keras for TensorFlow, or .onnx).

Metrics are no longer read from project-root files during `flair params create`.
Use `flair metrics set` to stage metrics in `.flair/metrics.json` before running `flair commit`.

Each params extraction also computes and stores an `architectureHash` for the commit.
The hash is deterministic and derived from parameter names, parameter order, and tensor shapes
(plus framework metadata when available).

**Prerequisites:** Must run `flair add` first to create a commit.

```bash
flair params create                # Auto-detect model in current directory
flair params create --model model.pt  # Specify PyTorch model
flair params create --model model.h5  # Specify TensorFlow model
## ✓ Parameters saved to commit directory
##   File: params.pt
##   Hash: 1a2b3c4d5e6f7g8h...
##   Architecture hash: ab12cd34ef56...
## 
## Next steps:
##   1. (Optional) Run 'flair zkp create' to generate zero-knowledge proof
##   2. Run 'flair commit -m "Your message"' to finalize commit and compute delta
##   3. Run 'flair push' to upload commit to repository
```

**Extraction details:**
1. PyTorch: Extracts state_dict and saves as .pt
2. TensorFlow: Extracts weights as numpy arrays and saves as .npz
3. ONNX: Extracts initializers and saves as .npz

**Storage optimization (Advanced):**
Full parameters are automatically managed by the `flair commit` command:
- **Genesis commit (CHECKPOINT)**: Full parameters retained
- **Matching architecture commits (DELTA)**: Delta computed and stored; cleanup deletes full params from older commits
- **Changed architecture commits (CHECKPOINT)**: Full parameters stored automatically (delta is skipped)
- **Latest 2 commits**: Always retain full parameters for reliable delta computation
- **Older commits**: Only store deltas (~90-95% smaller than full params)
- **Reconstruction**: If a previous commit's full params are deleted, they are automatically reconstructed from the nearest compatible CHECKPOINT by applying deltas serially

This strategy provides significant storage savings (95%+ for large commit histories) while maintaining data integrity.

**Note:** You cannot overwrite existing params. To create new params, run `flair add` to create a new commit first.

## Zero-Knowledge Proofs (ZKP)

### Create a ZKP for your model
Generates a zero-knowledge proof for the model in the current commit directory.
Automatically detects model framework, converts to ONNX if needed, and generates
the proof using EZKL directly in the CLI. No external server required.

**Prerequisites:** 
- Must run `flair add` to create a commit
- Must run `flair params create` to extract parameters (optional but recommended)

Supports:
- PyTorch models (.pt, .pth)
- TensorFlow models (.h5, .keras)
- ONNX models (.onnx)

```bash
flair zkp create                                    # Auto-detect model with default input dims [1, 3, 224, 224]
## Generating Zero-Knowledge Proof using EZKL...
## This may take several minutes depending on model complexity...
## 
## Step 1/10: Generating input data...
## Step 2/10: Generating calibration data...
## Step 3/10: Generating settings...
## Step 4/10: Calibrating settings...
## Step 5/10: Compiling circuit...
## Step 6/10: Getting SRS (Structured Reference String)...
## Step 7/10: Generating witness...
## Step 8/10: Setting up proving and verification keys...
## Step 9/10: Generating proof...
## Step 10/10: Verifying proof...
## ✓ All EZKL steps completed successfully!
## ✓ ZKP created successfully!
## Saved to: a1b2c3d4.../
## Proof files: proof.zlib, verification_key.zlib, settings.zlib
## 
## Next steps:
##   • Run 'flair commit -m "Your message"' to finalize this commit
##   • Run 'flair push' to push this commit to the repository

flair zkp create --input-dims "[1, 3, 256, 256]"   # Custom input dimensions
flair zkp create --model custom.pt                  # Specify model file
flair zkp create --backend pytorch                  # Specify backend (pytorch/tensorflow/numpy)
flair zkp create --model model.h5 --input-dims "[1, 224, 224, 3]"  # TensorFlow model
```

**Note:** You cannot overwrite an existing ZKP. To create a new ZKP, run `flair add` to create a new commit first.

### Verify a ZKP
Verifies a previously generated proof using EZKL directly.

```bash
flair zkp verify
## Decoding proof artifacts...
## Running EZKL verification...
## ✓ Proof verified successfully!
## Verification log saved to: .flair/.zkp/.verified
```

### Check ZKP status
Display information about created proofs and verification status.

```bash
flair zkp status
## ZKP Status for my-model
## Location: .flair/.zkp
##
## Proof Information:
##   Model: model.pt
##   Framework: pytorch
##   Input Dims: [1, 3, 224, 224]
##   Created: 2026-01-22T10:30:45.123456
##
## Verification Status: ✓
##   Verified: 2026-01-22T10:35:12.789012
```

**Note:** ZKP generation requires EZKL and Python 3.9-3.11. Install with:
```bash
pip install ezkl
```

### Finalize commit with message
Finalizes the commit by setting the message, computing architecture metadata, determining commit type (`CHECKPOINT` or `DELTA`), computing parameter deltas when valid, and cleaning up old storage.

**Prerequisites:**
- Must run `flair add` to create a commit
- Must run `flair params create` to extract parameters
- Must run `flair zkp create` to generate zero-knowledge proof

**Commit Types:**
- **CHECKPOINT**: First commit in repository. Stores full parameters.
- **DELTA**: Commit with unchanged architecture. Stores only parameter differences from previous commit.
- **CHECKPOINT (Architecture Change)**: If architecture differs from previous commit, commit is automatically finalized as CHECKPOINT and stores full parameters.

**Architecture metadata stored in each commit:**
- `architectureHash`: Hash of parameter names + order + shapes (+ framework metadata when available)
- `previousArchitectureHash`: Previous commit architecture hash when known
- `architectureChanged`: Boolean flag indicating architecture transition vs previous commit

```bash
flair commit -m "Initial model commit"
## ✓ Computing delta from previous commit...
## Previous commit: Genesis (CHECKPOINT)
## 
## ✓ Commit finalized
##   Commit hash: a1b2c3d4f5g6h7i8...
##   Commit type: CHECKPOINT
##   Message: Initial model commit
##   Parameters: Full params retained (100 MB)
## 
## Next step:
##   Run 'flair push' to upload commit to repository

flair commit -m "Updated with training data v2"
## ✓ Computing delta from previous commit...
## Previous commit: a1b2c3d4f5g6h7i8...
## ✓ PyTorch delta computed (2.34 MB)
## 
## ✓ Commit finalized
##   Commit hash: b2c3d4e5f6g7h8i9...
##   Commit type: DELTA
##   Message: Updated with training data v2
##   Parameters: Delta stored (2.34 MB), full params retained for next delta
##   Storage cleanup: Removed full params from 1 old commit
## 
## Next step:
##   Run 'flair push' to upload commit to repository

flair commit -m "Added new classification head"
## ⚠ Architecture change detected: finalizing as CHECKPOINT.
##   Current architecture hash: 8a7b6c5d4e3f...
##   Previous architecture hash: 1a2b3c4d5e6f...
##
## ✓ Commit finalized
##   Commit hash: c3d4e5f6g7h8i9j0...
##   Commit type: CHECKPOINT
##   Message: Added new classification head
##   Parameters: Full params retained (architecture changed)
##
## Next step:
##   Run 'flair push' to upload commit to repository
```

**How it works:**
1. Computes or reads the current commit's `architectureHash`
2. Reads previous commit architecture metadata (`previousArchitectureHash`)
3. Chooses commit type:
   - `CHECKPOINT` for genesis
   - `DELTA` when architecture hash matches previous commit
   - `CHECKPOINT` when architecture hash differs (automatic fallback)
4. For DELTA commits only:
   - Loads current and previous parameters
   - Verifies architecture hash match before delta computation
   - Computes delta: `delta = current - previous`
   - Stores delta in `.delta_params/` folder
   - Cleans up full parameters from old DELTA commits (keeps latest 2 + all CHECKPOINT)
5. Stores `commitType`, `architectureHash`, `previousArchitectureHash`, and `architectureChanged` in commit.json
6. The push command uses this type to determine which file to upload:
   - CHECKPOINT: uploads full params from `.params/` folder
   - DELTA: uploads delta params from `.delta_params/` folder

**Parameter Reconstruction (Automatic Fallback):**
If a previous commit's full parameters were deleted during cleanup, they are automatically reconstructed:
- Traverses backward through commit history to find the nearest CHECKPOINT for the target commit
- Loads that CHECKPOINT full parameters
- Applies only DELTAs after that checkpoint to reconstruct the target commit
- Returns reconstructed parameters for delta computation
- Reconstruction is transparent and maintains data integrity

Example boundary handling:
- `C1 CHECKPOINT (architecture A)`
- `C2 DELTA (architecture A)`
- `C3 DELTA (architecture A)`
- `C4 CHECKPOINT (architecture B)`
- `C5 DELTA (architecture B)`

Reconstructing `C3` starts from `C1` and applies `C2` + `C3`.
Reconstructing `C5` starts from `C4` and applies `C5`.

**Storage Optimization Summary:**
- Genesis CHECKPOINT commit keeps full params
- Latest 2 commits always keep full params (for reliable delta computation)
- Older DELTA commits store only deltas (95% smaller)
- Total savings: 95%+ for large commit histories
- Safety: Automatic reconstruction ensures no data loss

**Note:** You cannot finalize a commit twice. To create a new commit, run `flair add` first.

## Push Commits

### Push commits to remote repository
Uploads all completed local commits serially to the remote repository. Supports batch pushing of multiple commits in chronological order. Each commit uses either CHECKPOINT or DELTA type based on position in history.

**New Batch Push Capability:**
- Create multiple local commits before pushing
- Push all completed commits at once in chronological order
- Automatic synchronization with remote HEAD
- Skips incomplete commits (stops at first incomplete)
- Each commit goes through full 5-step validation

**Prerequisites (for each commit):**
- Must run `flair add` to create a commit
- Must run `flair params create` to extract model parameters
- Must run `flair zkp create` to generate zero-knowledge proof
- Must run `flair commit -m "message"` to finalize commit, compute delta, and determine type
- Commit must be complete (params, ZKP, delta computation, and finalized message)

**Upload behavior based on commit type:**
- **CHECKPOINT** (genesis): Uploads full parameters from `.params/` folder (~100 MB for typical models)
- **DELTA**: Uploads delta parameters from `.delta_params/` folder (difference from previous commit, ~2-8 MB typical)

**Features:**
- **Serial pushing**: Pushes commits in creation time order (oldest first)
- **Smart filtering**: Only pushes complete commits, skips incomplete ones
- **Remote sync**: Fetches remote HEAD via `/latest` endpoint to avoid duplicates
- **Fail-fast execution**: Stops immediately on the first failed commit in a batch push
- **Auto-branching**: Creates branch if it doesn't exist (e.g., first push creates 'main')
- **ZKML validation**: Validates ZKML proof uniqueness before upload
- **IPFS upload**: Uploads binary proof artifacts and parameters to IPFS
- **HEAD update**: Updates local HEAD with latest pushed commit hash
- **Progress tracking**: Shows X/Y commits pushed with detailed per-commit logs

```bash
# First push - single CHECKPOINT commit (genesis)
flair push -u origin main
## 
## Pushing to branch: main
## Found 1 local commit(s)
## Branch 'main' not found. Creating...
## ✓ Branch 'main' created
## Remote HEAD: Genesis (no commits yet)
## Pushing 1 commit(s) serially...
## 
## ═══ Commit 1/1 ═══
## Hash: a1b2c3d4...
## Type: CHECKPOINT
## Message: Initial model commit
## Parent: Genesis...
## 
## Step 1/5: Initiating commit session...
## ✓ Session initiated
## Step 2/5: Checking ZKML proof uniqueness...
## ✓ ZKML proof verified as unique
## Step 3/5: Uploading ZKML proofs...
## ✓ ZKML proofs uploaded
## Step 4/5: Uploading parameters...
## ✓ Parameters uploaded (hash: 1a2b3c4d...)
## Step 5/5: Finalizing commit...
## ✓ Commit 1 created successfully!
##   Hash: a1b2c3d4...
##   Type: CHECKPOINT
## 
## ═══════════════════════════════════
## ✓ Push complete!
##   Branch: main
##   Commits pushed: 1/1
##   Latest commit: a1b2c3d4...
## ═══════════════════════════════════
## 
## ✓ HEAD updated

# Batch push - multiple DELTA commits at once
flair push main
## Pushing to branch: main
## Found 4 local commit(s)
## Remote HEAD: a1b2c3d4...
## Skipping incomplete commit: z9y8x7w6...  # Being worked on
## Pushing 3 commit(s) serially...
## 
## ═══ Commit 1/3 ═══
## Hash: b2c3d4e5...
## Type: DELTA
## Message: Updated with training data v2
## Parent: a1b2c3d4...
## 
## Step 1/5: Initiating commit session...
## ✓ Session initiated
## Step 2/5: Checking ZKML proof uniqueness...
## ✓ ZKML proof verified as unique
## Step 3/5: Uploading ZKML proofs...
## ✓ ZKML proofs uploaded
## Step 4/5: Uploading parameters...
## ✓ Parameters uploaded (hash: 2b3c4d5e...)
## Step 5/5: Finalizing commit...
## ✓ Commit 1 created successfully!
##   Hash: b2c3d4e5...
##   Type: DELTA
## 
## ═══ Commit 2/3 ═══
## Hash: c3d4e5f6...
## Type: DELTA
## Message: Improved accuracy to 95%
## Parent: b2c3d4e5...
## [... 5 steps ...]
## ✓ Commit 2 created successfully!
##   Hash: c3d4e5f6...
##   Type: DELTA
## 
## ═══ Commit 3/3 ═══
## Hash: d4e5f6g7...
## Type: DELTA
## Message: Fine-tuned hyperparameters
## Parent: c3d4e5f6...
## [... 5 steps ...]
## ✓ Commit 3 created successfully!
##   Hash: d4e5f6g7...
##   Type: DELTA
## 
## ═══════════════════════════════════
## ✓ Push complete!
##   Branch: main
##   Commits pushed: 3/3
##   Latest commit: d4e5f6g7...
## ═══════════════════════════════════
## 
## ✓ HEAD updated

# Push to current branch (from HEAD)
flair push
## ✓ All commits already pushed. Branch is up to date.
```

**Push Workflow:**
1. Fetches all local commits sorted by creation time (oldest first)
2. Gets remote HEAD commit from `/latest` endpoint
3. Filters only complete commits (params + ZKP + finalized message)
4. Stops at first incomplete commit (skip the one being worked on)
5. Compares local commits with remote HEAD to find divergence point
6. For each commit to push (serially):
   - Step 1: Initiates commit session with parent commit hash
   - Step 2: Checks ZKML proof CID uniqueness
   - Step 3: Uploads ZKML binary files (proof.zlib, verification_key.zlib, settings.zlib)
   - Step 4: Uploads parameters binary file with SHA256 hash
   - Step 5: Finalizes commit with message, paramHash, and architecture
   - Updates parent hash for next commit in chain
7. Updates `.flair/HEAD` with latest pushed commit hash and branch info
8. Displays summary: commits pushed (X/Y) and final HEAD

**Error handling:**
- **Stops immediately** when any commit fails during a multi-commit push
- **Records exact progress** by reporting how many commits were successfully pushed before failure
- **No rollback**: already-pushed commits remain final on remote
- **No retry loop in the same push**: user must run `flair push` again to continue
- **No partial deletion**: remaining local commits are left untouched for later push
- Shows clear error messages for failed commits (✗ Commit X: reason)

## Revert Commits

### Revert to the previous commit
Creates a new checkpoint commit with the exact parameters from the parent commit. This allows you to undo the latest commit without deleting history.

**Important constraints (v1):**
- Can only revert the latest commit (HEAD)
- Cannot revert arbitrary commits in history
- Reason: Earlier model updates are dependencies for later ones, so reverting a middle commit could create invalid model state

**What the revert command does:**
1. Validates that HEAD exists and is not the genesis commit
2. Reads the parent commit's full parameters (reconstructs from deltas if needed)
3. Creates a new checkpoint commit with:
   - Exact copy of parent's parameters
   - Metadata field: `reverts: <HEAD commit hash>`
   - Message: "Revert <HEAD hash>" (customizable with `-m`)
4. Updates HEAD to point to the new revert commit
5. Does NOT delete or modify any previous commits

**Result:**
Original commit chain remains intact:
```
Before:  C0 -> C1 -> C2 -> C3 (HEAD)
After:   C0 -> C1 -> C2 -> C3 -> C4 (HEAD)  # C4 reverts C3
```
Where C4 has: `params(C2) = C4.params`, `C4.previousCommitHash = C3`, `C4.reverts = C3`

```bash
# Simple revert - uses default message
flair revert
## Reverting latest commit...
## Current HEAD: a1b2c3d4...
## Parent commit: z9y8x7w6...
## 
## Step 1/4: Loading parent parameters...
## ✓ Parent parameters loaded
## Step 2/4: Creating revert commit...
## ✓ Revert commit directory created
## Step 3/4: Copying ZKP files...
## ✓ ZKP files copied from parent
## Step 4/4: Finalizing revert commit...
## ✓ Commit finalized
## 
## ═══════════════════════════════════
## ✓ Revert successful!
## ═══════════════════════════════════
## 
## Reverted latest commit a1b2c3d4...
## Created compensating checkpoint commit b2c3d4e5...
##
## Summary:
##   Reverted commit: a1b2c3d4...
##   New HEAD: b2c3d4e5...
##   Commit type: CHECKPOINT
##   Message: Revert a1b2c3d4...
##   Metadata: {'reverts': 'a1b2c3d4...'}
##
## Next steps:
##   Run 'flair push' to upload the revert commit to remote

# Revert with custom message
flair revert -m "Undo training error - bad data epoch"
## ✓ Revert successful!
## Created compensating checkpoint commit b2c3d4e5...
## Message: Undo training error - bad data epoch

# Explicit HEAD reference (same behavior as 'flair revert')
flair revert HEAD
## ✓ Revert successful!
## Created compensating checkpoint commit b2c3d4e5...
```

**Revert workflow:**
1. Reads current HEAD commit
2. Validates HEAD is not genesis (has a parent to revert to)
3. Loads or reconstructs parent's full parameters
4. Creates new commit directory with new UUID
5. Saves parent's parameters as new commit's full parameters
6. Copies ZKP files from parent (proof is same since parameters are same)
7. Creates commit.json with type=CHECKPOINT and metadata.reverts field
8. Updates `.flair/HEAD` to point to new revert commit
9. Reports success and next steps

**Error cases:**
- No commits found (need at least genesis + one more)
- HEAD is genesis commit (nothing to revert to)
- Cannot determine parent commit
- Failed to load or reconstruct parent parameters
- ZKP files unavailable from parent (warning only, user can regenerate)

**After reverting:**
- New commit is stored locally and ready to push
- If parent's ZKP files were not available, run `flair zkp create` first
- Run `flair push` to upload the revert commit to remote
- Original commits remain unchanged in history

## Reset Commits

### Reset HEAD to a previous local commit
Discards unpushed local commits and restores working model parameters to an earlier state.
**Important:** Can only reset to unpushed commits - cannot move HEAD before REMOTE_HEAD.

**When to use reset vs. revert:**
- **revert**: Creates a new commit that undoes the latest commit (permanent history)
- **reset**: Deletes unpushed local commits entirely (discards history)

**Reset constraints (v1):**
- Can only reset to recent unpushed commits via HEAD~N syntax
- Cannot reset to arbitrary commits
- Cannot reset past REMOTE_HEAD (pushing boundary)
- Must use `--hard` flag to confirm disk changes

**What the reset command does:**
1. Validates that target is >= REMOTE_HEAD (all commits after remote)
2. Collects unpushed commits to delete (from HEAD back to target, exclusive of target)
3. Loads target commit's full parameters (reconstructs from deltas if needed)
4. Permanently deletes local commit directories and all contents
5. Restores working directory model to target state
6. Updates HEAD only after all deletions and restorations succeed

**Result:**
All unpushed commits after target are gone:
```
Before:  C0 (pushed) -> C1 -> C2 -> C3 -> C4 (HEAD, unpushed)
After:   C0 (pushed) -> C1 -> C2 (HEAD)
```
Where C0 was pushed (REMOTE_HEAD), C3 and C4 are deleted.

```bash
# Simple reset - go back 1 commit (default)
flair reset
## Analyzing reset target...
## Target: HEAD~1 = a1b2c3d4...
## Current HEAD: z9y8x7w6...
## 
## Step 1/4: Collecting commits to delete...
## ✓ Will delete 1 commit(s):
##   • z9y8x7w6...
## 
## Step 2/4: Loading target commit state...
## ✓ Target commit state loaded
##   Parameters: 1024 items
## 
## Step 3/4: Deleting local commits...
##   ✓ Deleted z9y8x7w6...
## ✓ Deleted 1 local commit(s)
## 
## Step 4/4: Restoring working model...
## ✓ Working model restored
## 
## ═══════════════════════════════════
## ✓ Reset successful!
## ═══════════════════════════════════
## 
## Deleted 1 unpushed commit(s)
## HEAD moved to: a1b2c3d4...
## Working model restored to target state

# Reset multiple commits
flair reset --hard HEAD~3
## ✓ Reset successful!
## Deleted 3 unpushed commit(s)
## HEAD moved to: b2c3d4e5...

# Discard all unpushed commits (back to REMOTE_HEAD)
flair reset --to-remote
## ✓ Reset successful!
## Deleted 4 unpushed commit(s)
## HEAD moved to: c3d4e5f6... (REMOTE_HEAD)

# Explicit syntax (same as 'flair reset')
flair reset --hard HEAD~1
## ✓ Reset successful!
```

**Reset workflow:**
1. Reads current HEAD and REMOTE_HEAD tracking
2. Parses target (HEAD~N or --to-remote)
3. Validates target >= REMOTE_HEAD (prevents losing pushed commits)
4. Counts available commits and validates target is reachable
5. Collects all commits between HEAD and target (going backward)
6. Loads target commit state before deletion
7. Deletes each local commit directory and all contents
8. Restores working model parameters to target state
9. Updates `.flair/HEAD` to point to target
10. Reports deleted commits and new HEAD position

**Error cases:**
- No local commits to reset
- Invalid syntax (not HEAD~N or --to-remote)
- Target is behind REMOTE_HEAD (cannot reset pushed commits)
- Not enough commits available (HEAD~5 on 3 commits)
- Failed to load or reconstruct target parameters
- Failed to restore working model (warning only)

**After resetting:**
- Deleted commits are permanently gone (no recovery)
- Working model is restored to target state
- Can create new commits from target
- REMOTE_HEAD remains unchanged
- Deleted commits can be recreated if needed

## Directory structure (CLI)


# Created in each repo after `flair init`
```bash
.flair/
   repo.json                # Remote repo snapshot used by clone/checkout
	HEAD                     # Current branch pointer (name + branchHash)
	branches.json            # Cached branch list for the repo
	.local_commits/          # Local commits directory
		<uuidv4>/              # Each commit has its own directory
         commit.json          # Commit metadata (params, zkp, commitType, architectureHash, status)
			params.pt|npz        # Extracted model weights (framework-dependent)
			.delta_params/       # Delta parameters directory
				delta.pt|npz       # Parameter differences from previous commit
			proof.zlib           # Compressed ZK proof
			verification_key.zlib  # Compressed VK
			settings.zlib        # Compressed settings
   .cache/                  # Per-branch cached artifacts (managed by checkout)
		<branch>/              # Cached params/zkp files for that branch

# Repo settings file in project root
config.yaml               # Repo settings (commitRetentionLimit)

# HEAD file contains the following:
## "currentBranch": branch_data.get("name"),
## "branchHash": branch_data.get("branchHash"),
## "description": branch_data.get("description"),
## "latestCommitHash": latest_commit.get("commitHash")  # Added by clone/push

# HEAD file structure example:
```json
{
   "currentBranch": "main",
   "branchHash": "branch_hash",
   "description": "optional branch description",
   "latestCommitHash": "commit_hash",
   "previousCommit": "commit_hash"
}
```

# commit.json includes architecture-aware fields:
## "commitType": "CHECKPOINT" | "DELTA",
## "architectureHash": "...",
## "previousArchitectureHash": "..." | null,
## "architectureChanged": true | false
```

## Complete Workflow Example

Here's a complete workflow from initialization to pushing a commit:

```bash
# 1. Initialize repository
flair init --description "My ML model repo"

# 2. Create a new local commit
flair add
## ✓ New local commit created
##   Commit hash: a1b2c3d4...

# 3. Extract model parameters
flair params create
## ✓ Parameters saved to commit directory
##   File: params.pt

# 4. Generate zero-knowledge proof
flair zkp create --input-dims "[1, 3, 224, 224]"
## ✓ All EZKL steps completed successfully!
## ✓ ZKP created successfully!

# 5. Finalize and push first commit
flair commit -m "Initial model commit"
flair push -u origin main
## ✓ Branch 'main' created
## ✓ Push complete! Commits pushed: 1/1

# 6. Create multiple commits locally (batch workflow)
# ... modify model (round 1) ...
flair add
flair params create
flair zkp create
flair commit -m "Improved accuracy to 95%"

# ... modify model (round 2) ...
flair add
flair params create
flair zkp create
flair commit -m "Fine-tuned hyperparameters"

# ... modify model (round 3) ...
flair add
flair params create
flair zkp create
flair commit -m "Added data augmentation"

# 7. Push all commits at once (batch push)
flair push main
## Pushing 3 commit(s) serially...
## ✓ Push complete! Commits pushed: 3/3

# 8. Continue working on next commit (not pushed yet)
flair add
flair params create
# ... still working, not finalized yet ...

# 9. Push again - skips incomplete commit
flair push main
## Skipping incomplete commit: abc123...
## ✓ All commits already pushed. Branch is up to date.

# 10. Revert the latest commit if something went wrong
flair revert -m "Undo accidental change"
## ✓ Revert successful!
## Created compensating checkpoint commit def456...

flair push main
## Pushing 1 commit(s) serially...
## ✓ Push complete! Commits pushed: 1/1

# 11. Reset if you decided against the latest local commit
# (different from revert: revert creates a compensating commit, reset deletes commits)
flair reset --hard HEAD~1
## ✓ Reset successful!
## Deleted 1 unpushed commit(s)
## HEAD moved to: c3d4e5f6...
## Working model restored to target state

# 12. Switch branches
flair branch experimental
flair checkout experimental
flair add
flair params create
flair zkp create
flair commit -m "Experimental architecture"
flair push
```

## Validation Rules

The CLI enforces a strict sequential workflow to prevent incomplete commits:

1. **Creating a new commit (`flair add`):**
   - Blocked if the current commit is incomplete (missing params or ZKP)
   - Error: "Cannot create a new commit yet. Complete the current commit first."

2. **Creating params (`flair params create`):**
   - Blocked if params already exist in the current commit
   - Error: "This commit already has parameters. Run 'flair add' to create a new commit."

3. **Creating ZKP (`flair zkp create`):**
   - Blocked if ZKP already exists in the current commit
   - Error: "This commit already has a zero-knowledge proof. Run 'flair add' to create a new commit."

4. **Pushing (`flair push`):**
   - Requires both params and ZKP to be complete
   - Error: "Commit incomplete. Run 'flair params create' and/or 'flair zkp create'."

5. **Architecture-aware delta safety (`flair commit`):**
   - Delta computation runs only when `architectureHash` matches `previousArchitectureHash`
   - On mismatch, the CLI emits a warning and automatically finalizes as `CHECKPOINT`
   - Merge-style delta application across differing architectures is rejected

This ensures every commit is complete and prevents accidental overwrites.
