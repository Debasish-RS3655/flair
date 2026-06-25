// SIWS authentication router
// Debashish Buragohain

import { Router } from "express";
import * as authController from '../controllers/auth.controller.js';
import { authHandler, signInContext } from '../middleware/auth/index.js';

const authRouter = Router();

// Similar to JWT and the way we did with the general Solana authentication we need to send the sign in token every time we send
// a request to the backend.
// This needs to be a get request
authRouter.get('/signin/:address', authController.getSignInData);

// Sign in is the only endpoint where we send the headers as a body for the first time verification
authRouter.post('/signin', authController.signIn);

// Google sign-in endpoint for session token issuance.
authRouter.post('/signin/google', authController.googleSignIn);

// Link a wallet to the currently authenticated user using the existing wallet sign-in token.
authRouter.post('/link/wallet', authHandler(signInContext), authController.linkWallet);

export { authRouter };