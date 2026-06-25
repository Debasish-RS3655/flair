// Tree controllers
// Debashish Buragohain

import { Request, Response } from "express";
import { createMerkleTree, getCurrentTree } from "../lib/nft/tree.js";
import { umi } from "../lib/nft/umi.js";
import { createTreeMessageData } from "../lib/auth/siws/createSignInInput.js";

// Generate the wallet sign message for creating the new tree
export async function getWalletMessage(req: Request, res: Response) {
    const { wallet } = req.params;
    const { backendWallet } = req;
    if (!backendWallet) {
        res.status(403).send({ error: { message: 'System wallet address not found in request.' } });
        return;
    }
    // The backend wallet needs to be the same as the one given in the params
    if (backendWallet !== wallet) {
        res.status(400).send({ error: { message: 'Current wallet does not match system wallet.' } });
        return;
    }
    const walletMessageData = await createTreeMessageData(backendWallet);
    res.json(walletMessageData);
    return;
}

// The create tree router needs to have an additional signature
// Note that for the Merkle Tree creation we need 7.60829 SOL in our wallet
// So for this, make sure you have sufficient funds in your SOL wallet
export async function createTree(req: Request, res: Response) {
    try {
        if (!umi.identity || !umi.identity.publicKey) {
            res.status(500).send({ error: { message: 'System wallet not configured to create merkle tree.' } });
            return;
        }
        const tree = await createMerkleTree(umi);
        if (!tree) {
            res.status(500).send({ error: { message: `Could not create merkle tree.` } });
            return;
        }
        // We have successfully created the merkle tree here at this point
        res.status(200).json({ data: tree });
        return;
    }
    catch (err: any) {
        console.error('Error creating merkle tree:', err);
        res.status(500).send({ error: { message: 'Could not create merkle tree:' + err.message } })
        return;
    }
}

// Route to get the current merkle tree address
export async function getCurrentMerkleTree(req: Request, res: Response) {
    try {
        const tree = await getCurrentTree();
        res.status(200).json({ data: tree });
    }
    catch (err) {
        console.error('Error getting current merkle tree:', err);
        res.status(500).send({ error: { message: `Could not get current merkle tree: ${err}` } });
    }
}
