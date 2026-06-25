import type { RequestHandler } from 'express';
import { authorizedPrincipal } from './authHandler.js';
import { isGooglePrincipal } from '../../lib/auth/identity/index.js';

/**
 * Ensures NFT actions always have a wallet context.
 *
 * NFT actions are wallet-critical and must run under wallet auth context.
 */
export const nftWalletLinkGate: RequestHandler = async (_req, res, next) => {
    try {
        const principal = authorizedPrincipal(res);
        if (!principal) {
            res.status(401).send({ error: { message: 'Unauthorized user context.' } });
            return;
        }

        if (isGooglePrincipal(principal)) {
            res.status(403).send({
                error: {
                    message: 'Wallet-authenticated session required for NFT actions. Please sign in with your Solana wallet.'
                }
            });
            return;
        }

        res.locals.nftWallet = principal;
        next();
    } catch (err) {
        console.error('Error while validating wallet link for NFT action:', err);
        res.status(500).send({ error: { message: 'Internal Server Error' } });
    }
};
