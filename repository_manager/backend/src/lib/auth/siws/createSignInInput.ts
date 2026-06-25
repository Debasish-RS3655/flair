// the sign in input needs to be generated from the backend itself
// Debashish Buragohain

// for official uses we will be generating more complex messages, but simpler ones good for trial

import type { SolanaSignInInput } from '@solana/wallet-standard-features';
import { v4 as uuidv4 } from 'uuid';
import { DateTime } from 'luxon';
import { SolanaActionMessage } from './types';

const SIGN_IN_EXPIRY_TIME = parseInt(process.env.SIGN_IN_EXPIRY_TIME || '10', 10);

export const createSignInData = async (address: string,  expiryInMins: number = SIGN_IN_EXPIRY_TIME): Promise<SolanaSignInInput> => { 
    if (!address) {
        throw new Error('No wallet address provided to generate sign in data.');    
    }
    const now: Date = new Date();
    const uri = process.env.HREF || 'http://localhost:4000';
    const currentUrl = new URL(uri);
    const domain = currentUrl.host;
    // default expiry time for phantom is 10 mins
    const expirationTime = DateTime.local().toUTC().plus({minutes: expiryInMins}).toISO()
    // convert the date object into a string
    const currentDateTime = now.toISOString();

    // so the signInData can be kept empty in most cases: all fields are optional

    // this will create the fields and additional fields when we sign in using Phantom    
    const signInData: SolanaSignInInput = {
        // address not provided, the wallet determines it itself
        uri,
        domain,
        address,
        statement:
            "Clicking Sign or Approve only means you have proved this wallet is owned by you. This request will not trigger any blockchain transaction or cost any gas fee.",
        version: "1",                           // current version for the message which must be 1 for this specification
        nonce: uuidv4(),                        // random alphanumeric nonce based on UUID
        chainId: 'mainnet',                     // chainid is always a string like this
        issuedAt: currentDateTime,
        expirationTime,
        resources: ['https://phantom.com/learn/developers/sign-in-with-solana', 'https://phantom.app/']
    }
    return signInData;
}

// creating the signing in message for the tree creation
export const createTreeMessageData = async (address: string,  expiryInMins: number = 10): Promise<SolanaActionMessage> => { 
    if (!address) {
        throw new Error('No wallet address provided to generate sign in data.');    
    }
    const now: Date = new Date();
    const uri = process.env.HREF || 'http://localhost:4000';
    const currentUrl = new URL(uri);
    const domain = currentUrl.host;
    // default expiry time for phantom is 10 mins
    const expirationTime = DateTime.local().toUTC().plus({minutes: expiryInMins}).toISO()
    // convert the date object into a string
    const currentDateTime = now.toISOString();

    // so the signInData can be kept empty in most cases: all fields are optional

    // this will create the fields and additional fields when we sign in using Phantom    
    const signInData: SolanaActionMessage = {
        // address not provided, the wallet determines it itself
        uri,
        domain,
        address,
        action: 'createTree',
        statement:
            "Confirming this message will create a new Merkle Tree for this wallet, which will require Gas Fees. Proceed only when confirmed.",
        version: "1",                           // current version for the message which must be 1 for this specification
        nonce: uuidv4(),                        // random alphanumeric nonce based on UUID
        chainId: 'mainnet',                     // chainid is always a string like this
        issuedAt: currentDateTime,
        expirationTime,
        resources: ['https://phantom.com/learn/developers/sign-in-with-solana', 'https://phantom.app/']
    }
    return signInData;
}
