// cleanup job to remove expired sessions and blocks
// Debashish Buragohain

import { prisma } from '../lib/prisma/index.js';
import cron from 'node-cron';
import config from '../../config.js';
import storageProvider from '../lib/storage/index.js';

const cleanupIntervalMinutes = config.cleanup.intervalMinutes || 10;

export function startCleanupJob() {

    console.log(`Background cleanup job started (runs every ${cleanupIntervalMinutes} minutes)`);
    // Run every 10 minutes
    cron.schedule(`*/${cleanupIntervalMinutes} * * * *`, async () => {
        console.log('Running session cleanup job...');
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

        try {
            // Find orphaned sessions with uploaded ZKML that were never finalized
            const orphanedSessions = await prisma.commitCreationSession.findMany({
                where: {
                    status: 'ZKML_UPLOADED',
                    consumed: false,
                    OR: [
                        { expiresAt: { lt: now } },
                        { lastErrorAt: { lt: oneHourAgo } }
                    ],
                    zkmlProofIpfsId: { not: null }
                }
            });

            // Cleanup orphaned ZKML files
            let zkmlCleanupCount = 0;
            for (const session of orphanedSessions) {
                try {
                    const [proofObj, settingsObj, vkObj] = await Promise.all([
                        prisma.ipfsObject.findUnique({ where: { id: session.zkmlProofIpfsId! } }),
                        prisma.ipfsObject.findUnique({ where: { id: session.zkmlSettingsIpfsId! } }),
                        prisma.ipfsObject.findUnique({ where: { id: session.zkmlVkIpfsId! } })
                    ]);

                    if (proofObj && settingsObj && vkObj) {
                        await Promise.all([
                            storageProvider.remove(proofObj.cid),
                            storageProvider.remove(settingsObj.cid),
                            storageProvider.remove(vkObj.cid),
                            prisma.ipfsObject.delete({ where: { id: proofObj.id } }).catch(() => {}),
                            prisma.ipfsObject.delete({ where: { id: settingsObj.id } }).catch(() => {}),
                            prisma.ipfsObject.delete({ where: { id: vkObj.id } }).catch(() => {})
                        ]);
                        zkmlCleanupCount++;
                        console.log(`Cleaned up orphaned ZKML for session ${session.id}`);
                    }
                } catch (err) {
                    console.error(`Error cleaning session ${session.id}:`, err);
                }
            }

            // Delete expired/consumed sessions
            const deletedSessions = await prisma.commitCreationSession.deleteMany({
                where: {
                    OR: [
                        { expiresAt: { lt: now } },
                        { consumed: true, createdAt: { lt: oneHourAgo } },
                        { status: 'ERROR', lastErrorAt: { lt: oneHourAgo } }
                    ]
                }
            });

            // Delete expired blocks
            const deletedBlocks = await prisma.initiationBlock.deleteMany({
                where: { blockedUntil: { lt: now } }
            });

            console.log(`Cleanup complete: ${deletedSessions.count} sessions, ${deletedBlocks.count} blocks, ${zkmlCleanupCount} orphaned ZKML removed`);
        } catch (err) {
            console.error('Cleanup job error:', err);
        }
    });
}