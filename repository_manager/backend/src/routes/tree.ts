// A particular keypair will be continuously signed in which will sign all the transactions for the NFTs
// Debashish Buragohain

import { Router } from "express";
import { authHandler } from "../middleware/auth/authHandler.js";
import { signInContext, createTreeContext } from "../middleware/auth/context.js";
import { treeAuthHandler } from "../middleware/auth/treeAuthHandler.js";
import * as treeController from '../controllers/tree.controller.js';
import { nftWalletLinkGate } from "../middleware/auth/nftWalletLinkGate.js";

const treeRouter = Router();

// Generate the wallet sign message for creating the new tree
treeRouter.get('/walletMessage/:wallet', authHandler(signInContext), nftWalletLinkGate, treeAuthHandler, treeController.getWalletMessage);

// The create tree router needs to have an additional signature
// Note that for the Merkle Tree creation we need 7.60829 SOL in our wallet
// So for this, make sure you have sufficient funds in your SOL wallet
treeRouter.post('/create', authHandler(createTreeContext), nftWalletLinkGate, treeAuthHandler, treeController.createTree);

// Route to get the current merkle tree address
treeRouter.get('/current', authHandler(signInContext), nftWalletLinkGate, treeAuthHandler, treeController.getCurrentMerkleTree);

export { treeRouter };