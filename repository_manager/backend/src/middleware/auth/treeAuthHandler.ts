// Authentication handler middleware for the tree routes
// Debashish Buragohain


import { Request, Response, NextFunction } from "express";
import { umi } from "../../lib/nft/index.js";
import { authorizedPk } from "./web3Auth.js";

// for accessing the tree routes it is mandatory to be signed into the backend wallet
export const treeAuthHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!umi.identity || !umi.identity.publicKey) {
        res.status(500).send({ error: { message: 'Backend wallet not signed in.' } });
        return;
    }
    const requestingWallet = authorizedPk(res);       // check of the signed umi wallet is same as the one making the request    
    if (!requestingWallet) {
        res.status(401).send({ error: { message: 'Requesting wallet not signed in.' } });
        return;
    }
    // first check if the backend wallet is actually signed in or not
    const backendWallet = umi.identity.publicKey.toString();
    // make sure the currently signing wallet and the backend wallets are matching
    if (requestingWallet !== backendWallet) {
        console.log('Current backend wallet:', backendWallet);
        console.log('Requesting wallet:', requestingWallet);
        res.status(401).send({ error: { message: 'Signed in wallet does not match Backend Wallet.' } });
        return;
    }
    // attach the backend wallet to the request object now
    req.backendWallet = backendWallet;
    next();
}
