export type TypeCommit = {
  metrics: {
    accuracy: number;
    loss: number;
  } | null; // in one object it was null
  id: string;
  commitHash: string;
  previousMergerCommit: string;
  relatedMergerCommit: string | null;
  status: string;
  rejectedMessage: string | null;
  message: string;
  paramHash: string;
  createdAt: string;
  statusUpdatedAt: string | null;
  architecture: string;
  branchId: string;
  committerAddress: string;
  committerId: string;
  isDeleted: boolean;
  nftId: string | null;
  verified: boolean;
};

export type TypeMergerCommitGroup = {
  mergerCommit: TypeCommit;
  commits: TypeCommit[];
};

import { PublicKey } from '@solana/web3.js';
import { SolanaSignInInput } from '@solana/wallet-standard-features';
// type definitions
// Debashish Buragohain

type DisplayEncoding = 'utf8' | 'hex';

type PhantomEvent = 'connect' | 'disconnect' | 'accountChanged';

// a phantom request method can be to connect disconnect signMessage and signIn
type PhantomRequestMethod = 'connect' | 'disconnect' | 'signMessage' | 'signIn';

interface ConnectOpts {
  onlyIfTrusted: boolean;
}

export interface Provider {
  publicKey: PublicKey | null;
  isConnected: boolean | null;
  signMessage: (message: Uint8Array | string, display?: DisplayEncoding) => Promise<Uint8Array>;
  signIn: (signInData: SolanaSignInInput) => Promise<{
    address: PublicKey;
    signedMessage: Uint8Array;
    signature: Buffer;
  }>;
  connect: (opts?: Partial<ConnectOpts>) => Promise<{ publicKey: PublicKey }>;
  disconnect: () => Promise<void>;
  on: (event: PhantomEvent, handler: (args: unknown) => void) => void;
  request: (method: PhantomRequestMethod, params: unknown) => Promise<unknown>;
}

export type Status = 'success' | 'warning' | 'error' | 'info';

export interface TLog {
  status: Status;
  method?: PhantomRequestMethod | Extract<PhantomEvent, 'accountChanged'>;
  confirmation?: { signature: string; link: string };
  message: string;
  messageTwo?: string;
}
