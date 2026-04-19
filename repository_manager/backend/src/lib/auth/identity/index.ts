import { createUser } from '../user/index.js';
import { prisma } from '../../prisma/index.js';

export const GOOGLE_PRINCIPAL_PREFIX = 'google:';
const WALLET_PROVIDER = 'WALLET';
const GOOGLE_PROVIDER = 'GOOGLE';

type AuthIdentityDelegate = {
    findUnique: (args: unknown) => Promise<{ userId: string } | null>;
    findFirst: (args: unknown) => Promise<{ subject: string } | null>;
    create: (args: unknown) => Promise<unknown>;
    upsert: (args: unknown) => Promise<unknown>;
};

const getAuthIdentityDelegate = (): AuthIdentityDelegate | null => {
    const candidate = (prisma as unknown as { authIdentity?: AuthIdentityDelegate }).authIdentity;
    return candidate ?? null;
};

export const isGooglePrincipal = (principal: string): boolean => principal.startsWith(GOOGLE_PRINCIPAL_PREFIX);

export const getGoogleSubject = (principal: string): string => principal.slice(GOOGLE_PRINCIPAL_PREFIX.length);

export async function ensureWalletIdentityForWalletPrincipal(walletPrincipal: string): Promise<void> {
    const user = await prisma.user.findUnique({
        where: { wallet: walletPrincipal },
        select: { id: true }
    }) ?? await createUser(walletPrincipal);

    const authIdentity = getAuthIdentityDelegate();
    if (!authIdentity) return;

    await authIdentity.upsert({
        where: {
            provider_subject: {
                provider: WALLET_PROVIDER,
                subject: walletPrincipal,
            },
        },
        update: {
            userId: user.id,
        },
        create: {
            provider: WALLET_PROVIDER,
            subject: walletPrincipal,
            userId: user.id,
        },
    });
}

export async function getAttachedWalletForGooglePrincipal(principal: string): Promise<string | null> {
    const googleSubject = getGoogleSubject(principal);
    if (!googleSubject) return null;

    const authIdentity = getAuthIdentityDelegate();
    if (!authIdentity) return null;

    const googleIdentity = await authIdentity.findUnique({
        where: {
            provider_subject: {
                provider: GOOGLE_PROVIDER,
                subject: googleSubject,
            },
        },
        select: { userId: true }
    });

    if (!googleIdentity) return null;

    const walletIdentity = await authIdentity.findFirst({
        where: {
            userId: googleIdentity.userId,
            provider: WALLET_PROVIDER,
        },
        select: { subject: true },
        orderBy: { createdAt: 'asc' }
    });

    return walletIdentity?.subject ?? null;
}

export async function resolveUserIdFromPrincipal(principal: string): Promise<string | null> {
    const authIdentity = getAuthIdentityDelegate();
    if (isGooglePrincipal(principal)) {
        if (!authIdentity) return null;
        const googleSubject = getGoogleSubject(principal);
        if (!googleSubject) return null;

        const googleIdentity = await authIdentity.findUnique({
            where: {
                provider_subject: {
                    provider: GOOGLE_PROVIDER,
                    subject: googleSubject,
                },
            },
            select: { userId: true }
        });
        return googleIdentity?.userId ?? null;
    }

    // Wallet principal path: support both identity table and legacy user.wallet.
    if (authIdentity) {
        const walletIdentity = await authIdentity.findUnique({
            where: {
                provider_subject: {
                    provider: WALLET_PROVIDER,
                    subject: principal,
                },
            },
            select: { userId: true }
        });
        if (walletIdentity?.userId) return walletIdentity.userId;
    }

    const user = await prisma.user.findUnique({
        where: { wallet: principal },
        select: { id: true }
    });
    return user?.id ?? null;
}

export async function linkWalletIdentityToUser(userId: string, walletPrincipal: string): Promise<void> {
    const authIdentity = getAuthIdentityDelegate();
    if (!authIdentity) return;

    const existingWalletIdentity = await authIdentity.findUnique({
        where: {
            provider_subject: {
                provider: WALLET_PROVIDER,
                subject: walletPrincipal,
            },
        },
        select: { userId: true }
    });

    if (existingWalletIdentity && existingWalletIdentity.userId !== userId) {
        throw new Error('This wallet is already linked to another account.');
    }

    if (existingWalletIdentity && existingWalletIdentity.userId === userId) {
        return;
    }

    await authIdentity.create({
        data: {
            provider: WALLET_PROVIDER,
            subject: walletPrincipal,
            userId,
        },
    });
}
