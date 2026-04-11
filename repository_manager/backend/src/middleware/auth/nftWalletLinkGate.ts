import type { RequestHandler } from 'express';
import { prisma } from '../../lib/prisma/index.js';
import { authorizedPk } from './authHandler.js';

const GOOGLE_PRINCIPAL_PREFIX = 'google:';

/**
 * Ensures NFT actions always have a wallet context.
 *
 * Backward compatibility:
 * - Wallet-native users (principal is a wallet address) pass through.
 * - Google users must have metadata.linkedWallet configured.
 */
export const nftWalletLinkGate: RequestHandler = async (_req, res, next) => {
    try {
        const principal = authorizedPk(res);
        if (!principal) {
            res.status(401).send({ error: { message: 'Unauthorized user context.' } });
            return;
        }

        // Existing wallet-native identity continues to work as-is.
        if (!principal.startsWith(GOOGLE_PRINCIPAL_PREFIX)) {
            res.locals.nftWallet = principal;
            next();
            return;
        }

        const user = await prisma.user.findUnique({
            where: { wallet: principal },
            select: { metadata: true }
        });

        const linkedWallet = (user?.metadata as Record<string, unknown> | null)?.linkedWallet;
        if (!linkedWallet || typeof linkedWallet !== 'string') {
            res.status(403).send({
                error: {
                    message: 'Wallet not linked. Please link a Solana wallet before performing NFT actions.'
                }
            });
            return;
        }

        res.locals.nftWallet = linkedWallet;
        next();
    } catch (err) {
        console.error('Error while validating wallet link for NFT action:', err);
        res.status(500).send({ error: { message: 'Internal Server Error' } });
    }
};
