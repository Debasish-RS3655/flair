# Local Merging Implementation Strategy

This plan outlines the migration from a remote API-driven merge approach (or the standalone `merger_service.py` daemon) to a pure, robust **local merging strategy**. This strategy mimics standard version control flows (`pull` -> `merge` -> `push`) and integrates the `LocalFolder` and `flwr_serverless` architecture to perform robust local FedAvg aggregations.

## Rationale
As discussed, local merging is **cheaper** (avoids massive synchronous HTTP blobs), **easier to manage** (integrates natively into standard CLI workflows like `flair add` and `flair push`), and **safer** (fault-tolerant, operates independently of the remote API until the final push).

## Proposed Changes

### 1. Revert and Clean `flair_cli/cli/merge.py`
We will remove the `execute_merge` command (which attempted to run the 5-step remote commit pipeline directly over the API). We will reinstate and enhance the `create_merge_candidate` command, ensuring the CLI remains a pure local artifact generator.

### 2. Integrate `LocalFolder` and `AsyncFederatedNode`
Currently, `flair merge create` uses a manual `_aggregate_fedavg` loop. We will replace this by utilizing the `flwr_serverless` package and the `LocalFolder` architecture, taking inspiration from the local folder node.

- **Setup**: When grouping sibling commits for a merge, we will create a temporary local directory (e.g., `.flair/.temp_shared_folder`).
- **Initialization**: Instantiate `shared_folder = LocalFolder(directory=temp_dir)` and `node = AsyncFederatedNode(strategy=FedAvg(), shared_folder=shared_folder)`.
- **Population**: Instead of doing the math manually, we will populate the `LocalFolder` with the parameters of the sibling commits. 
- **Aggregation**: We will invoke the node's aggregation mechanism to compute the global model.
- **Extraction**: We will retrieve the newly aggregated parameters from the `LocalFolder` and save them into the `.merge_candidates/<candidate_uuid>` directory along with the `merge_candidate.json`.
- **Teardown**: The temporary `LocalFolder` will be cleaned up.

### 3. Cleanup Legacy Merger
The `merger/merger_service.py` daemon and its associated legacy libraries (`merger/lib`) will be completely deleted, as the logic is now fully integrated into the CLI's standard local workflow.

## User Review Required

> [!IMPORTANT]
> **Aggregation Trigger**: `AsyncFederatedNode` is typically driven by a Keras callback during live training rounds. To force a synchronous aggregation from static files in the CLI, we will either need to manually construct `Aggregatable` objects and pass them to `node._aggregate()` (similar to how the old merger service did it), or simulate a training round trigger. I plan to use the `Aggregatable` injection method for maximum stability.

> [!WARNING]
> **Automatic vs Manual Commit**: Currently, `flair merge create` generates a candidate in `.merge_candidates/`, requiring the user to run `flair add` and `flair commit` manually. This is the safest Git-like approach. Please confirm if you want to keep this manual review step, or if `flair merge` should automatically stage and commit the candidate locally.

## Verification Plan
1. Revert the `flair_cli/cli/merge.py` file to focus strictly on local merging.
2. Implement the `LocalFolder` integration in the merge command.
3. Test creating a merge candidate locally to verify it outputs a valid `.merge_candidates/` artifact.
4. Verify the temporary `LocalFolder` is correctly created and destroyed.
5. Delete the `merger` daemon directories.
