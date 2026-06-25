// Authentication script for the Sign In With Solana
// Only for apps that support the SIWS function
// Debashish Buragohain

import { Response, RequestHandler } from "express";
import { verifySIWSsignin } from "../../lib/auth/siws/verifySignIn.js";
import type { SolanaSignInInput, SolanaSignInOutput } from "@solana/wallet-standard-features";
import { Web3AuthHandlerCreator } from "./context";

// siws authentiction to check if we are signed in or not
export const siwsAuth: Web3AuthHandlerCreator = (ctx) => (req, res, next) => {
    const { allowSkipCheck, action } = ctx;

    const authHeader = req.header('Authorization');
    authHeader!.replace('siws', "");   // remove the verificaton strategy from the header
    
    // get the verifiers now
    const { input, output } = JSON.parse(Buffer.from(authHeader!, 'base64').toString('utf-8'));
    const formattedInput: SolanaSignInInput = input;
    const formattedOutput: SolanaSignInOutput = output;

    if (!verifySIWSsignin(formattedInput, formattedOutput)) {
        res.status(401).send({ error: { message: 'Sign In Verification failed!' } });
        return;
    }

    // if the given action is different the specifid action
    // so the SIWS allows only for general sign in pathways. For special permissions we have to use the general pathway only
    if (!allowSkipCheck && action !== 'signin') {
        res.status(401).send({ error: { message: 'Unauthorized action. Please sign the permission.' } });
    }

    // if authorized, attach the authorized public key in the locals property of the response
    res.locals.pubKey = formattedInput.address?.toString();
    next();
}

// get the authorized public key for
export const authorizedPkSiws = (res: Response) => res.locals.pubKey as string;