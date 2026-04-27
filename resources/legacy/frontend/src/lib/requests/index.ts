import { DateTime } from 'luxon';
import { MemoryStoredTokenSiws } from '../auth/siws';
import { SolanaSignInInput, SolanaSignInOutput } from '@solana/wallet-standard-features';
import { LocalStorageTokenGen } from '../auth/general';
import b58 from 'bs58';
import { parseSignInMessage } from '../auth/helper/abnf_prarser';

// SIWS request function. In here, the token does not include the action because the default action in SIWS is the sign in action
// therefore we send particularly the action for the SIWS, that must be compared.
export const siwsRequest = async (contents: requestParams) => {
  const { method, url, data, action } = contents;
  // try to reuse existing token
  const { input, output } = MemoryStoredTokenSiws.getInstance();
  const isValidToken = (input?: SolanaSignInInput, output?: SolanaSignInOutput): boolean => {
    if (!input || !output) {
      console.warn('Not signed in.');
      return false;
    }
    if (!input.expirationTime) {
      console.warn('Required field expirationTime not present in sign in input from backend.');
      return false;
    }
    if (Date.now() > new Date(input.expirationTime).getTime()) {
      console.warn('Authentication token expired.');
      return false;
    }
    return true;
  };

  if (!isValidToken(input, output)) {
    // in the current version we are not signing in SIWS from this function itself
    throw new Error('Cannot make request as wallet not signed in. Please sign in first.');
  }

  // Base64 encode the token payload including the action
  const token = btoa(JSON.stringify({ input, output, action }));
  return await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer siws${token}`,
    },
    body: data ? data : undefined,
    method: method ? method : data ? 'POST' : 'GET',
  })
    .then(r => r.json())
    .catch(err => console.error(`Error sending SIWS token to backend: ${err}`));
};

// General workflow requests
// For the general workflow, the action is included in the token itself. Therefore we check it.
export const genRequest = async (contents: requestParams): Promise<Response> => {
  const { method, url, data, action } = contents;
  // Sign in is the action equivalent to SIWS authentication in the general workflow.
  // Try to reuse existing token.
  // const memoryToken = MemoryStoredTokenGen.getInstance().token;
  const localStorageToken = LocalStorageTokenGen.getToken();
  if (!localStorageToken) {
    throw new Error('User not signed in. Please sign in first.');
  }
  try {
    // verify the token at this point
    const verified = verifyToken(localStorageToken, action || 'signin'); // the default action is the signin action
    if (verified) {
      // Final request for the general workflow request
      return await fetch(url, {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer universal${localStorageToken}`,
        },
        body: data ? data : undefined,
        method: method ? method : data ? 'POST' : 'GET',
      });
    } else {
      throw new Error('Error: Auth token invalid for request.');
    }
  } catch (err) {
    LocalStorageTokenGen.clearToken(); // clear the local storage token now
    throw new Error(`Error in token verification: ${err}`);
  }
};

// verify if the token we have is valid or not in terms of expiration time and action
export const verifyToken = (memoryToken: string, action: string): boolean => {
  const [, msg] = memoryToken.split('.'); // msg here contains the ABNF-like string that pops up in the user's wallet
  // Check the expiration time for the token and the associated action
  const decodedSignInMessage = new TextDecoder().decode(b58.decode(msg));
  const parsedDecoded = parseSignInMessage(decodedSignInMessage);
  const actionInToken = parsedDecoded['Action'] as string;
  console.log('Action in token:', actionInToken, action);
  const expirationTime = parsedDecoded['Expiration Time'] as string;
  if (!actionInToken || !expirationTime)
    throw new Error(
      'Required fields (Action, Expiration Time) are missing from token. Please sign in again.',
    );
  // Check token expiration: Convert the ISO string to a Unix timestamp
  const expUnix = DateTime.fromISO(expirationTime).toUnixInteger();
  if (DateTime.local().toUTC().toUnixInteger() > expUnix) {
    throw new Error('Expired token. Please sign in again');
  }
  if (actionInToken !== action)
    throw new Error(
      `Action mismatch in token. Desired action: ${action} Action in token: ${actionInToken}`,
    );
  return true;
};

// parameters for the request
export interface requestParams {
  method?: string;
  url: string;
  data?: string;   // is a JSON.stringify of the data
  action?: string; // action is necessary for all requests now
}

// A general request involves all the general functionalities.
// If the action field is not provided, default to 'signin'
export const request = async (contents: requestParams) => {
  const defaultedContents = { ...contents, action: contents.action || 'signin' };

  // if we are connected using SIWS
  if (MemoryStoredTokenSiws.getInstance().output) {
    return await siwsRequest(defaultedContents);
  }
  // if connected using the general workflow
  else if (LocalStorageTokenGen.getToken()) {
    return await genRequest(defaultedContents);
  } else {
    throw new Error('No auth token found. Cannot make request.');
  }
};
