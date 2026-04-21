# Repository Manager Backend for Flair

Backend service for managing machine learning repositories on Solana blockchain.

## Backend Overview

The backend is an Express + TypeScript API built around three core ideas:

1. Authentication is wallet-first, but Google OAuth2 is now supported for session creation.
2. Repository, branch, commit, and shared-folder data are stored behind Prisma-backed controllers and then pushed to IPFS, NFT metadata, or on-chain flows when needed.
3. Privileged operations such as Merkle tree creation and backend-wallet signing are isolated behind extra auth checks and localhost restrictions.

### Current Route Map

The active Express mount points in the code are:

- `GET /` and `GET /health` for service status
- `/auth` for Solana SIWS, Google sign-in, and wallet linking
- `/repo` for repository, branch, commit, and base-model operations
- `/user` for profile and account management
- `/tree` for Merkle-tree operations
- `/systemWallet` for admin wallet signing

The routes below are organized by feature. If you are reading older examples that mention `/repository`, the codebase currently mounts that router under `/repo`. Google sessions use `Authorization: Bearer <sessionToken>`, while wallet-authenticated requests still use the Solana signature-based headers handled by the auth middleware.

## Installation

Run the following command to install dependencies:

```bash
npm install
```

## Development

Start the development server with:

```bash
npm run dev
```

## Base URLs

- **Local**: `http://localhost:4000`
- **Production**: `https://flairhub.onrender.com`

---

# API Documentation

## Table of Contents

1. [Authentication](#authentication)
2. [Repository Management](#repository-management)
3. [Branch Management](#branch-management)
4. [Commit Management](#commit-management)
5. [User Management](#user-management)
6. [Merkle Trees (Admin)](#merkle-trees-admin)
7. [System Wallet (Admin)](#system-wallet-admin)
8. [ZKML Integration](#zkml-integration)

---

## Authentication

Authorization using Phantom wallet and Sign-In with Solana (SIWS).

Authentication is layered:

- Solana wallets use SIWS or the universal signed-message format.
- Google sign-in exchanges a Google `idToken` for an internal session JWT.
- Some routes accept a linked wallet principal through the authenticated Google session.

### Authentication Flow

1. The client requests a sign-in payload from the backend.
2. The user signs the payload with their wallet, or provides a Google `idToken`.
3. The backend verifies the signature or token, creates or resolves the user identity, and issues the appropriate session state.
4. Protected routes then use `Authorization` headers to resolve the active principal.

### Get Sign-In Message

**Endpoint**: `GET /auth/signin/:walletAddress`

**Description**: Retrieves a sign-in message for the user to sign with their wallet.

**Parameters**:
- `walletAddress` (path): Solana wallet address

**Example Request**:
```bash
GET /auth/signin/your-wallet-address
```

**Success Response** (200 OK):
```json
{
    "uri": "http://localhost:4000",
    "domain": "localhost:4000",
    "address": "your-wallet-address",
    "statement": "Clicking Sign or Approve only means you have proved this wallet is owned by you. This request will not trigger any blockchain transaction or cost any gas fee.",
    "version": "1",
    "nonce": "3ab5dce5-232d-4ce9-a121-3ce9df9b2e37",
    "chainId": "mainnet",
    "issuedAt": "2025-04-01T18:17:39.274Z",
    "expirationTime": "2025-04-01T18:27:39.328Z",
    "resources": [
        "https://phantom.com/learn/developers/sign-in-with-solana",
        "https://phantom.app/"
    ]
}
```

### Verify Signed Token

**Endpoint**: `POST /auth/signin`

**Description**: Verifies the signed token from the user's wallet and authenticates the session.

**Request Body**:
```json
{
    "token": "your-wallet-address.signed-message-token.signature"
}
```

**Success Response** (200 OK):
```json
{
    "success": true
}
```

**Error Response** (400 Bad Request):
```json
{
    "success": false,
    "error": "Expired token."
}
```

**Authentication Header**:
After successful authentication, include the wallet address in subsequent requests:
```
Authorization: <wallet-address>
```

**Request Shape Notes**:
- `{ "token": "wallet-public-key.signed-message.signature" }` is the universal first-time wallet flow.
- `{ "input": ..., "output": ... }` is the SIWS payload flow used by Phantom and other wallet providers.

### Google Sign-In

**Endpoint**: `POST /auth/signin/google`

**Description**: Verifies a Google ID token, creates or resolves the Google-backed principal, and returns an internal session JWT.

**Request Body**:
```json
{
    "idToken": "google-id-token"
}
```

**Success Response** (200 OK):
```json
{
    "success": true,
    "data": {
        "sessionToken": "jwt-session-token",
        "principal": "google:google-subject-id",
        "userId": "682186025f72b9e61673a468"
    }
}
```

**How it is used**:
- Send the returned token as `Authorization: Bearer <sessionToken>` on protected routes.
- The token is verified by the backend using `SESSION_JWT_SECRET`.

### Link a Wallet to a Google Session

**Endpoint**: `POST /auth/link/wallet`

**Description**: Attaches a Solana wallet principal to the currently authenticated user account.

**Headers**:
```
Authorization: Bearer <sessionToken>
```

**Request Body**:
```json
{
    "token": "wallet-public-key.signed-message.signature"
}
```

**Success Response** (200 OK):
```json
{
    "success": true,
    "data": {
        "principal": "your-wallet-address"
    }
}
```

**Notes**:
- This route is meant for account linking, not initial Google sign-in.
- It lets a Google-authenticated user attach a Solana wallet for later repo or NFT actions.

---

## Repository Management

CRUD operations for Flair repositories.

These routes live under `/repo` in the backend. Most of them are guarded by the auth middleware so the backend can resolve the current principal before touching repository state.

### Create Repository

**Endpoint**: `POST /repo/create`

**Description**: Creates a new Flair repository.

**Headers**:
```
Authorization: <wallet-address>
```

**Request Body**:
```json
{
    "name": "Flair_Repository",
    "metadata": {
        "name": "Flair Repository",
        "description": "A repository for machine learning experiments",
        "useCase": "Training image classifiers",
        "framework": "Tensorflow"
    }
}
```

**Success Response** (201 Created):
```json
{
    "success": true,
    "data": {
        "id": "6821ca531a90a6f79d6307af",
        "name": "Flair_Repository",
        "repoHash": "5345c1b8-49ff-4ece-8bdd-c44a8d7701ce",
        "ownerAddress": "your-wallet-address",
        "metadata": {
            "name": "Flair Repository",
            "description": "A repository for machine learning experiments",
            "useCase": "Training image classifiers",
            "creator": "your-wallet-address",
            "framework": "Tensorflow"
        },
        "createdAt": "2025-05-12T10:15:47.591Z"
    }
}
```

### View All Repositories

**Endpoint**: `GET /repo`

**Description**: Fetches all repositories.

**Success Response** (200 OK):
```json
{
    "data": [
        {
            "id": "6821ca531a90a6f79d6307af",
            "name": "Flair_Repository",
            "repoHash": "5345c1b8-49ff-4ece-8bdd-c44a8d7701ce",
            "metadata": {
                "name": "Flair Repository",
                "description": "A repository for machine learning experiments",
                "useCase": "Training image classifiers",
                "framework": "Tensorflow"
            }
        }
    ]
}
```

### View Repository by Hash

**Endpoint**: `GET /repo/hash/:repoHash`

**Description**: Fetches a specific repository by its hash.

**Parameters**:
- `repoHash` (path): Repository hash identifier

### View Repository by Name

**Endpoint**: `GET /repo/name/:name`

**Description**: Fetches a specific repository by its name.

**Parameters**:
- `repoName` (path): Repository name

### Update Repository

**Endpoint**: `PATCH /repo/hash/:repoHash/update`

**Description**: Updates repository metadata.

**Headers**:
```
Authorization: <wallet-address>
```

**Request Body**:
```json
{
    "metadata": {
        "description": "Updated description",
        "useCase": "Updated use case"
    }
}
```

### Delete Repository

**Endpoint**: `DELETE /repo/hash/:repoHash/delete`

**Description**: Deletes a repository.

**Headers**:
```
Authorization: <wallet-address>
```

**Parameters**:
- `repoHash` (path): Repository hash identifier

### Upload Base Model

**Endpoint**: `POST /repo/hash/:repoHash/basemodel/upload`

**Description**: Uploads a base model file to the repository.

**Headers**:
```
Authorization: <wallet-address>
Content-Type: multipart/form-data
```

**Form Data**:
- `file`: Model file (.pkl, .h5, .onnx, etc.)

### Delete Base Model

**Endpoint**: `DELETE /repo/hash/:repoHash/basemodel/delete`

**Description**: Deletes the base model from a repository.

**Headers**:
```
Authorization: <wallet-address>
```

### Get Base Model URL

**Endpoint**: `GET /repo/hash/:repoHash/basemodel/fetch_url`

**Description**: Gets the IPFS URL for downloading the base model.

**Success Response** (200 OK):
```json
{
    "data": {
        "url": "https://ipfs.io/ipfs/bafkreifbxdgbzbpfh7np7hgkoymddsut7b4ktbazaedeass4ib3zosbunu",
        "hash": "bafkreifbxdgbzbpfh7np7hgkoymddsut7b4ktbazaedeass4ib3zosbunu"
    }
}
```

### Convert Repository to NFT Collection

**Endpoint**: `POST /repo/hash/:repoHash/create_collection`

**Description**: Converts the repository into an NFT collection so that commit NFTs can be minted.

**Headers**:
```
Authorization: <wallet-address>
```

---

## Branch Management

Branch operations within repositories.

### Create Branch

**Endpoint**: `POST /branch/create`

**Description**: Creates a new branch in a repository.

**Headers**:
```
Authorization: <wallet-address>
```

**Request Body**:
```json
{
    "repoHash": "5345c1b8-49ff-4ece-8bdd-c44a8d7701ce",
    "name": "feature-branch",
    "description": "Feature development branch"
}
```

**Success Response** (201 Created):
```json
{
    "success": true,
    "data": {
        "id": "682204a44e53b277ad86bcdc",
        "name": "feature-branch",
        "description": "Feature development branch",
        "repoId": "6821ca531a90a6f79d6307af",
        "createdAt": "2025-05-12T10:20:36.000Z"
    }
}
```

### View All Branches in Repository

**Endpoint**: `GET /branch/all/:repoHash`

**Description**: Fetches all branches in a repository.

**Parameters**:
- `repoHash` (path): Repository hash identifier

**Success Response** (200 OK):
```json
{
    "data": [
        {
            "id": "682204a44e53b277ad86bcdc",
            "name": "main",
            "description": "Main branch",
            "repoId": "6821ca531a90a6f79d6307af"
        }
    ]
}
```

### View Branch by Name

**Endpoint**: `GET /branch/:repoHash/:branchName`

**Description**: Fetches a specific branch by name.

**Parameters**:
- `repoHash` (path): Repository hash identifier
- `branchName` (path): Branch name

### Update Branch Description

**Endpoint**: `PUT /branch/update/:repoHash/:branchName`

**Description**: Updates a branch's description.

**Headers**:
```
Authorization: <wallet-address>
```

**Request Body**:
```json
{
    "description": "Updated branch description"
}
```

### Delete Branch

**Endpoint**: `DELETE /branch/delete/:repoHash/:branchName`

**Description**: Deletes a branch from a repository.

**Headers**:
```
Authorization: <wallet-address>
```

### Pull Shared Folder

**Endpoint**: `GET /branch/shared/:repoHash/:branchName`

**Description**: Downloads the shared folder containing the latest aggregated ML model and metrics for a branch.

**Parameters**:
- `repoHash` (path): Repository hash identifier
- `branchName` (path): Branch name

### Fetch Current Metrics

**Endpoint**: `GET /branch/metrics/:repoHash/:branchName`

**Description**: Fetches the current metrics for a branch's shared folder.

**Success Response** (200 OK):
```json
{
    "data": {
        "accuracy": 0.95,
        "loss": 0.23,
        "updatedAt": "2025-05-13T07:26:22.525Z"
    }
}
```

### Shared Folder Workflow

Flair uses a shared folder record as the working area for a committer on a branch. The data is scoped by `branchId` and `committerAddress`, so each user/branch pair gets its own shared folder entry.

**What it stores:**
- The uploaded model blob for the user
- `metrics_before_aggregation` snapshots
- `metrics_after_aggregation` snapshots
- The current folder contents exposed through the pull/list/file routes

**How it works:**
1. Training or preprocessing code writes files into the shared folder through the `PUT /commit/sharedFolder/...` routes.
2. The shared-folder controller stores those binary blobs in `sharedFolderFile` records.
3. The API can list, fetch, or delete individual shared-folder files for the current branch/user pair.
4. During commit finalization, the backend reads the latest shared folder entry and extracts `metrics_after_aggregation` from it.
5. Those metrics are then attached to the finalized commit as commit metadata.

**Important behavior:**
- Commit finalization depends on the shared folder being present for the current branch and committer.
- If the shared folder or metrics are missing, commit creation fails.
- The metrics helper simply decodes the binary arrays stored in the shared-folder record.

**Shared folder routes:**
- `GET /commit/sharedFolder/pull` - fetch the full shared folder payload
- `GET /commit/sharedFolder/metrics` - fetch only metrics arrays
- `PUT /commit/sharedFolder/files/:committerAddress` - upload the model blob
- `PUT /commit/sharedFolder/files/keras/:committerAddress/:key` - upload metric blobs
- `GET /commit/sharedFolder/files/list` - list stored model files
- `GET /commit/sharedFolder/files/list/keras/:committerAddress` - list metric file keys
- `GET /commit/sharedFolder/files/:committerAddress(*)` - fetch the model blob
- `GET /commit/sharedFolder/files/keras/:committerAddress/:key(*)` - fetch a metric blob
- `DELETE /commit/sharedFolder/files/:committerAddress(*)` - delete the model blob
- `DELETE /commit/sharedFolder/files/keras/:committerAddress/:key(*)` - delete a metric blob

---

## Commit Management

CRUD operations for commits.

### View All Commits

**Endpoint**: `GET /commit/all/:repoHash/:branchName`

**Description**: Fetches all commits in a specific branch.

**Parameters**:
- `repoHash` (path): Repository hash identifier
- `branchName` (path): Branch name

**Success Response** (200 OK):
```json
{
    "data": [
        {
            "id": "6822f41e66a192c360ea7fc1",
            "commitHash": "dad5cd6e-be7a-4764-9370-a5e582bf30cb",
            "message": "Initial commit with baseline model.",
            "status": "MERGED",
            "metrics": {
                "accuracy": 1.0,
                "loss": 0.2326595783233643
            },
            "committerAddress": "your-wallet-address",
            "createdAt": "2025-05-13T07:26:22.525Z",
            "verified": true
        }
    ]
}
```

### Pull Commit

**Endpoint**: `GET /commit/pull/:commitHash`

**Description**: Fetches all data associated with a specific commit (model, metrics, parameters).

**Parameters**:
- `commitHash` (path): Commit hash identifier

### Get Commit Details

**Endpoint**: `GET /commit/:commitHash`

**Description**: Gets basic details of a specific commit.

**Parameters**:
- `commitHash` (path): Commit hash identifier

### Create Commit

**Endpoint**: `POST /commit/create`

**Description**: Creates a new commit in a branch. The first commit is always a merger commit.

**Headers**:
```
Authorization: <wallet-address>
Content-Type: multipart/form-data
```

**Form Data**:
- `repoHash`: Repository hash
- `branchName`: Branch name
- `message`: Commit message
- `metrics`: JSON string with accuracy, loss, etc.
- `architecture`: Model architecture description
- `file`: Model file

**Success Response** (201 Created):
```json
{
    "success": true,
    "data": {
        "commitHash": "dad5cd6e-be7a-4764-9370-a5e582bf30cb",
        "status": "PENDING",
        "message": "Initial commit with baseline model.",
        "createdAt": "2025-05-13T07:26:22.525Z"
    }
}
```

### Convert Commit to NFT

**Endpoint**: `POST /commit/nft/:commitHash`

**Description**: Converts a commit into an NFT minted in the repository's collection.

**Headers**:
```
Authorization: <wallet-address>
```

**Parameters**:
- `commitHash` (path): Commit hash identifier

**Success Response** (200 OK):
```json
{
    "success": true,
    "data": {
        "nftId": "682307cce6f5f94ff1bf8ec2",
        "mintAddress": "5xJ...",
        "transactionSignature": "3x..."
    }
}
```

---

## User Management

CRUD operations for user profiles.

### Get Own Profile

**Endpoint**: `GET /user/profile`

**Description**: Fetches the authenticated user's profile with all repositories and commits.

**Headers**:
```
Authorization: <wallet-address>
```

**Success Response** (200 OK):
```json
{
    "data": {
        "id": "682186025f72b9e61673a468",
        "username": "RS3655",
        "wallet": "your-wallet-address",
        "metadata": {
            "name": "Your Name",
            "email": "your-email@example.com",
            "displayText": "Your display text",
            "profileImage": "base64encodedimage",
            "bio": "Your bio text"
        },
        "nftCredit": 100,
        "lastCreditUpdated": "2025-05-12T05:24:18.515Z",
        "createdAt": "2025-05-12T05:24:18.515Z",
        "repositories": [...],
        "commits": [...]
    }
}
```

### Update User Profile

**Endpoint**: `PUT /user/update`

**Description**: Updates the user's profile information.

**Headers**:
```
Authorization: <wallet-address>
```

**Request Body**:
```json
{
    "username": "your-username",
    "metadata": {
        "name": "Your Name",
        "email": "your-email@example.com",
        "profileImage": "base64encodedimage",
        "bio": "Updated bio text",
        "displayText": "Updated display text"
    }
}
```

**Success Response** (200 OK):
```json
{
    "data": {
        "id": "682186025f72b9e61673a468",
        "username": "RS3655",
        "metadata": {...},
        "updatedAt": "2025-05-13T09:53:50.301Z"
    }
}
```

### Get Other User's Profile

**Endpoint**: `GET /user/user/:walletAddress`

**Description**: Fetches another user's public profile.

**Headers**:
```
Authorization: <wallet-address>
```

**Parameters**:
- `walletAddress` (path): Target user's wallet address

---

## Merkle Trees (Admin)

**⚠️ Admin Only**: These routes are for administrative purposes and should not be integrated in frontend or CLI.

### Create Merkle Tree

**Endpoint**: `POST /merkle/create`

**Description**: Creates a new Merkle tree for NFT compression.

**Headers**:
```
Authorization: <system-wallet-auth>
```

### Get Current Tree

**Endpoint**: `GET /merkle/current`

**Description**: Fetches information about the current active Merkle tree.

**Headers**:
```
Authorization: <system-wallet-auth>
```

---

## System Wallet (Admin)

**⚠️ Admin Only**: Sensitive route for system wallet authentication. Use with extreme caution.

### Sign In to System Wallet

**Endpoint**: `POST /systemWallet/signin/secret`

**Description**: Authenticates the system wallet that pays for blockchain transactions.

**⚠️ Security**: This route is only accessible from the same device and requires the private key.

**Request Body**:
```json
{
    "privateKey": "your-wallet-private-key"
}
```

**Success Response** (200 OK):
```json
{
    "data": "your-wallet-address"
}
```

---

## ZKML Integration

Zero-Knowledge Machine Learning proof creation and verification.

### Create Proof (PyTorch)

**Endpoint**: `POST /zkml/proof/create`

**Description**: Creates a zero-knowledge proof for a PyTorch model converted to ONNX format.

**Headers**:
```
Content-Type: multipart/form-data
```

**Form Data**:
- `model`: ONNX model file
- `backend`: "pytorch"
- `inputDimensions`: JSON string with input dimensions

**Success Response** (200 OK):
```json
{
    "success": true,
    "data": {
        "proof": "0x...",
        "publicInputs": [...],
        "verificationKey": "0x..."
    }
}
```

### Create Proof (Keras/TensorFlow)

**Endpoint**: `POST /zkml/proof/create`

**Description**: Creates a zero-knowledge proof for a Keras/TensorFlow model converted to ONNX format.

**Form Data**:
- `model`: ONNX model file
- `backend`: "tensorflow"
- `inputDimensions`: JSON string with input dimensions

### Verify Proof

**Endpoint**: `POST /zkml/proof/verify`

**Description**: Verifies a zero-knowledge proof generated for a model.

**Request Body**:
```json
{
    "proof": "0x...",
    "publicInputs": [...],
    "verificationKey": "0x..."
}
```

**Success Response** (200 OK):
```json
{
    "success": true,
    "verified": true
}
```

**Error Response** (400 Bad Request):
```json
{
    "success": false,
    "verified": false,
    "error": "Invalid proof"
}
```

---

## Error Handling

All endpoints follow a consistent error response format:

```json
{
    "success": false,
    "error": "Error message describing what went wrong"
}
```

### Common HTTP Status Codes

- `200 OK`: Request successful
- `201 Created`: Resource created successfully
- `400 Bad Request`: Invalid request parameters or body
- `401 Unauthorized`: Missing or invalid authentication
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server-side error

---

## Rate Limiting

API requests may be rate-limited. Check response headers for rate limit information:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Time when limit resets

---

## Support

For issues or questions, please refer to the main project documentation or contact the development team.