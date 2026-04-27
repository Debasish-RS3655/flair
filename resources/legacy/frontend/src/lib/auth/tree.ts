// Tree sign in functions
// Debashish Buragohain

import { web3 } from '@project-serum/anchor';
import { createTreeSignInMessageText } from './helper/treeSignInMessage.js';
import { PublicKey } from '@solana/web3.js';
import { genRequest } from '../requests/index.js';
import { createAuthToken } from './general';
import { SolanaActionMessage } from './types';
import { LocalStorageTokenGen } from './general';

const apiUrl = process.env.NEXT_PUBLIC_API_URL;

// creating the memory stored token for the tree operation now
export class MemoryStoredTokenTree {
  private constructor(public token: string | null = null) {}
  private static instance: MemoryStoredTokenTree;
  static getInstance(): MemoryStoredTokenTree {
    if (!MemoryStoredTokenTree.instance) {
      MemoryStoredTokenTree.instance = new MemoryStoredTokenTree();
    }
    return MemoryStoredTokenTree.instance;
  }
  public setToken(token: string) {
    this.token = token;
  }
}

// fetch the tree sign in input from the backend
export const getTreeSignInData = async (
  publicKey: web3.PublicKey,
): Promise<SolanaActionMessage> => {
  // the tree sign in works only when the wallet is normally signed in first
  if (!LocalStorageTokenGen.getToken()) {
    throw new Error('Wallet not signed in. Please sign in first.');
  }
  // using the general request wrapper for making the request
  try {
    const response = await genRequest({
      url: apiUrl + '/tree/walletMessage/' + publicKey.toBase58(),
      method: 'GET',
      action: 'signin',
    });

    const res = await response.json();
    if (!res.action) {
      throw new Error(`Could not sign into tree account.`);
    }
    const createTreeSignInResponse = res as SolanaActionMessage;
    return createTreeSignInResponse;
  } catch (err) {
    throw new Error(`Error getting tree sign in data: ${err}`);
  }
};

// tree sign in function
// we are signing into the tree wallet using the universal sign in workflow
export const treeSignIn = async (
  publicKey: PublicKey,
  signMessage: (message: Uint8Array) => Promise<Uint8Array>,
): Promise<string> => {
  if (!publicKey || !signMessage) throw new Error('Could not connect to wallet for tree sign in.');
  const treeSignInData: SolanaActionMessage = await getTreeSignInData(publicKey);
  let treeSignInMessage: string = createTreeSignInMessageText(treeSignInData);
  treeSignInMessage += '\n';
  // create the auth token for the tree sign in
  const authToken =
    'universal' +
    (await createAuthToken(treeSignInMessage, {
      publicKey,
      signMessage,
    }));
  // for making things quick we do not verify the token again in the backend
  console.log('Tree sign in token:', authToken); // set the tree token and sign in again
  MemoryStoredTokenTree.getInstance().setToken(authToken);
  return authToken;
};
