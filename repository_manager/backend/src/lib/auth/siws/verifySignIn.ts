// SIWS sign in verification
// Debashish Buragohain

import type {
    SolanaSignInInput,
    SolanaSignInOutput
} from '@solana/wallet-standard-features';

import { verifySignIn } from '@solana/wallet-standard-util';
import { createUser, userExists } from '../user/index.js';

export function verifySIWSsignin(
    // need both the input and output for the SIWS verification
    input: SolanaSignInInput,
    output: SolanaSignInOutput
): boolean {

    // firstly we need to serialize the output since the signedMessage function does not give a serialized output
    const serializedOutput: SolanaSignInOutput = {
        account: {
            ...output.account,
            publicKey: new Uint8Array(output.account.publicKey)
        },
        signature: new Uint8Array(output.account.publicKey),
        signedMessage: new Uint8Array(output.signedMessage)
    };


    const authenticated = verifySignIn(input, serializedOutput);
    if (authenticated) {
        // create the user if he does not exist
        const pkString = output.account.publicKey.toString();
        userExists(pkString)
            .then(async yes => {
                if (!yes) { await createUser(pkString) }
            })
            .catch(err => console.error(`Error creating user: ${err}`));
    }

    return authenticated;
}