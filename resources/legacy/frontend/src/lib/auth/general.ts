// requests file for wallets that do not support SIWS
// traditional connect + sign message flow with persistent localStorage
// Debashish Buragohain

import { web3 } from '@project-serum/anchor';
import b58 from 'bs58';
import { getSignInData } from './siws';
import { SolanaSignInInput } from '@solana/wallet-standard-features';
import { createSignInMessageText } from '../createsSignInMessageText';
import { PublicKey } from '@solana/web3.js';

const apiUrl = process.env.NEXT_PUBLIC_API_URL;
export type MessageSigner = {
  signMessage(message: Uint8Array): Promise<Uint8Array>;
  publicKey: web3.PublicKey;
};

/**
 * Manages authToken in localStorage only for persistence across reloads.
 */
export class LocalStorageTokenGen {
  private static key = 'authToken';
  private constructor() {}

  public static getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(this.key);
  }

  public static setToken(token: string): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.key, token);
    }
  }

  public static clearToken(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.key);
    }
  }
}

/**
 * Creates an authentication token: `pubKey.message.signature` (All in base58).
 */
export const createAuthToken = async (
  signInMessage: string,
  wallet: MessageSigner,
): Promise<string> => {
  const encodedMessage = new TextEncoder().encode(signInMessage);
  const signature = await wallet.signMessage(encodedMessage);
  const pk = wallet.publicKey.toBase58();
  const msg = b58.encode(encodedMessage);
  const sig = b58.encode(signature);
  return `${pk}.${msg}.${sig}`;
};

/**
 * Sign-in flow: fetch signIn data, sign, verify, and persist token.
 */
export const genSignIn = async (
  publicKey: PublicKey,
  signMessage: (message: Uint8Array) => Promise<Uint8Array>,
): Promise<string> => {
  if (!publicKey || !signMessage) throw new Error(`Could not connect to wallet.`);
  const signInData: SolanaSignInInput = await getSignInData(publicKey);
  const signInMessage = createSignInMessageText(signInData, 'signin') + '\n';

  const authToken = await createAuthToken(signInMessage, { publicKey, signMessage });
  const response = await fetch(apiUrl + '/auth/signin', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: authToken }),
  });
  const verified = await response.json();

  if (!verified.success) throw new Error('Could not sign in.');

  // persist token
  LocalStorageTokenGen.setToken(authToken);
  console.log('Sign In successful, token saved to localStorage.');
  return authToken;
};

/**
 * Generic request: always reads latest authToken from localStorage.
 */
export const req = async <T>(contents: { method?: string; url: string; data?: T }) => {
  const { method, url, data } = contents;

  const token = LocalStorageTokenGen.getToken();
  if (!token) {
    throw new Error('No auth token found. Please sign in first.');
  }

  return fetch(apiUrl + url, {
    method: method ?? (data ? 'POST' : 'GET'),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: data ? JSON.stringify(data) : undefined,
  });
};

// experimental code ! Not in production !
// fetch the signInInput from the backend and also generate the message text
// export const getSignInMsg = async (): Promise<string> => {
//     const createResponse = await fetch(apiUrl + '/auth/signin');
//     const input: SolanaSignInInputWithRequiredFields = await createResponse.json();
//     return createSignInMessageText(input);
// }
// creates the sign in input and output tokens and stores in memory
// bringing the sign in function to this snippet itself
// export const genSignIn = async (adapter: WalletConnectWalletAdapter | null): Promise<boolean> => {
//     const input = await getSignInMsg();
//     const encodedMessage = new TextEncoder().encode(input);
//     if (!encodedMessage)
//         throw new Error('Could not generate input message.');
//     // send this received sign in input to the wallet and trigger a sign-in request
//     // this pops up the message for the user to sign in
//     let signature: Uint8Array = new Uint8Array();
//     if (!adapter) {
//         const { connect, signMessage } = useWallet();
//         if (!signMessage) {
//             await connect();       // connect the wallet in case if it is not connected
//         }
//         // till here the wallet is connected and we need to send the signed message to the backend for verification
//         if (!signMessage) throw new Error('Could not connect to wallet.');
//         signature = await signMessage(encodedMessage);
//     }
//     else {
//         signature = await adapter.signMessage(encodedMessage);

//     // we have the signature though but we cannot get the wallet instance

//     // so till here we have the signature and here we generate the SolanaOutput object for verification
//     let output: SolanaSignInOutput = {
//             signedMessage: encodedMessage,
//             signature: signature,

//     }

//     // the output is of type SolanaSignInOutput
//     const strPayload = JSON.stringify({ input, output });
//     const verifyResponse = await fetch(apiUrl + '/auth/signinGen', {
//         method: 'POST',
//         body: strPayload,
//         headers: {
//             'Accept': 'application/json',
//             'Content-Type': 'application/json'
//         }
//     }).then(r => r.json());

//     if (!verifyResponse.success) {
//         console.error('Sign In Verfication failed!');
//         throw new Error('Sign In Verfication failed!');
//     }

//     // nothing till here means we have successfully signed in
//     // dont need to do auto connect now
//     // store the headers in memory now
//     console.log('Sign In Successful.');
//     MemoryStoredTokenGen.getInstance().setAuth(input, output);
//     return false;
// }

// // creating a dedicated request function that sends the authorization headers along with the request
// export const req = async <T>(
//     contents: {
//         method: string | undefined,         // the method used for the http request
//         url: string,            // relative url of the request
//         data?: T                // e.g. fields we want to fetch from database
//     }) => {
//     const { method, url, data } = contents;
//     // try to reuse existing token
//     let { input, output } = MemoryStoredTokenGen.getInstance();
//     if (!input || !output) {
//         // this request exclusively requires that your wallet has the signIn feature enabled
//         const signInFailed = await siwsSignIn(null);
//         if (signInFailed) {
//             throw new Error('Cannot make request as wallet not signed in. Please sign in first.');
//         }
//         input = MemoryStoredTokenGen.getInstance().input;
//         output = MemoryStoredTokenGen.getInstance().output;
//     }

//     // text encode the headers for transmission to the backend
//     const token = btoa(JSON.stringify({ input, output }));

//     return await fetch(apiUrl + url, {
//         headers: {
//             'Accept': 'application/json',
//             'Content-Type': 'application/json',
//             'Authorization': `Bearer ${token}`
//         },
//         body: (data) ? JSON.stringify(data) : undefined,
//         method: method ? method : data ? "POST" : "GET"
//     })
// }
