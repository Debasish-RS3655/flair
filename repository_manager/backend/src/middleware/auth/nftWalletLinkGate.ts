import type { RequestHandler } from 'express';
import { authorizedPk } from './authHandler.js';
import {
    getAttachedWalletForGooglePrincipal,
    isGooglePrincipal,
} from '../../lib/auth/identity/index.js';

/**
 * Ensures NFT actions always have a wallet context.
 *
 * Backward compatibility:
 * - Wallet-native users (principal is a wallet address) pass through.
 * - Google users must have a WALLET identity attached to their canonical account.
 */
export const nftWalletLinkGate: RequestHandler = async (_req, res, next) => {
    try {
        const principal = authorizedPk(res);
        if (!principal) {
            res.status(401).send({ error: { message: 'Unauthorized user context.' } });
            return;
        }

        // Existing wallet-native identity continues to work as-is.
        if (!isGooglePrincipal(principal)) {
            res.locals.nftWallet = principal;
            next();
            return;
        }

        const attachedWallet = await getAttachedWalletForGooglePrincipal(principal);
        if (!attachedWallet) {
            res.status(403).send({
                error: {
                    message: 'Wallet not linked. Please link a Solana wallet before performing NFT actions.'
                }
            });
            return;
        }

        res.locals.nftWallet = attachedWallet;
        next();
    } catch (err) {
        console.error('Error while validating wallet link for NFT action:', err);
        res.status(500).send({ error: { message: 'Internal Server Error' } });
    }
};
