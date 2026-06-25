// requests file for wallets that do not support SIWS
// proceed with the traditional connect + sign message flow
// the requests code adds the authentication headers in every request
// as well as stores the tokens that are received from the authentication endpoint
// Debashish Buragohain

import { web3 } from "@project-serum/anchor";
import b58 from 'bs58';
import { getSignInData } from "./siws";
import { SolanaSignInInput } from "@solana/wallet-standard-features";
import { createSignInMessageText } from "../createsSignInMessageText";
import { PublicKey } from "@solana/web3.js";

const apiUrl = import.meta.env.VITE_API_URL;
export type MessageSigner = {
    signMessage(message: Uint8Array): Promise<Uint8Array>;
    publicKey: web3.PublicKey;
  };
  
  /**
   * Singleton class for storing a valid signature on-memory.
   */
export class MemoryStoredTokenGen {
    private constructor(public token: string | null = null) {}
    private static instance: MemoryStoredTokenGen;
    static getInstance(): MemoryStoredTokenGen {
      if (!MemoryStoredTokenGen.instance) {
        MemoryStoredTokenGen.instance = new MemoryStoredTokenGen();
      }
      return MemoryStoredTokenGen.instance;
    }
    public setToken(token: string) {
      this.token = token;
    }
  }
  
  // a similar singleton class for storing the auth token in the local storage instead of in memory
  export class LocalStorageTokenGen {
    private static instance: LocalStorageTokenGen;
    private key = 'authToken'; // choose a key name
    private constructor() {}
    static getInstance(): LocalStorageTokenGen {
      if (!LocalStorageTokenGen.instance) {
        LocalStorageTokenGen.instance = new LocalStorageTokenGen();
      }
      return LocalStorageTokenGen.instance;
    }
  
    public getToken(): string | null {
      return localStorage.getItem(this.key);
    }
  
    public setToken(token: string): void {
      localStorage.setItem(this.key, token);
    }
  
    public clearToken(): void {
      localStorage.removeItem(this.key);
    }
  }
  
  /**
   * Creates an authentication token to be passed to the server
   * via auth headers, returns the following format:
   * `pubKey.message.signature` (All in base58).
   * @param signInMessage The message received from the backend
   * @param wallet Signer.
   * @returns {Promise<string>} pubKey.message.signature (All in base58)
   */
  
  export const createAuthToken = async (
    signInMessage: string,
    wallet: MessageSigner,
  ): Promise<string> => {
    // the message consists of the action and the expiry in minutes
    const encodedMessage = new TextEncoder().encode(signInMessage);
    
    // so we sign this message using the wallet making the wallet pop up
    // this pops up the wallet to the user asking him to confirm
    
    const signature = await wallet.signMessage(encodedMessage);
    const pk = wallet.publicKey.toBase58();   // function returns the public key of the wallet that has made the signature
    const msg = b58.encode(encodedMessage);   // the message that was just signed
    const sig = b58.encode(signature);        // and the sigature itself, all in bs58 format
    return `${pk}.${msg}.${sig}`;
  };


  // creates the sign in token and signs in and stores in memory and returns the auth token
  export const genSignIn = async (publicKey: PublicKey, signMessage: ((message: Uint8Array) => Promise<Uint8Array>)) : Promise<string> => {
    if (!publicKey || !signMessage) throw new Error(`Could not connect to wallet.`);
    const signInData: SolanaSignInInput = await getSignInData(publicKey);        // fetch the sign in data from the backend    
    // !-- uncomment if using SIWS message generation
    // const isSignInInputWithRequriedFields = (data: SolanaSignInInput): data is SolanaSignInInputWithRequiredFields => {
    //   return !!data.domain && !!data.address
    // }
    // if (!isSignInInputWithRequriedFields(signInData)) {              // convert to required fields type data
    //   throw new Error(`Invalid sign-in data: 'domain' and 'address' are required.`);
    // }
    let signInMessage: string = createSignInMessageText(signInData, 'signin');
    // add the action to this sign in message    
    signInMessage += '\n'
    
    const authToken = await createAuthToken(signInMessage, {
      publicKey,
      signMessage
    });
    console.log(`General sign in token: universal${authToken}`);
    // this auth token first needs to the backend for verification
    const verified = await fetch(apiUrl + '/auth/signin', {
      method: 'POST',
      body: JSON.stringify({token: authToken}),
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    }).then(r => r.json());

    if (verified.success) {
      console.log('General workflow Sign In successful.');
      
      // Get redirect_uri from URL params (CLI passes this when opening browser)
      const params = new URLSearchParams(window.location.search);
      const redirectUri = params.get('redirect_uri');
      
      if (redirectUri) {
        // Redirect back to CLI's callback with token
        const callbackUrl = new URL(redirectUri);
        callbackUrl.searchParams.append('token', authToken);
        callbackUrl.searchParams.append('wallet', publicKey.toBase58());
        window.location.href = callbackUrl.toString();
        return authToken;
      }
      

      // TEST CODE: send to local cli for testing
      // const cliUrl = import.meta.env.VITE_CLI_URL;
      // try {
      // // send the auth token to the cli server now
      // await fetch(cliUrl, {
      //   method: 'POST',
      //   body: JSON.stringify({authToken: `universal${authToken}`, wallet: publicKey.toBase58()}),
      //   mode: 'no-cors', 
      //   headers: {
      //     'Accept': 'application/json',
      //     'Content-Type': 'application/json'
      //   }
      // });
      // console.log('sent general auth token to the cli server.');
      // }
      // catch(err) {
      //   console.error(`Error sending general auth token to cli server: ${err}`);
      // }
      
      
      // create the Umi object here
      // const { adapter } = useAdapter();
      // const { setUmi  } = useUmi();
      // const umi = await initializeUmi(adapter);
      // setUmi(umi);

      // MemoryStoredTokenGen.getInstance().setToken(authToken);    


      // Fallback: store in localStorage if no redirect_uri
      LocalStorageTokenGen.getInstance().setToken(authToken);
      return authToken;
    }
    else {
      throw new Error('Could not sign in.');
    }
  }
  
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