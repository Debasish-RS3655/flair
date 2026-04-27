# Flair CLI Commands ↔ Backend Endpoints Analysis

## Current Backend Routes

### Auth Routes (`/auth`)
- `GET /auth/signin/:address` - Get SIWS message for signing
- `POST /auth/signin` - Verify signature and get session token
- `POST /systemWallet/signin/secret` - Backend wallet auth (localhost only)
- `POST /systemWallet/signin/seed` - Backend wallet auth (localhost only)

### User Routes (`/user`)
- `GET /user/username/:username` - Get user by username
- `GET /user/user/:wallet` - Get user by wallet address
- `GET /user/profile` - Get current user profile
- `PUT /user/update` - Update user profile
- `DELETE /user/delete` - Delete user account

### Repository Routes (`/repo`)
- `GET /repo` - List all user repositories
- `GET /repo/name/:name` - Get repo by name
- `GET /repo/owner/:ownerAddress/name/:name` - Get repo by owner+name
- `GET /repo/hash/:repoHash` - Get repo by hash
- `POST /repo/create` - Create repository
- `PATCH /repo/hash/:repoHash/update` - Update repository
- `DELETE /repo/hash/:repoHash/delete` - Delete repository
- `POST /repo/hash/:repoHash/create_collection` - Convert to NFT collection
- `POST /repo/hash/:repoHash/roles/admin/add` - Add admin
- `POST /repo/hash/:repoHash/roles/admin/remove` - Remove admin
- `POST /repo/hash/:repoHash/roles/writer/add` - Add write access
- `POST /repo/hash/:repoHash/roles/writer/revoke` - Revoke write access
- `GET /repo/hash/:repoHash/roles` - Get repository roles

### Branch Routes (`/repo/hash/:repoHash/branch`)
- `GET` - List branches
- `GET /hash/:branchHash` - Get branch by hash
- `POST /create` - Create branch
- `PATCH /hash/:branchHash/update` - Update branch
- `DELETE /hash/:branchHash/delete` - Delete branch
- `POST /hash/:branchHash/fork` - Fork branch

### Commit Routes (`/repo/hash/:repoHash/branch/hash/:branchHash/commit`)
- `GET` - List commits
- `GET /hash/:commitHash` - Get commit by hash
- `GET /latest` - Get latest commit
- `GET /hash/:commitHash/pull` - Get commit for pull operation
- `POST /create/initiate` - Initiate commit session (3-step flow)
- `POST /create/zkml-check` - Check zkML proof
- `POST /create/zkml-upload` - Upload zkML proofs
- `POST /create/params-upload` - Upload model parameters
- `POST /create/finalize` - Finalize commit
- `POST /hash/:commitHash/createNft` - Create NFT from commit

### Base Model Routes (`/repo/hash/:repoHash/basemodel`)
- `POST /upload` - Upload base model
- `DELETE /delete` - Delete base model
- `GET /fetch_url` - Get base model download URL

### Merkle Tree Routes (`/tree`)
- `GET /tree/walletMessage/:wallet` - Get wallet message for tree creation
- `POST /tree/create` - Create merkle tree
- `GET /tree/current` - Get current merkle tree

---

## Desired CLI Commands vs Endpoints

### ✅ **IMPLEMENTED**
```
flair init                          → POST /repo/create
flair status                        → GET /user/profile (repo info from .flair)
flair login                         → GET /auth/signin/:address + POST /auth/signin
flair whoami                        → GET /user/profile
flair auth status                   → GET /user/profile + check session
flair config                        → Local config management
flair commit                        → POST /repo/.../commit/create/...
flair log                           → GET /repo/.../branch/.../commit
flair show                          → GET /repo/.../branch/.../commit/hash/:hash
```

---

## ❌ **MISSING ENDPOINTS (Need to Add)**

### 1. **`flair clone`** ❌
**Purpose:** Clone a remote repository to local directory
**Missing Endpoints:**
- `GET /repo/hash/:repoHash/clone` - Get repo + branches + latest params for cloning
- Alternative: Use existing `/repo/hash/:repoHash` but need full tree structure

**Suggested Endpoint:**
```typescript
GET /repo/hash/:repoHash/clone-data
Response: {
  repo: {...},
  branches: [{...}],
  latestCommit: {...},
  latestParams: {...}
}
```

---

### 2. **`flair logout`** ❌
**Purpose:** Clear local session
**Status:** This is CLIENT-SIDE only (delete `~/.flair/session.json`), no backend needed ✓

---

### 3. **`flair add`** ❌
**Purpose:** Stage files/artifacts for commit (git staging area concept)
**Missing Endpoints:** None required (client-side staging in `.flair/staging` directory)

---

### 4. **`flair reset`** ❌
**Purpose:** Unstage files or reset to previous state
**Missing Endpoints:** None required (client-side staging operations)

---

### 5. **`flair diff`** ❌
**Purpose:** Compare local changes with last commit
**Missing Endpoints:**
- Need endpoint to get previous commit parameters for comparison
- `GET /repo/hash/:repoHash/branch/hash/:branchHash/commit/hash/:hash/params` - Get commit's params file

**Suggested Endpoint:**
```typescript
GET /repo/hash/:repoHash/branch/hash/:branchHash/commit/hash/:commitHash/diff/:previousHash
Response: {
  current: {...},
  previous: {...},
  diff: {...}
}
```

---

### 6. **`flair checkout`** ❌
**Purpose:** Switch branches
**Missing Endpoints:** None (use existing branch endpoints)
**Status:** Can use `GET /repo/hash/:repoHash/branch/hash/:branchHash` to verify branch exists

---

### 7. **`flair revert`** ❌
**Purpose:** Revert to previous commit
**Missing Endpoints:**
- `POST /repo/hash/:repoHash/branch/hash/:branchHash/commit/hash/:commitHash/revert`

**Suggested Endpoint:**
```typescript
POST /repo/hash/:repoHash/branch/hash/:branchHash/commit/hash/:commitHash/revert
Request: {
  branchId: string,
  commitHashToRevertTo: string,
  message: string (optional)
}
Response: {
  newCommitHash: string,
  status: CommitStatus
}
```

---

### 8. **`flair remote`** ❌
**Purpose:** Manage remote repositories
**Missing Endpoints:**
- `GET /repo/:repoHash/remotes` - List remotes
- `POST /repo/:repoHash/remotes/add` - Add remote
- `DELETE /repo/:repoHash/remotes/:name` - Remove remote

**Note:** This is complex in git-like systems. Flair might not need this if repositories are unique per owner.

---

### 9. **`flair push`** ❌
**Purpose:** Push commits to backend
**Missing Endpoints:**
- `POST /repo/hash/:repoHash/branch/hash/:branchHash/push` - Push commits

**Suggested Endpoint:**
```typescript
POST /repo/hash/:repoHash/branch/hash/:branchHash/push
Request: {
  commits: [{ hash, message, metadata }]
}
Response: {
  pushed: number,
  failed: number
}
```

---

### 10. **`flair pull`** ❌
**Purpose:** Pull latest commits from backend
**Existing Endpoint:** `GET /repo/hash/:repoHash/branch/hash/:branchHash/commit/hash/:commitHash/pull`
**Status:** Endpoint exists but needs proper CLI wrapping

---

### 11. **`flair describe`** ❌
**Purpose:** Show repository details/metadata
**Missing Endpoints:** None (use `GET /repo/hash/:repoHash`)

---

### 12. **`flair owner`** ❌
**Purpose:** Show/manage repository owner
**Missing Endpoints:**
- `GET /repo/hash/:repoHash/owner` - Get repo owner

**Suggested Endpoint:**
```typescript
GET /repo/hash/:repoHash/owner
Response: {
  wallet: string,
  username: string,
  metadata: {...}
}
```

---

### 13. **`flair transfer`** ❌
**Purpose:** Transfer repository ownership
**Missing Endpoints:**
- `POST /repo/hash/:repoHash/transfer-ownership`

**Suggested Endpoint:**
```typescript
POST /repo/hash/:repoHash/transfer-ownership
Request: {
  newOwnerWallet: string
}
Response: {
  success: boolean,
  newOwner: string
}
```

---

### 14. **`flair access`** ❌
**Purpose:** Manage access control (read/write/admin)
**Existing Endpoints:**
- `POST /repo/hash/:repoHash/roles/admin/add`
- `POST /repo/hash/:repoHash/roles/admin/remove`
- `POST /repo/hash/:repoHash/roles/writer/add`
- `POST /repo/hash/:repoHash/roles/writer/revoke`
- `GET /repo/hash/:repoHash/roles`

**Status:** Endpoints exist, just need CLI wrapper ✓

---

### 15. **`flair verify`** ❌
**Purpose:** Verify zkML proofs and commits
**Existing Endpoints:**
- `POST /repo/.../commit/create/zkml-check` - Check zkML proof
- Need endpoint to verify existing commits

**Suggested Endpoint:**
```typescript
GET /repo/hash/:repoHash/branch/hash/:branchHash/commit/hash/:commitHash/verify
Response: {
  verified: boolean,
  zkmlProof: {
    proof: string,
    verified: boolean,
    timestamp: Date
  }
}
```

---

### 16. **`flair clean`** ❌
**Purpose:** Clean up local staging, cache, or stale commits
**Missing Endpoints:** None required (client-side operation)

---

### 17. **`flair version`** ❌
**Purpose:** Show CLI version
**Missing Endpoints:** None (client-side operation)
**Status:** Can hardcode version in `pyproject.toml`

---

## Summary of New Endpoints Needed

| Endpoint | Method | Priority |
|----------|--------|----------|
| `/repo/hash/:repoHash/clone-data` | GET | High |
| `/repo/hash/:repoHash/owner` | GET | Medium |
| `/repo/hash/:repoHash/transfer-ownership` | POST | Medium |
| `/repo/:repoHash/remotes/*` | POST/DELETE/GET | Low (optional) |
| `/repo/hash/:repoHash/branch/hash/:branchHash/push` | POST | High |
| `/repo/hash/:repoHash/branch/hash/:branchHash/commit/hash/:hash/revert` | POST | Medium |
| `/repo/hash/:repoHash/branch/hash/:branchHash/commit/hash/:hash/verify` | GET | Medium |
| `/repo/hash/:repoHash/branch/hash/:branchHash/commit/hash/:hash/diff/:prevHash` | GET | Low |

---

## Client-Side Only Commands (No Backend Needed)

These commands work entirely on the client and don't need new endpoints:
- ✅ `flair logout` - Delete session file
- ✅ `flair add` - Stage files locally
- ✅ `flair reset` - Unstage files locally
- ✅ `flair clean` - Clean local cache/staging
- ✅ `flair version` - Show CLI version
- ✅ `flair config` - Manage local config
- ✅ `flair checkout` - Switch branches (use existing endpoints)
- ✅ `flair describe` - Show repo details (use existing endpoints)
