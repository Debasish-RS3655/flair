import { Request, Response } from 'express';
import { createSignInData, verifySIWSsignin } from '../lib/auth/siws/index.js';
import { verifyGenSignInFirstTime } from "../lib/auth/general/index.js";
import { ensureWalletIdentityForWalletPrincipal } from '../lib/auth/identity/index.js';
import { linkWalletIdentityToUser, resolveUserIdFromPrincipal } from '../lib/auth/identity/index.js';
import { SolanaSignInInput, SolanaSignInOutput } from "@solana/wallet-standard-features";
import { authorizedPk } from '../middleware/auth/authHandler.js';

export const getSignInData = async (req: Request, res: Response) => {
    // Wrap in try/catch so we never drop the connection on validation errors (prevents socket hang-ups)
    try {
        const { address } = req.params;
        const signInInputData = await createSignInData(address);
        res.json(signInInputData);
    } catch (err: any) {
        console.error('Error creating SIWS sign-in payload:', err);
        res.status(400).json({ success: false, error: err?.message || 'Failed to create sign-in payload' });
    }
};

export const signIn = async (req: Request, res: Response) => {
    const { body } = req;

    // General connect + sign in workflow
    if (body.token) {
        try {
            const { token } = body;
            if (!token || typeof token !== "string" || !token.includes(".")) {
                res.status(400).json({ success: false, error: "Invalid token format." });
                return;
            }
            const walletPrincipal = verifyGenSignInFirstTime(token, 'signin');
            await ensureWalletIdentityForWalletPrincipal(walletPrincipal);
            if (walletPrincipal) {
                res.status(200).json({ success: true });
                return;
            }
        }
        catch (err: any) {
            console.error('Error in Authentication: ', err);
            res.status(400).json({ success: false, error: err.message });
        }
    }
    // SIWS sign in
    else if (body.input) {
        try {
            const deconstructPayload: { input: SolanaSignInInput, output: SolanaSignInOutput } = body;
            if (!verifySIWSsignin(deconstructPayload.input, deconstructPayload.output)) {
                res.status(400).json({ success: false });
            }
            else {
                res.json({ success: true });
            }
        }
        catch (err) {
            console.error(`Error in SIWS authentication: ${err}`);
            res.status(400).json({ success: false });
        }
    }
    else res.status(400).json({ success: false });
};

export const linkWallet = async (req: Request, res: Response) => {
    try {
        const principal = authorizedPk(res);
        if (!principal) {
            res.status(401).json({ success: false, error: 'Unauthorized.' });
            return;
        }

        const { token } = req.body as { token?: string };
        if (!token || typeof token !== 'string' || !token.includes('.')) {
            res.status(400).json({ success: false, error: 'Invalid wallet token format.' });
            return;
        }

        const walletPrincipal = verifyGenSignInFirstTime(token, 'signin');
        const userId = await resolveUserIdFromPrincipal(principal);
        if (!userId) {
            res.status(404).json({ success: false, error: 'Authenticated user account not found.' });
            return;
        }

        await linkWalletIdentityToUser(userId, walletPrincipal);
        res.status(200).json({ success: true, data: { wallet: walletPrincipal } });
    } catch (err: any) {
        const message = err?.message || 'Failed to link wallet.';
        if (message.includes('already linked to another account')) {
            res.status(409).json({ success: false, error: message });
            return;
        }
        console.error('Error linking wallet:', err);
        res.status(400).json({ success: false, error: message });
    }
};
