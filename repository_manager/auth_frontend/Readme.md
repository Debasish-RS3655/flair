# Flair Auth Frontend

Developer documentation for the Solana wallet authentication frontend used by Flair.

This app is a Vite + React TypeScript project that handles:

- wallet connection
- signature-based authentication (primary flow)
- optional SIWS auth support (feature scaffold present)
- tree-specific secondary sign-in token generation
- token forwarding to CLI callback via redirect

## Table Of Contents

- [Purpose](#purpose)
- [Tech Stack](#tech-stack)
- [Project Layout](#project-layout)
- [Runtime Configuration](#runtime-configuration)
- [Authentication Modes](#authentication-modes)
- [End-To-End Workflow](#end-to-end-workflow)
- [Token Formats And Headers](#token-formats-and-headers)
- [Important Providers And Hooks](#important-providers-and-hooks)
- [Important Functions](#important-functions)
- [UI Markup Tags And Routing](#ui-markup-tags-and-routing)
- [How Tree Authentication Works](#how-tree-authentication-works)
- [Failure Modes And Debugging](#failure-modes-and-debugging)
- [Local Development](#local-development)
- [Integration Notes](#integration-notes)

## Purpose

The auth frontend exists to bridge user wallet interaction and backend auth verification.

At a high level:

1. User connects a wallet.
2. Frontend asks backend for sign-in challenge data.
3. User signs a message in wallet.
4. Frontend submits signed payload for verification.
5. Frontend stores token locally or redirects token to CLI callback.

## Tech Stack

- React + TypeScript + Vite
- React Router
- React Query
- Solana wallet adapter stack
- Luxon for expiration checks
- bs58 for Solana message/signature encoding

## Project Layout

- App bootstrap: [repository_manager/auth_frontend/src/main.tsx](repository_manager/auth_frontend/src/main.tsx)
- Root providers and routes: [repository_manager/auth_frontend/src/App.tsx](repository_manager/auth_frontend/src/App.tsx)
- Primary auth page: [repository_manager/auth_frontend/src/pages/Auth.tsx](repository_manager/auth_frontend/src/pages/Auth.tsx)
- Tree auth page: [repository_manager/auth_frontend/src/pages/treeAuth.tsx](repository_manager/auth_frontend/src/pages/treeAuth.tsx)
- General auth helpers: [repository_manager/auth_frontend/src/lib/auth/general.ts](repository_manager/auth_frontend/src/lib/auth/general.ts)
- SIWS helpers: [repository_manager/auth_frontend/src/lib/auth/siws.ts](repository_manager/auth_frontend/src/lib/auth/siws.ts)
- Tree helpers: [repository_manager/auth_frontend/src/lib/auth/tree.ts](repository_manager/auth_frontend/src/lib/auth/tree.ts)
- Request wrapper: [repository_manager/auth_frontend/src/lib/requests/index.ts](repository_manager/auth_frontend/src/lib/requests/index.ts)
- Sign-in message builder: [repository_manager/auth_frontend/src/lib/createsSignInMessageText/index.ts](repository_manager/auth_frontend/src/lib/createsSignInMessageText/index.ts)

## Runtime Configuration

Environment file: [repository_manager/auth_frontend/.env.example](repository_manager/auth_frontend/.env.example)

Variables:

- VITE_API_URL: backend base URL
- VITE_CLI_URL: optional CLI callback endpoint used for local testing
- VITE_SOLANA_NETWORK: Solana cluster selector, expected values include mainnet and devnet

Network selection is resolved in [repository_manager/auth_frontend/src/App.tsx](repository_manager/auth_frontend/src/App.tsx) by mapping env value to Solana wallet adapter network.

## Authentication Modes

### 1. General Wallet Signature Flow (Default, Active)

Implemented by:

- [repository_manager/auth_frontend/src/pages/Auth.tsx](repository_manager/auth_frontend/src/pages/Auth.tsx)
- [repository_manager/auth_frontend/src/lib/auth/general.ts](repository_manager/auth_frontend/src/lib/auth/general.ts)

Behavior:

- Uses wallet signMessage capability.
- Builds ABNF-like message text with mandatory Action field.
- Signs message and generates token format pubKey.message.signature (base58 encoded parts).
- Verifies token with backend endpoint /auth/signin.
- Stores token in localStorage or redirects token to CLI callback using redirect_uri.

### 2. SIWS Flow (Optional Path, Not Currently Used In Auth Page)

Scaffold implemented in:

- [repository_manager/auth_frontend/src/lib/auth/siws.ts](repository_manager/auth_frontend/src/lib/auth/siws.ts)
- [repository_manager/auth_frontend/src/lib/requests/index.ts](repository_manager/auth_frontend/src/lib/requests/index.ts)

Current status:

- SIWS logic exists and can verify input/output payloads.
- Main Auth page currently bypasses SIWS branch and uses general flow.
- Provider for SIWS support flag exists but defaults to false.

### 3. Tree Sign-In Flow (Secondary Action Token)

Implemented by:

- [repository_manager/auth_frontend/src/pages/treeAuth.tsx](repository_manager/auth_frontend/src/pages/treeAuth.tsx)
- [repository_manager/auth_frontend/src/lib/auth/tree.ts](repository_manager/auth_frontend/src/lib/auth/tree.ts)

Behavior:

- Requires an existing general sign-in token first.
- Fetches tree-specific wallet message from backend.
- Signs tree message.
- Produces tree-scoped universal token and stores it in memory singleton.

## End-To-End Workflow

### Standard login sequence

1. App initializes provider tree in [repository_manager/auth_frontend/src/App.tsx](repository_manager/auth_frontend/src/App.tsx).
2. User connects wallet via WalletMultiButton on [repository_manager/auth_frontend/src/pages/Auth.tsx](repository_manager/auth_frontend/src/pages/Auth.tsx).
3. Auth page checks existing local token and validates it via verifyToken.
4. If no valid token, Auth page calls genSignIn.
5. genSignIn fetches challenge input from /auth/signin/:wallet.
6. createSignInMessageText builds signable message.
7. createAuthToken signs message and creates pubKey.message.signature token.
8. Frontend posts token to /auth/signin for verification.
9. On success:
	- if redirect_uri is present, browser redirects with token and wallet params
	- otherwise token is persisted in localStorage
10. Signed-in state is updated in SignedInProvider.

## Token Formats And Headers

### General token

Internal structure:

- pubKey.message.signature
- message and signature are base58 encoded

Authorization header for backend requests:

- Bearer universal<TOKEN>

### SIWS token

Internal structure:

- base64(JSON.stringify({ input, output, action }))

Authorization header:

- Bearer siws<TOKEN>

### Token verification details

verifyToken in [repository_manager/auth_frontend/src/lib/requests/index.ts](repository_manager/auth_frontend/src/lib/requests/index.ts):

- decodes message part
- parses ABNF-like fields
- enforces Expiration Time
- enforces Action match

If verification fails, local storage token is cleared and user must sign in again.

## Important Providers And Hooks

### AdapterProvider

File: [repository_manager/auth_frontend/src/components/AdapterProvider/index.tsx](repository_manager/auth_frontend/src/components/AdapterProvider/index.tsx)

Role:

- stores selected adapter instance globally
- exposes useAdapter hook

### SiwsSupportProvider

File: [repository_manager/auth_frontend/src/components/SiwsSupportProvider/index.tsx](repository_manager/auth_frontend/src/components/SiwsSupportProvider/index.tsx)

Role:

- boolean feature flag for SIWS support path
- exposed via useSiwsSupport hook

### AutoConnectProvider

File: [repository_manager/auth_frontend/src/components/AutoConnectProvider/index.tsx](repository_manager/auth_frontend/src/components/AutoConnectProvider/index.tsx)

Role:

- persists autoConnect preference in local storage
- currently WalletProvider uses autoConnect=true directly

### SignedInProvider

File: [repository_manager/auth_frontend/src/components/signInTokenProivder/index.tsx](repository_manager/auth_frontend/src/components/signInTokenProivder/index.tsx)

Role:

- persists signed-in snapshot in local storage
- exposes usesignedIn hook with wallet, token, signedIn state

## Important Functions

### genSignIn

File: [repository_manager/auth_frontend/src/lib/auth/general.ts](repository_manager/auth_frontend/src/lib/auth/general.ts)

Responsibilities:

- fetches sign-in input from backend
- composes sign-in message
- signs message with wallet
- verifies with backend
- handles CLI redirect_uri callback path
- persists fallback local token

### createAuthToken

File: [repository_manager/auth_frontend/src/lib/auth/general.ts](repository_manager/auth_frontend/src/lib/auth/general.ts)

Responsibilities:

- encodes message bytes
- requests signature from wallet
- returns pubKey.message.signature token string

### request, genRequest, siwsRequest

File: [repository_manager/auth_frontend/src/lib/requests/index.ts](repository_manager/auth_frontend/src/lib/requests/index.ts)

Responsibilities:

- unified authenticated request dispatch
- auto-selects SIWS or general mode based on available token storage
- applies correct Authorization scheme prefix

### verifyToken

File: [repository_manager/auth_frontend/src/lib/requests/index.ts](repository_manager/auth_frontend/src/lib/requests/index.ts)

Responsibilities:

- parses signed message metadata
- validates action scope
- validates expiration time

### treeSignIn

File: [repository_manager/auth_frontend/src/lib/auth/tree.ts](repository_manager/auth_frontend/src/lib/auth/tree.ts)

Responsibilities:

- checks base login presence
- fetches tree action message from backend
- signs tree message
- returns tree token for privileged tree actions

## UI Markup Tags And Routing

### Root composition tags

Defined in [repository_manager/auth_frontend/src/App.tsx](repository_manager/auth_frontend/src/App.tsx):

- ConnectionProvider: injects Solana RPC connection endpoint
- WalletProvider: injects wallet list and wallet state
- WalletModalProvider: provides wallet modal UI behavior
- Router / Routes / Route: maps auth pages

Routes:

- / -> Auth page
- /tree -> TreeAuth page

### Auth page tags

Defined in [repository_manager/auth_frontend/src/pages/Auth.tsx](repository_manager/auth_frontend/src/pages/Auth.tsx):

- h1: page heading
- div.home-container: centered page layout wrapper
- div.display-board: auth card
- WalletMultiButton: wallet connect/select control
- button: logout action
- p and strong: signed-in details display

### TreeAuth page tags

Defined in [repository_manager/auth_frontend/src/pages/treeAuth.tsx](repository_manager/auth_frontend/src/pages/treeAuth.tsx):

- div.TreeAuth-container: wrapper
- h1: feature heading
- button: trigger tree sign-in
- p and strong: wallet/token/status details

### Styling

Main auth styles are in [repository_manager/auth_frontend/src/styles.css](repository_manager/auth_frontend/src/styles.css).

## How Tree Authentication Works

Tree auth is an action-scoped secondary signature flow.

1. User must already be signed in (general token present).
2. Frontend requests tree action message from backend.
3. User signs the tree message.
4. Frontend creates token prefixed with universal.
5. Token is stored in memory and shown in UI for downstream calls.

This keeps tree actions logically separated from base sign-in.

## Failure Modes And Debugging

Common issues:

- Wallet lacks signMessage support: user cannot complete general flow.
- Expired token: verifyToken throws and token is cleared.
- Action mismatch: request action does not match Action in signed message.
- Missing redirect_uri consumer: CLI token handoff appears to do nothing.
- API URL mismatch: sign-in endpoints fail due to wrong VITE_API_URL.

Debug checklist:

1. Confirm env values from .env.
2. Confirm backend /auth/signin/:wallet and /auth/signin are reachable.
3. Confirm wallet supports required capability (signMessage or signIn).
4. Inspect browser storage for authToken and signedIn.
5. Inspect console logs around token creation and verification.

## Local Development

From [repository_manager/auth_frontend](repository_manager/auth_frontend):

```bash
pnpm install
pnpm run dev
```

Build and preview:

```bash
pnpm run build
pnpm run preview
```

## Integration Notes

- Backend API contracts must stay consistent with message formats expected by createSignInMessageText and parseSignInMessage.
- Action field is central to authorization scoping in this frontend.
- If SIWS is enabled in UI later, align storage and request routing so SIWS and universal token paths cannot conflict.
- The current folder name signInTokenProivder is intentionally kept as-is in imports; renaming it requires coordinated refactor.
