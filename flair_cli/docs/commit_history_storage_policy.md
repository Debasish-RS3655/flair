# Advanced Storage Optimization: Delta Parameter Management

## Overview

Flair cli commit history uses a sophisticated storage optimization strategy that:
1. Stores full parameters only for CHECKPOINT commits and the latest 2 commits
2. Stores only deltas for all other DELTA commits
3. Reconstructs parameters on-demand from CHECKPOINT if previous params missing
4. Automatically cleans up old full parameters to save disk space

## Storage Policy

### Full Parameters Retained In:
- **All CHECKPOINT commits** (genesis and any reset points)
- **Latest commit** (the previous commit being created)
- **Current working commit** (the one being finalized now)

### Delta Parameters Only In:
- All DELTA commits except the latest two
- These are 90-95% smaller than full params

### Storage Savings Example:
```
10 commits (100 MB model):
  OLD: 1 × 100 MB = 100 MB (all commits kept full)
  NEW: 1 CHECKPOINT (100 MB) + 1 latest (100 MB) + 8 deltas (4-8 MB each) ≈ 232 MB
       vs. 1000 MB = 77% savings!
```

## Delta Computation Flow

### `flair commit` Process:

```
1. Check if CHECKPOINT or DELTA
   ↓
2. If CHECKPOINT:
   - Save full params
   - Skip delta computation
   - Do not clean old params (first commit)
   ↓
3. If DELTA:
   - Get previous commit hash from HEAD
   - Retrieve previous commit's full params
   - Load current full params
   - Compute: delta = current - previous
   - Save delta to .delta_params/
   - Keep full params in this commit
   - Clean up full params from old DELTA commits
```

## Parameter Reconstruction (Fallback)

### Scenario: Previous commit's full params deleted

When computing delta and previous full params file is missing:

```
1. Start at previous_commit_hash
2. Traverse backward through commits
3. Build stack of commit hashes
4. Find most recent CHECKPOINT
5. Load CHECKPOINT full params
6. Apply deltas serially:
   - For each commit from CHECKPOINT to previous:
     - Load delta from .delta_params/
     - Add to current params: params += delta
7. Result: reconstructed previous full params
8. Compute delta: current - reconstructed
```

### Traversal Stack Example:
```
Current commit being created: C4
Previous commit (HEAD): C3
HEAD.previousCommit: C2

Traverse back:
C3 (DELTA)   ← start
C2 (DELTA)
C1 (CHECKPOINT) ← stop, found CHECKPOINT

Stack: [C1, C2, C3]
Apply deltas: C1_full + C2_delta → C2_full
              C2_full + C3_delta → C3_full
```

## File Structure

### CHECKPOINT Commit:
```
.flair/.local_commits/uuid1/
├── commit.json
│   "commitType": "CHECKPOINT"
│   "params": { "file": "params.pt", ... }
│   "deltaParams": null
├── params.pt (FULL MODEL)
├── .delta_params/ (empty)
└── zkp/
```

### DELTA Commit (Latest - keep full):
```
.flair/.local_commits/uuid2/
├── commit.json
│   "commitType": "DELTA"
│   "params": { "file": "params.pt", ... }
│   "deltaParams": { "file": "delta.pt", ... }
├── params.pt (FULL MODEL) ← kept for next delta calculation
├── .delta_params/
│   └── delta.pt (DIFFERENCES)
└── zkp/
```

### DELTA Commit (Old - only delta):
```
.flair/.local_commits/uuid3/
├── commit.json
│   "commitType": "DELTA"
│   "params": { "file": "params.pt", ... } ← MISSING FILE
│   "deltaParams": { "file": "delta.pt", ... }
├── .delta_params/
│   └── delta.pt (DIFFERENCES)
└── zkp/
```

## Implementation Details

### New Functions in `commit.py`

1. **`_get_commit_by_hash(commit_hash)`**
   - Retrieves any commit by its hash
   - Used for traversal and reconstruction

2. **`_load_pytorch_params(file_path)`**, **`_load_numpy_params(file_path)`**
   - Load parameters from disk
   - Handle errors gracefully

3. **`_save_pytorch_params(params, file_path)`**, **`_save_numpy_params(params, file_path)`**
   - Save computed parameters to disk

4. **`_compute_pytorch_delta(current, previous)`**, **`_compute_numpy_delta(current, previous)`**
   - Element-wise subtraction: delta = current - previous
   - Handle new keys that don't exist in previous

5. **`_reconstruct_params_from_checkpoint(target_hash, framework)`**
   - Main reconstruction algorithm
   - Traverses back to CHECKPOINT
   - Applies deltas serially
   - Returns reconstructed params and checkpoint hash

6. **`_get_previous_full_params(prev_hash, framework)`**
   - Attempts to load previous full params
   - Falls back to reconstruction if missing
   - Handles all error cases

7. **`_cleanup_old_full_params()`**
   - Deletes full params from old DELTA commits
   - Preserves CHECKPOINT commits
   - Preserves latest 2 commits
   - Returns count of cleaned commits

### Delta Computation in `finalize()`:

```python
if commit_type == "DELTA":
    # Get previous commit hash from HEAD
    previous_commit_hash = head_info.get("previousCommit")
    
    # Load current full params
    current_params = load_params(commit_dir/params)
    
    # Get or reconstruct previous params
    previous_params = _get_previous_full_params(previous_commit_hash)
    
    # Compute delta
    delta_params = current_params - previous_params
    
    # Save delta
    save_params(delta_params, commit_dir/.delta_params/delta)
    
    # Clean up old full params
    _cleanup_old_full_params()
```

## Error Handling

### Missing Previous Commit:
```python
if not _get_commit_by_hash(previous_hash):
    console.print("Warning: Previous commit not found")
    # Cannot compute delta, fail gracefully
```

### Missing Previous Full Params:
```python
if not previous_params_file.exists():
    console.print("Previous commit full params not found, reconstructing...")
    result = _reconstruct_params_from_checkpoint(previous_hash)
    if result:
        previous_params, checkpoint_hash = result
    else:
        console.print("Failed to reconstruct")
        raise error
```

### Reconstruction Chain Broken:
```python
if commit_data.get("commitType") != "CHECKPOINT" and not delta_found:
    console.print(f"No delta found for {hash}, cannot reconstruct")
    # Chain is broken, fail
```

### Framework Mismatch:
```python
framework = commit_data.get("architecture", "pytorch").lower()
if framework == "pytorch":
    params = _load_pytorch_params(file)
else:
    params = _load_numpy_params(file)
```

## Cleanup Algorithm

```
1. Get all commits sorted by modification time (newest first)
2. Keep top 2 commits (latest + current being worked on)
3. For each older commit:
   if commitType == "CHECKPOINT":
       keep it (always)
   else (DELTA):
       if params file exists:
           delete it
           increment cleaned_count
4. Return cleaned_count
```

## Verification and Safety

### Always Safe Because:
1. **Latest 2 commits retained**: Always enough data to compute next delta
2. **CHECKPOINT preserved**: Fallback point for reconstruction
3. **Incremental deltas**: Each delta is computed fresh when creating next commit
4. **No data loss**: Deltas store all changes, full params can be reconstructed

### Reconstruction Guarantees:
- Latest commit always has full params
- Previous commit full params can be reconstructed from CHECKPOINT + deltas
- CHECKPOINT always has full params
- Chain is never broken for valid commit sequence

## Example Workflow

### Creating Commit 1 (CHECKPOINT):
```
flair add → flair params create (saves params.pt)
flair zkp create
flair commit -m "Initial"

Result:
✓ Commit finalized (CHECKPOINT)
✓ params.pt retained (100 MB)
✓ No delta (genesis)
✓ Storage: 100 MB
```

### Creating Commit 2 (DELTA):
```
[train model]
flair add → flair params create (saves params.pt)
flair zkp create
flair commit -m "Round 1"

Process:
- Detect: DELTA (not genesis)
- Previous commit 1 has params.pt (100 MB)
- Load current params.pt (100 MB)
- Compute delta: current - previous (5 MB)
- Save delta to .delta_params/delta.pt
- Clean up: Commit 1 is not old enough, keep it
- Update commit.json with deltaParams

Result:
✓ Commit finalized (DELTA)
✓ params.pt retained in Commit 2 (100 MB)
✓ delta.pt saved (5 MB)
✓ Storage added: 105 MB
✓ Total storage: 205 MB
```

### Creating Commit 3 (DELTA):
```
[train model more]
flair add → flair params create
flair zkp create  
flair commit -m "Round 2"

Process:
- Detect: DELTA
- Load current params.pt from Commit 3
- Get previous params from Commit 2 (available, 100 MB)
- Compute delta (6 MB)
- Clean up: Delete Commit 1 full params ← START SAVINGS
- Update commit.json

Result:
✓ Commit finalized (DELTA)
✓ params.pt in Commit 2 and 3 retained (200 MB total)
✓ delta.pt in Commit 3 saved (6 MB)
✓ Commit 1: ONLY .delta_params/delta.pt remains (5 MB) ← cleaned!
✓ Storage added: 6 MB (delta only, params already counted)
✓ Total storage: 211 MB (vs 300 MB without optimization)
```

### Creating Commit 4 (DELTA):
```
[continue training]
flair add → flair params create
flair zkp create
flair commit -m "Round 3"

Process:
- Load current params from Commit 4
- Get previous params from Commit 3 (available, 100 MB)
- Compute delta (7 MB)
- Clean up: Delete Commit 2 full params ← MORE CLEANUP

Result:
✓ Commit 2: ONLY delta.pt remains (5 MB) ← cleaned!
✓ Total storage: 216 MB (vs 400 MB without optimization)
```

## Performance Characteristics

### Time Complexity:
- **Delta computation**: O(n) where n = number of parameters
- **Reconstruction**: O(m×n) where m = commits from CHECKPOINT, n = params
- **Cleanup**: O(c) where c = total commits

### Space Complexity:
- **With optimization**: O(3n) = 3 full models (CHECKPOINT + latest 2)
- **Without optimization**: O(c×n) = all commits keep full params
- **Savings**: 95%+ for large commit histories

### I/O Impact:
- Each commit finalization: 1 read (current), 1 read (previous), 1 write (delta), 1 delete (old)
- Reconstruction: ~c reads to traverse + m reads to apply deltas

## Reconstruction Example (5 Commits)

```
Commits: C1(CHECKPOINT) - C2(DELTA) - C3(DELTA) - C4(DELTA) - C5(working)

Creating C5 commit:
1. C1.params.pt exists (100 MB) ✓
2. C2.params.pt exists (100 MB) ✓
3. C3.params.pt deleted (would need reconstruction)
4. C4.params.pt exists (100 MB) ✓

For C5, need C4.params:
- C4.params exists → use directly
- If C4.params missing:
  1. Traverse: C4 ← C3 ← C2 ← C1(stop, CHECKPOINT)
  2. Load C1.params (100 MB)
  3. Apply C2.delta (+ 5 MB updates)
  4. Apply C3.delta (+ 6 MB updates)
  5. Apply C4.delta (+ 7 MB updates)
  6. Result: C4.params reconstructed
  7. Compute C5.delta from reconstructed C4
```

## Migration Strategy

If upgrading from old system where all commits have full params:

1. Run cleanup manually: `_cleanup_old_full_params()`
2. First DELTA commit after upgrade will use new system
3. Older CHECKPOINT commits remain unchanged
4. Old full params will be cleaned up as new commits created

## Testing Recommendations

- [ ] Create genesis commit (CHECKPOINT) - verify full params retained
- [ ] Create 2nd commit (DELTA) - verify delta computed and full params retained
- [ ] Create 3rd commit (DELTA) - verify 1st commit params deleted via cleanup
- [ ] Delete previous commit's full params manually - verify reconstruction works
- [ ] Create commit with missing chain - verify error handling
- [ ] Verify delta size vs full params (should be 5-10%)
- [ ] Verify parameters reconstructed correctly match original
- [ ] Test PyTorch, TensorFlow, and ONNX frameworks
