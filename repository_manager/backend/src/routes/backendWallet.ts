// Routes for the backend wallet
// Debashish Buragohain

import { Router } from "express";
import * as backendWalletController from '../controllers/backendWallet.controller.js';

const backendWalletRouter = Router();

// Sends only the private key as the body component 
backendWalletRouter.post('/signin/secret', backendWalletController.signInWithSecret);

// POST endpoint to sign in with a mnemonic seed phrase
// Send the seed as the following in the request:
// seed: "apple banana cherry date egg fruit grape honey kiwi lemon mango nut"
backendWalletRouter.post('/signin/seed', backendWalletController.signInWithSeed);

export { backendWalletRouter };