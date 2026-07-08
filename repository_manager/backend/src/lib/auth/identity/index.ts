import { createUser } from '../user/index.js';
import { prisma } from '../../prisma/index.js';
import { createHash } from 'crypto';

export const GOOGLE_PRINCIPAL_PREFIX = 'google:';
export const SSH_PRINCIPAL_PREFIX = 'ssh:';
const WALLET_PROVIDER = 'WALLET';
const GOOGLE_PROVIDER = 'GOOGLE';
const SSH_PROVIDER = 'SSH';

type AuthIdentityDelegate = {
    findUnique: (args: unknown) => Promise<{ userId: string; publicKey?: string | null } | null>;
    findFirst: (args: unknown) => Promise<{ subject: string; publicKey?: string | null; userId?: string } | null>;
    findMany: (args: unknown) => Promise<Array<{ id: string; subject: string; publicKey?: string | null; createdAt?: Date; userId?: string }>>;
    create: (args: unknown) => Promise<unknown>;
    upsert: (args: unknown) => Promise<unknown>;
};

const getAuthIdentityDelegate = (): AuthIdentityDelegate | null => {
    const candidate = (prisma as unknown as { authIdentity?: AuthIdentityDelegate }).authIdentity;
    return candidate ?? null;
};

export const isGooglePrincipal = (principal: string): boolean => principal.startsWith(GOOGLE_PRINCIPAL_PREFIX);

export const isSSHPrincipal = (principal: string): boolean => principal.startsWith(SSH_PRINCIPAL_PREFIX);

export const getGoogleSubject = (principal: string): string => principal.slice(GOOGLE_PRINCIPAL_PREFIX.length);

export const getSSHSubject = (principal: string): string => principal.slice(SSH_PRINCIPAL_PREFIX.length);

function decodeOpenSshPublicKey(publicKey: string): Buffer | null {
    const trimmed = publicKey.trim();
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2 || parts[0] !== 'ssh-ed25519') {
        return null;
    }

    try {
        return Buffer.from(parts[1], 'base64');
    } catch {
        return null;
    }
}

export function computeSshFingerprint(publicKey: string): string | null {
    const decoded = decodeOpenSshPublicKey(publicKey);
    if (!decoded) return null;

    const digest = createHash('sha256').update(decoded).digest('base64').replace(/=+$/u, '');
    return `SHA256:${digest}`;
}

export function normalizeSshPublicKey(publicKey: string): string | null {
    const trimmed = publicKey.trim();
    return trimmed.startsWith('ssh-ed25519 ') ? trimmed : null;
}

export function normalizeSshPrincipal(publicKey: string): string | null {
    const fingerprint = computeSshFingerprint(publicKey);
    return fingerprint ? `${SSH_PRINCIPAL_PREFIX}${fingerprint}` : null;
}

type GoogleIdentityProfile = {
    email?: string;
    name?: string;
    picture?: string;
};

export async function ensureGoogleIdentityForSubject(googleSubject: string, profile?: GoogleIdentityProfile): Promise<{ principal: string; userId: string }> {
    const principal = `${GOOGLE_PRINCIPAL_PREFIX}${googleSubject}`;

    const user = await prisma.user.findUnique({
        where: { principal },
        select: { id: true }
    }) ?? await prisma.user.create({
        data: {
            principal,
            metadata: {
                set: {
                    email: profile?.email,
                    name: profile?.name,
                    profileImage: profile?.picture,
                }
            }
        },
        select: { id: true }
    });

    const authIdentity = getAuthIdentityDelegate();
    if (authIdentity) {
        await authIdentity.upsert({
            where: {
                provider_subject: {
                    provider: GOOGLE_PROVIDER,
                    subject: googleSubject,
                },
            },
            update: {
                userId: user.id,
            },
            create: {
                provider: GOOGLE_PROVIDER,
                subject: googleSubject,
                userId: user.id,
            },
        });
    }

    return { principal, userId: user.id };
}

export async function ensureWalletIdentityForWalletPrincipal(walletPrincipal: string): Promise<void> {
    const user = await prisma.user.findUnique({
        where: { principal: walletPrincipal },
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

export async function ensureSSHIdentityForPublicKey(publicKey: string, profile?: { name?: string }): Promise<{ principal: string; userId: string }> {
    const normalizedPublicKey = normalizeSshPublicKey(publicKey);
    const principal = normalizedPublicKey ? normalizeSshPrincipal(normalizedPublicKey) : null;
    if (!principal) {
        throw new Error('Invalid SSH public key. Expected an ssh-ed25519 OpenSSH public key.');
    }

    const user = await prisma.user.findUnique({
        where: { principal },
        select: { id: true }
    }) ?? await prisma.user.create({
        data: {
            principal,
            metadata: {
                set: {
                    name: profile?.name,
                }
            }
        },
        select: { id: true }
    });

    const authIdentity = getAuthIdentityDelegate();
    if (!authIdentity) {
        return { principal, userId: user.id };
    }

    const fingerprint = getSSHSubject(principal);
    await authIdentity.upsert({
        where: {
            provider_subject: {
                provider: SSH_PROVIDER,
                subject: fingerprint,
            },
        },
        update: {
            userId: user.id,
            publicKey,
        },
        create: {
            provider: SSH_PROVIDER,
            subject: fingerprint,
            publicKey: normalizedPublicKey,
            userId: user.id,
        },
    });

    return { principal, userId: user.id };
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

    if (isSSHPrincipal(principal)) {
        if (!authIdentity) return null;
        const sshSubject = getSSHSubject(principal);
        if (!sshSubject) return null;

        const sshIdentity = await authIdentity.findUnique({
            where: {
                provider_subject: {
                    provider: SSH_PROVIDER,
                    subject: sshSubject,
                },
            },
            select: { userId: true }
        });
        return sshIdentity?.userId ?? null;
    }

    // Wallet principal path: support both identity table and legacy user.principal.
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
        where: { principal },
        select: { id: true }
    });
    return user?.id ?? null;
}

export async function getSSHIdentityForPrincipal(principal: string): Promise<{ userId: string; publicKey: string } | null> {
    if (!isSSHPrincipal(principal)) return null;

    const authIdentity = getAuthIdentityDelegate();
    if (!authIdentity) return null;

    const sshIdentity = await authIdentity.findUnique({
        where: {
            provider_subject: {
                provider: SSH_PROVIDER,
                subject: getSSHSubject(principal),
            },
        },
        select: { userId: true, publicKey: true }
    });

    if (!sshIdentity?.publicKey) return null;
    return { userId: sshIdentity.userId, publicKey: sshIdentity.publicKey };
}

export async function getSSHIdentityForUserAndFingerprint(userId: string, fingerprint: string): Promise<{ id: string; publicKey: string; subject: string } | null> {
    const authIdentity = getAuthIdentityDelegate();
    if (!authIdentity) return null;

    const sshIdentity = await authIdentity.findUnique({
        where: {
            provider_subject: {
                provider: SSH_PROVIDER,
                subject: fingerprint,
            },
        },
        select: { id: true, userId: true, publicKey: true, subject: true }
    });

    if (!sshIdentity || sshIdentity.userId !== userId || !sshIdentity.publicKey) return null;
    return { id: sshIdentity.id, publicKey: sshIdentity.publicKey, subject: sshIdentity.subject };
}

export async function listSSHIdentitiesForUser(userId: string): Promise<Array<{ id: string; fingerprint: string; publicKey: string; createdAt?: Date }>> {
    const authIdentity = getAuthIdentityDelegate();
    if (!authIdentity) return [];

    const identities = await authIdentity.findMany({
        where: { userId, provider: SSH_PROVIDER },
        select: { id: true, subject: true, publicKey: true, createdAt: true },
        orderBy: { createdAt: 'asc' }
    });

    return identities
        .filter((identity) => Boolean(identity.publicKey))
        .map((identity) => ({
            id: identity.id,
            fingerprint: identity.subject,
            publicKey: identity.publicKey as string,
            createdAt: identity.createdAt,
        }));
}

export async function upsertSSHIdentityForUser(userId: string, publicKey: string): Promise<{ id: string; fingerprint: string; publicKey: string }> {
    const normalizedPublicKey = normalizeSshPublicKey(publicKey);
    if (!normalizedPublicKey) {
        throw new Error('Invalid SSH public key. Expected an ssh-ed25519 OpenSSH public key.');
    }

    const fingerprint = computeSshFingerprint(normalizedPublicKey);
    if (!fingerprint) {
        throw new Error('Could not compute SSH key fingerprint.');
    }

    const authIdentity = getAuthIdentityDelegate();
    if (!authIdentity) {
        throw new Error('SSH identity storage is not available.');
    }

    const existingSSHIdentity = await authIdentity.findUnique({
        where: {
            provider_subject: {
                provider: SSH_PROVIDER,
                subject: fingerprint,
            },
        },
        select: { id: true, userId: true, publicKey: true, subject: true }
    });

    if (existingSSHIdentity && existingSSHIdentity.userId !== userId) {
        throw new Error('This SSH key is already linked to another account.');
    }

    const savedIdentity = existingSSHIdentity
        ? await authIdentity.upsert({
            where: {
                provider_subject: {
                    provider: SSH_PROVIDER,
                    subject: fingerprint,
                },
            },
            update: {
                userId,
                publicKey: normalizedPublicKey,
            },
            create: {
                provider: SSH_PROVIDER,
                subject: fingerprint,
                publicKey: normalizedPublicKey,
                userId,
            },
        }) as { id: string; subject: string; publicKey: string }
        : await authIdentity.create({
            data: {
                provider: SSH_PROVIDER,
                subject: fingerprint,
                publicKey: normalizedPublicKey,
                userId,
            },
        }) as { id: string; subject: string; publicKey: string };

    return { id: savedIdentity.id, fingerprint, publicKey: normalizedPublicKey };
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

export async function linkSSHIdentityToUser(userId: string, publicKey: string): Promise<{ principal: string }> {
    const normalizedPublicKey = normalizeSshPublicKey(publicKey);
    const principal = normalizedPublicKey ? normalizeSshPrincipal(normalizedPublicKey) : null;
    if (!principal) {
        throw new Error('Invalid SSH public key. Expected an ssh-ed25519 OpenSSH public key.');
    }

    const authIdentity = getAuthIdentityDelegate();
    if (!authIdentity) {
        return { principal };
    }

    const sshSubject = getSSHSubject(principal);
    const existingSSHIdentity = await authIdentity.findUnique({
        where: {
            provider_subject: {
                provider: SSH_PROVIDER,
                subject: sshSubject,
            },
        },
        select: { userId: true }
    });

    if (existingSSHIdentity && existingSSHIdentity.userId !== userId) {
        throw new Error('This SSH key is already linked to another account.');
    }

    if (existingSSHIdentity && existingSSHIdentity.userId === userId) {
        return { principal };
    }

    await authIdentity.create({
        data: {
            provider: SSH_PROVIDER,
            subject: sshSubject,
            publicKey,
            userId,
        },
    });

    return { principal };
}
