# Flair Merger Service

The merger is an independent service that applies Flower-style asynchronous aggregation to commit-based model updates.

Instead of a central model checkpoint store, Flair treats each local training result as a commit. The merger watches commits, groups sibling commits that share the same parent, aggregates their weights, and writes a new merge commit that becomes the next parent for downstream training.

## Brief Workflow (Flower Async Style)

1. A client pulls a parent commit's model weights.
2. The client trains locally and pushes a new commit that points to that same parent.
3. Other clients do the same independently, so multiple child commits can exist for one parent.
4. The merger service polls the branch and groups commits by `previousCommitHash`.
5. When a group reaches the merge threshold, the merger:
	- downloads each child commit's parameters,
	- converts them into Flower-compatible parameters,
	- runs weighted FedAvg aggregation.
6. The merger uploads the aggregated parameters through the existing commit pipeline.
7. The merger finalizes a new merge commit with:
	- the shared parent context,
	- aggregated parameter hash,
	- model architecture metadata.
8. That merge commit becomes the effective base for the next wave of async local training.

This preserves the async collaboration pattern from Flower while adding reproducible history, branching semantics, and auditable model lineage through commits.

## Federated Learning Process Workflow

Flair keeps the same learning rhythm as asynchronous federated learning, but records each model update as a commit:

1. A participant pulls model weights from the current parent commit.
2. The participant trains on local data and computes updated parameters.
3. The participant pushes a new child commit referencing that parent.
4. Multiple participants can produce multiple children from the same parent (parallel local training windows).
5. The merger service detects that sibling set and performs aggregation.
6. A merged commit is created and becomes the next collaboration anchor.
7. Future participants pull from the new merged commit and repeat the cycle.

In effect, each merge commit acts like the next global model in federated learning rounds, while preserving full commit history.

## Shared Folder Architecture in Backend

The backend shared-folder routes provide ephemeral coordination storage per branch and committer wallet.

- Model file path:
	- `PUT /commit/sharedFolder/files/:committerAddress`
- Keras metrics path:
	- `PUT /commit/sharedFolder/files/keras/:committerAddress/:key`
- Retrieval/listing paths:
	- `GET /commit/sharedFolder/pull`
	- `GET /commit/sharedFolder/files/list`
	- `GET /commit/sharedFolder/files/list/keras/:committerAddress`

How this is used in training and merging:

1. Clients can write model snapshots and metrics artifacts to their wallet-scoped shared folder.
2. The merger writes aggregated model bytes and post-aggregation metrics for the merger wallet.
3. Commit creation remains authoritative for permanent lineage; shared-folder data is coordination state, not the source of truth.

This design keeps fast exchange and metrics tracking separate from immutable commit history.

## Federated Averaging of Weights

The merger performs weighted FedAvg over sibling child commits.

Given client models $w_i$ and local example counts $n_i$, with total samples $N = \sum_i n_i$, merged weights are:

$$
w_{merged} = \sum_i \frac{n_i}{N} w_i
$$

Practical details in Flair merger:

1. Each child commit contributes its parameter tensors and `num_examples` (fallback to `samples` or `1`).
2. Parameters are converted to Flower parameter format and aggregated with FedAvg.
3. Output tensors are serialized, hashed, and committed as a new merge commit.
4. Architecture consistency is enforced within each sibling group; mismatched groups are skipped.

This keeps the weighting behavior aligned with standard federated learning while using commit topology for merge grouping.

## Operational Notes

- Grouping key: `previousCommitHash`.
- Minimum group size is configurable (`MIN_CHILD_COMMITS`).
- Polling interval is configurable (`POLL_INTERVAL_SEC`).
- Commit creation uses the existing backend sequence:
  `initiate -> zkml-check -> zkml-upload -> params-upload -> finalize`.
