import { Request, Response } from 'express';
import { prisma } from '../lib/prisma/index.js';
import { authorizedPk } from '../middleware/auth/authHandler.js';
import storageProvider from '../lib/storage/index.js';
import { constructIPFSUrl } from '../lib/ipfs/ipfs.js';
import jwt from 'jsonwebtoken';
import config from '../../config.js';
import path from 'path';
import fs from 'fs';
import { v4 as uuidV4 } from 'uuid';
import { ZKMLProofCreateObj } from '../lib/types/zkmlproof.js';
import { convertCommitToNft } from '../lib/nft/nft.js';
import { umi } from '../lib/nft/umi.js';

const ZKP_JWT_SECRET = process.env.ZKP_JWT_SECRET || 'super-secret-commit-generation';
const COMMIT_JWT_SECRET = process.env.COMMIT_JWT_SECRET || 'another-super-secret-commit-generation';
const SESSION_EXPIRY_MINUTES = config.commit.session.expiryMinutes || 10;
const BLOCK_DURATION_MINUTES = config.commit.session.blockDurationMinutes || 2;
const GENESIS_COMMIT_HASH = config.commit.genesis.hash || '_GENESIS_COMMIT_';

// Helper: Block user for 2 minutes
async function blockUser(pk: string) {
    const blockedUntil = new Date(Date.now() + BLOCK_DURATION_MINUTES * 60 * 1000);
    await prisma.initiationBlock.upsert({
        where: { pk },
        update: { blockedUntil },
        create: { pk, blockedUntil }
    });
}

// Helper: Record session error and block user
async function recordSessionError(sessionId: string, pk: string) {
    await prisma.commitCreationSession.update({
        where: { id: sessionId },
        data: {
            status: 'ERROR',
            lastErrorAt: new Date(),
            errorCount: { increment: 1 }
        }
    });
    await blockUser(pk);
}

export const getAllCommits = async (req: Request, res: Response) => {
    const { branchId } = req;
    try {
        const commits = await prisma.commit.findMany({ where: { branchId } });
        res.status(200).json({ data: commits });
        return;
    } catch (err) {
        console.error('Error retrieving commits:', err);
        res.status(500).send({ error: { message: 'Internal Server Error' } });
        return;
    }
};

export const getCommitForPull = async (req: Request, res: Response) => {
    const { commitHash } = req.params;
    try {
        const commit = await prisma.commit.findFirst({
            where: { commitHash },
            include: {
                branch: true,
                committer: true,
                params: {
                    include: {
                        ipfsObject: true,
                        ZKMLProof: {
                            include: {
                                proof: true,
                                settings: true,
                                verification_key: true
                            }
                        }
                    }
                },
                nft: {
                    include: {
                        collection: true
                    }
                },
            }
        });
        if (!commit) {
            res.status(404).send({ error: { message: 'Commit not found.' } });
            return;
        }
        res.status(200).json({ data: commit });
    } catch (err) {
        console.error('Error retrieving commit:', err);
        res.status(500).send({ error: { message: 'Internal Server Error' } });
    }
};

export const getCommitByHash = async (req: Request, res: Response) => {
    const { commitHash } = req.params;
    try {
        const commit = await prisma.commit.findFirst({
            where: { commitHash }
        });
        if (!commit) {
            res.status(404).send({ error: { message: 'Commit not found.' } });
            return;
        }
        res.status(200).json({ data: commit });
    } catch (err) {
        console.error('Error retrieving commit:', err);
        res.status(500).send({ error: { message: 'Internal Server Error' } });
    }
};

export const getLatestCommit = async (req: Request, res: Response) => {
    try {
        const { branchId } = req;
        const latestCommit = await prisma.commit.findFirst({
            where: { branchId },
            orderBy: { createdAt: 'desc' },
            include: {
                branch: true,
                committer: true,
                params: {
                    include: {
                        ipfsObject: true,
                        ZKMLProof: {
                            include: {
                                proof: true,
                                settings: true,
                                verification_key: true
                            }
                        }
                    }
                },
                nft: {
                    include: {
                        collection: true
                    }
                },
            }
        });
        if (!latestCommit) {
            res.status(404).send({ error: { message: 'No commits found.' } });
            return;
        }
        res.status(200).json({ data: latestCommit });
    } catch (err) {
        console.error('Error retrieving the latest commit:', err);
        res.status(500).send({ error: { message: 'Internal Server Error' } });
    }
};


export const initiateCommitSession = async (req: Request, res: Response) => {
    try {
        const pk = authorizedPk(res);
        const { repoId, branchId } = req;
        const { parentCommitHash: parentCommitHashInput } = req.body;

        const block = await prisma.initiationBlock.findUnique({ where: { pk } });
        if (block && block.blockedUntil > new Date()) {
            const remainingSeconds = Math.ceil((block.blockedUntil.getTime() - Date.now()) / 1000);
            res.status(403).json({
                error: { message: `Initiation blocked. Please try again in ${remainingSeconds} seconds.` }
            });
            return;
        }

        if (!repoId) {
            res.status(400).json({ error: { message: 'Repository ID is required.' } });
            return;
        }

        const repo = await prisma.repository.findUnique({ where: { id: repoId } });
        if (!repo) {
            res.status(404).json({ error: { message: 'Repository not found.' } });
            return;
        }
        if (repo.ownerAddress !== pk && !repo.writeAccessIds.includes(pk)) {
            res.status(403).json({ error: { message: 'Unauthorized. You do not have write access to this repository.' } });
            return;
        }

        if (!branchId) {
            res.status(400).json({ error: { message: 'Branch ID is required.' } });
            return;
        }

        const branch = await prisma.branch.findUnique({ where: { id: branchId } });
        if (!branch) {
            res.status(404).json({ error: { message: 'Branch not found.' } });
            return;
        }

        // Determine parent commit hash
        const parentCommitHashTrimmed = (parentCommitHashInput as string | undefined)?.trim();
        let parentCommitHash: string;
        
        if (parentCommitHashTrimmed && parentCommitHashTrimmed.length > 0) {
            parentCommitHash = parentCommitHashTrimmed;
        } else {
            // Default to latest commit in branch, or genesis if none exist
            const latestCommit = await prisma.commit.findFirst({
                where: { branchId, isDeleted: false },
                orderBy: { createdAt: 'desc' }
            });
            parentCommitHash = latestCommit ? latestCommit.commitHash : GENESIS_COMMIT_HASH;
        }

        // Ensure parent commit exists in this branch (unless genesis)
        if (parentCommitHash !== GENESIS_COMMIT_HASH) {
            const parentCommit = await prisma.commit.findFirst({
                where: { commitHash: parentCommitHash, branchId }
            });
            if (!parentCommit) {
                res.status(404).json({ error: { message: 'Parent commit not found in this branch.' } });
                return;
            }
        }

        // Check for existing children of the parent in this branch
        const existingChildren = await prisma.commit.count({
            where: { branchId, previousCommitHash: parentCommitHash }
        });

        if (existingChildren > 0) {
            // Parent already has a child - check repository commit policy
            if (repo.commitPolicy === 'SERIAL') {
                res.status(409).json({
                    error: {
                        message: 'Parent commit already has a child. Repository policy is SERIAL - cannot create conflicting commit.',
                        code: 'SERIAL_CONFLICT'
                    }
                });
                return;
            }
            // If policy is FORK or MERGE, allow initiation (fork will be created during finalize)
        }

        const jti = uuidV4();
        const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MINUTES * 60 * 1000);
        const session = await prisma.commitCreationSession.create({
            data: {
                jti,
                pk,
                repoId: repoId!,
                branchId: branchId!,
                expiresAt,
                status: 'INITIATED'
            }
        });

        const initiateToken = jwt.sign({
            type: 'commit_initiate',
            sessionId: session.id,
            jti,
            pk,
            repoId: repoId!,
            branchId: branchId!,
            parentCommitHash
        }, COMMIT_JWT_SECRET, { expiresIn: `${SESSION_EXPIRY_MINUTES}m` });

        res.status(200).json({
            sessionId: session.id,
            initiateToken,
            expiresAt: expiresAt.toISOString()
        });

    } catch (err) {
        console.error('Error initiating commit session:', err);
        res.status(500).send({ error: { message: 'Internal Server Error' } });
    }
};

export const checkZKMLProof = async (req: Request, res: Response) => {
    try {
        const pk = authorizedPk(res);
        const { sessionId, initiateToken, proofCid, settingsCid, vkCid } = req.body;

        if (!sessionId || !initiateToken || !proofCid || !settingsCid || !vkCid) {
            res.status(400).json({ error: { message: 'All fields (sessionId, initiateToken, proofCid, settingsCid, vkCid) are required.' } });
            return;
        }

        let decoded: any;
        try {
            decoded = jwt.verify(initiateToken, COMMIT_JWT_SECRET);
        } catch (err) {
            res.status(403).json({ error: { message: 'Invalid or expired initiate token.' } });
            return;
        }

        if (decoded.type !== 'commit_initiate' || decoded.sessionId !== sessionId || decoded.pk !== pk) {
            res.status(403).json({ error: { message: 'Token mismatch or unauthorized.' } });
            return;
        }

        const session = await prisma.commitCreationSession.findUnique({ where: { id: sessionId } });
        if (!session || session.consumed || session.status !== 'INITIATED' || (session.expiresAt && session.expiresAt < new Date())) {
            await blockUser(pk);
            res.status(403).json({ error: { message: 'Invalid or expired session.' } });
            return;
        }

        const existingProof = await prisma.zKMLProof.findFirst({
            where: {
                proof: { cid: proofCid },
                settings: { cid: settingsCid },
                verification_key: { cid: vkCid }
            }
        });

        if (existingProof) {
            await recordSessionError(sessionId, pk);
            res.status(409).json({ error: { message: 'ZKML proof already exists. Cannot commit duplicate proofs.' } });
            return;
        }

        await prisma.commitCreationSession.update({
            where: { id: sessionId },
            data: { status: 'ZKML_VERIFIED' }
        });

        const zkmlToken = jwt.sign({
            type: 'commit_zkml',
            sessionId,
            allowedCids: { proofCid, settingsCid, vkCid },
            pk
        }, ZKP_JWT_SECRET, { expiresIn: `${SESSION_EXPIRY_MINUTES}m` });

        res.status(200).json({
            zkmlToken,
            expiresAt: new Date(Date.now() + SESSION_EXPIRY_MINUTES * 60 * 1000).toISOString()
        });

    } catch (err) {
        console.error('Error checking ZKML:', err);
        res.status(500).send({ error: { message: 'Internal Server Error' } });
    }
};

export const uploadZKMLProofs = async (req: Request, res: Response) => {
    try {
        const pk = authorizedPk(res);
        const { sessionId, initiateToken, zkmlToken } = req.body;
        const files = req.files as { [fieldname: string]: Express.Multer.File[] };

        if (!sessionId || !initiateToken || !zkmlToken) {
            res.status(400).json({
                error: { message: 'All fields (sessionId, initiateToken, zkmlToken) are required.' }
            });
            return;
        }

        if (!files || !files.proof || !files.settings || !files.verification_key) {
            res.status(400).json({
                error: { message: 'All three files (proof, settings, verification_key) must be uploaded.' }
            });
            return;
        }

        const proofFile = files.proof[0];
        const settingsFile = files.settings[0];
        const vkFile = files.verification_key[0];

        if (!proofFile || !settingsFile || !vkFile) {
            res.status(400).json({
                error: { message: 'One or more ZKML files are missing.' }
            });
            return;
        }

        let sessionJwt: any;
        try {
            sessionJwt = jwt.verify(initiateToken, COMMIT_JWT_SECRET);
        } catch {
            res.status(403).json({ error: { message: 'Invalid or expired initiateToken.' } });
            return;
        }

        if (sessionJwt.type !== 'commit_initiate' || sessionJwt.sessionId !== sessionId || sessionJwt.pk !== pk) {
            res.status(403).json({ error: { message: 'Initiate token mismatch or unauthorized.' } });
            return;
        }

        let zkmlJwt: any;
        try {
            zkmlJwt = jwt.verify(zkmlToken, ZKP_JWT_SECRET);
        } catch {
            res.status(403).json({ error: { message: 'Invalid or expired zkmlToken.' } });
            return;
        }

        if (zkmlJwt.type !== 'commit_zkml' || zkmlJwt.sessionId !== sessionId || zkmlJwt.pk !== pk) {
            await recordSessionError(sessionId, pk);
            res.status(403).json({ error: { message: 'ZKML token mismatch or unauthorized.' } });
            return;
        }

        const session = await prisma.commitCreationSession.findUnique({ where: { id: sessionId } });
        if (!session || session.consumed || session.status !== 'ZKML_VERIFIED' || (session.expiresAt && session.expiresAt < new Date())) {
            await recordSessionError(sessionId, pk);
            res.status(403).json({ error: { message: 'Invalid or expired session.' } });
            return;
        }

        // Upload binary files to IPFS
        const proofPath = path.join(proofFile.destination, proofFile.filename);
        const settingsPath = path.join(settingsFile.destination, settingsFile.filename);
        const vkPath = path.join(vkFile.destination, vkFile.filename);

        const proofUpload = await storageProvider.add(proofPath, { pin: true });
        const settingsUpload = await storageProvider.add(settingsPath, { pin: true });
        const vkUpload = await storageProvider.add(vkPath, { pin: true });

        const allowed = zkmlJwt.allowedCids || {};
        if (proofUpload.cid.toString() !== allowed.proofCid ||
            settingsUpload.cid.toString() !== allowed.settingsCid ||
            vkUpload.cid.toString() !== allowed.vkCid) {
            await recordSessionError(sessionId, pk);
            res.status(403).json({
                error: { message: 'Security Mismatch: Uploaded ZKML files do not match the CIDs authorized in the token.' }
            });
            return;
        }

        const proofIpfs = await prisma.ipfsObject.upsert({
            where: { cid: proofUpload.cid.toString() },
            update: {},
            create: {
                cid: proofUpload.cid.toString(),
                uri: constructIPFSUrl(proofUpload.cid),
                extension: 'zlib',
                size: proofUpload.size || proofFile.size || 0
            }
        });

        const settingsIpfs = await prisma.ipfsObject.upsert({
            where: { cid: settingsUpload.cid.toString() },
            update: {},
            create: {
                cid: settingsUpload.cid.toString(),
                uri: constructIPFSUrl(settingsUpload.cid),
                extension: 'zlib',
                size: settingsUpload.size || settingsFile.size || 0
            }
        });

        const vkIpfs = await prisma.ipfsObject.upsert({
            where: { cid: vkUpload.cid.toString() },
            update: {},
            create: {
                cid: vkUpload.cid.toString(),
                uri: constructIPFSUrl(vkUpload.cid),
                extension: 'zlib',
                size: vkUpload.size || vkFile.size || 0
            }
        });

        const existingProof = await prisma.zKMLProof.findFirst({
            where: {
                proofIpfsId: proofIpfs.id,
                settingsIpfsId: settingsIpfs.id,
                verificationKeyIpfsId: vkIpfs.id
            }
        });

        if (existingProof) {
            await recordSessionError(sessionId, pk);
            res.status(409).json({ error: { message: 'ZKML proof already exists.' } });
            return;
        }

        await prisma.commitCreationSession.update({
            where: { id: sessionId },
            data: {
                status: 'ZKML_UPLOADED',
                zkmlProofIpfsId: proofIpfs.id,
                zkmlSettingsIpfsId: settingsIpfs.id,
                zkmlVkIpfsId: vkIpfs.id
            }
        });

        const zkmlReceiptToken = jwt.sign({
            type: 'commit_zkml_receipt',
            sessionId,
            pk,
            repoId: sessionJwt.repoId,
            branchId: sessionJwt.branchId,
            proofIpfsId: proofIpfs.id,
            settingsIpfsId: settingsIpfs.id,
            vkIpfsId: vkIpfs.id
        }, ZKP_JWT_SECRET, { expiresIn: `${SESSION_EXPIRY_MINUTES}m` });

        // Cleanup uploaded files from local storage
        try {
            fs.unlinkSync(proofPath);
            fs.unlinkSync(settingsPath);
            fs.unlinkSync(vkPath);
        } catch (cleanupErr) {
            console.error('Error cleaning up ZKML files:', cleanupErr);
        }

        res.status(200).json({
            success: true,
            message: 'ZKML files uploaded successfully. Proceed to finalize.',
            zkmlReceiptToken,
            proofCid: proofIpfs.cid,
            settingsCid: settingsIpfs.cid,
            vkCid: vkIpfs.cid
        });

    } catch (err) {
        console.error('Error uploading ZKML params:', err);
        res.status(500).send({ error: { message: 'Internal Server Error' } });
    }
};

export const uploadParameters = async (req: Request, res: Response) => {
    let paramsCid: string | null = null;
    try {
        const pk = authorizedPk(res);
        const { sessionId, initiateToken, zkmlReceiptToken } = req.body;

        if (!sessionId || !initiateToken || !zkmlReceiptToken) {
            res.status(400).json({
                error: { message: 'All fields (sessionId, initiateToken, zkmlReceiptToken) are required.' }
            });
            return;
        }

        if (!req.file) {
            res.status(400).json({ error: { message: 'No parameters file uploaded.' } });
            return;
        }

        let sessionJwt: any;
        try {
            sessionJwt = jwt.verify(initiateToken, COMMIT_JWT_SECRET);
        } catch {
            res.status(403).json({ error: { message: 'Invalid or expired initiateToken.' } });
            return;
        }

        if (sessionJwt.type !== 'commit_initiate' || sessionJwt.sessionId !== sessionId || sessionJwt.pk !== pk) {
            res.status(403).json({ error: { message: 'Initiate token mismatch or unauthorized.' } });
            return;
        }

        let receiptJwt: any;
        try {
            receiptJwt = jwt.verify(zkmlReceiptToken, ZKP_JWT_SECRET);
        } catch {
            res.status(403).json({ error: { message: 'Invalid or expired zkmlReceiptToken.' } });
            return;
        }

        if (receiptJwt.type !== 'commit_zkml_receipt' || receiptJwt.sessionId !== sessionId || receiptJwt.pk !== pk) {
            res.status(403).json({ error: { message: 'ZKML receipt mismatch or unauthorized.' } });
            return;
        }

        const session = await prisma.commitCreationSession.findUnique({ where: { id: sessionId } });
        if (!session || session.consumed || session.status !== 'ZKML_UPLOADED' || (session.expiresAt && session.expiresAt < new Date())) {
            await recordSessionError(sessionId, pk);
            res.status(403).json({ error: { message: 'Invalid or expired session. Expected ZKML_UPLOADED status.' } });
            return;
        }

        if (session.paramsIpfsId) {
            res.status(409).json({ error: { message: 'Parameters already uploaded for this commit. Cannot upload multiple parameter sets.' } });
            return;
        }

        const paramsPath = path.join(req.file.destination, req.file.filename);
        if (!fs.existsSync(paramsPath)) {
            console.error('Error: Params file does not exist for uploading to IPFS.');
            res.status(500).json({ error: { message: 'Internal Server Error: File not found.' } });
            return;
        }

        const fileSize = req.file.size;
        if (!fileSize) {
            res.status(400).json({ error: { message: 'Invalid file size.' } });
            return;
        }

        const paramsUploadRes = await storageProvider.add(paramsPath, { pin: true });
        paramsCid = paramsUploadRes?.cid?.toString();

        if (!paramsCid) {
            res.status(500).json({ error: { message: 'Could not upload parameters to IPFS.' } });
            return;
        }

        const paramsIpfs = await prisma.ipfsObject.upsert({
            where: { cid: paramsCid },
            update: {},
            create: {
                cid: paramsCid,
                uri: constructIPFSUrl(paramsCid),
                extension: req.fileExtension || 'bin',
                size: fileSize
            }
        });

        await prisma.commitCreationSession.update({
            where: { id: sessionId },
            data: {
                status: 'PARAMS_UPLOADED',
                paramsIpfsId: paramsIpfs.id
            }
        });

        const paramsReceiptToken = jwt.sign({
            type: 'commit_params_receipt',
            sessionId,
            pk,
            repoId: sessionJwt.repoId,
            branchId: sessionJwt.branchId,
            paramsIpfsId: paramsIpfs.id
        }, ZKP_JWT_SECRET, { expiresIn: `${SESSION_EXPIRY_MINUTES}m` });

        res.status(200).json({
            success: true,
            message: 'Parameters uploaded successfully. Proceed to finalize.',
            paramsReceiptToken,
            paramsCid: paramsIpfs.cid,
            paramsIpfsId: paramsIpfs.id
        });

    } catch (err) {
        console.error('Error uploading parameters:', err);

        if (paramsCid) {
            try {
                console.log('Cleaning up orphaned parameters file from IPFS...');
                await storageProvider.remove(paramsCid);
                console.log('Successfully removed orphaned parameters file.');
            } catch (cleanupErr) {
                console.error('Error cleaning up parameters file from IPFS:', cleanupErr);
            }
        }

        res.status(500).json({ error: { message: 'Internal Server Error' } });
    }
};

export const finalizeCommit = async (req: Request, res: Response) => {
    let sessionId: string | undefined;
    let zkmlCids: { proofCid: string; settingsCid: string; vkCid: string } | null = null;
    let paramsCid: string | null = null;

    try {
        const pk = authorizedPk(res);
        const { branchId, repoId } = req;
        const {
            message,
            commitHash,         // commit hash will be created in the cli now
            paramHash,
            architecture,
            metrics,
            initiateToken,
            zkmlReceiptToken,
            paramsReceiptToken
        } = req.body;

        if (!initiateToken) {
            res.status(401).json({ error: { message: 'Missing initiateToken. Call /create/initiate first.' } });
            return;
        }

        let sessionJwt: any;
        try {
            sessionJwt = jwt.verify(initiateToken, COMMIT_JWT_SECRET);
        } catch {
            res.status(403).json({ error: { message: 'Invalid or expired initiateToken.' } });
            return;
        }

        if (sessionJwt.pk !== pk || sessionJwt.repoId !== repoId || sessionJwt.branchId !== branchId) {
            res.status(403).json({ error: { message: 'Initiate token does not match user/repo/branch.' } });
            return;
        }

        sessionId = sessionJwt.sessionId as string;

        if (!zkmlReceiptToken) {
            res.status(400).json({ error: { message: 'Missing zkmlReceiptToken. Upload ZKML proofs before finalizing.' } });
            return;
        }

        let zkmlReceiptJwt: any;
        try {
            zkmlReceiptJwt = jwt.verify(zkmlReceiptToken, ZKP_JWT_SECRET);
        } catch {
            res.status(403).json({ error: { message: 'Invalid or expired zkmlReceiptToken.' } });
            return;
        }

        if (zkmlReceiptJwt.type !== 'commit_zkml_receipt' || zkmlReceiptJwt.sessionId !== sessionId || zkmlReceiptJwt.pk !== pk || zkmlReceiptJwt.repoId !== repoId || zkmlReceiptJwt.branchId !== branchId) {
            res.status(403).json({ error: { message: 'ZKML receipt does not match current session/context.' } });
            return;
        }

        if (!paramsReceiptToken) {
            res.status(400).json({ error: { message: 'Missing paramsReceiptToken. Upload parameters before finalizing.' } });
            return;
        }

        let paramsReceiptJwt: any;
        try {
            paramsReceiptJwt = jwt.verify(paramsReceiptToken, ZKP_JWT_SECRET);
        } catch {
            res.status(403).json({ error: { message: 'Invalid or expired paramsReceiptToken.' } });
            return;
        }

        if (paramsReceiptJwt.type !== 'commit_params_receipt' || paramsReceiptJwt.sessionId !== sessionId || paramsReceiptJwt.pk !== pk || paramsReceiptJwt.repoId !== repoId || paramsReceiptJwt.branchId !== branchId) {
            res.status(403).json({ error: { message: 'Params receipt does not match current session/context.' } });
            return;
        }

        const zkmlRelationInput: ZKMLProofCreateObj | undefined = {
            create: {
                proofIpfsId: zkmlReceiptJwt.proofIpfsId,
                settingsIpfsId: zkmlReceiptJwt.settingsIpfsId,
                verificationKeyIpfsId: zkmlReceiptJwt.vkIpfsId
            }
        };

        try {
            const [proofObj, settingsObj, vkObj] = await Promise.all([
                prisma.ipfsObject.findUnique({ where: { id: zkmlReceiptJwt.proofIpfsId } }),
                prisma.ipfsObject.findUnique({ where: { id: zkmlReceiptJwt.settingsIpfsId } }),
                prisma.ipfsObject.findUnique({ where: { id: zkmlReceiptJwt.vkIpfsId } })
            ]);

            if (proofObj && settingsObj && vkObj) {
                zkmlCids = {
                    proofCid: proofObj.cid,
                    settingsCid: settingsObj.cid,
                    vkCid: vkObj.cid
                };
            }

            const paramsObj = await prisma.ipfsObject.findUnique({ where: { id: paramsReceiptJwt.paramsIpfsId } });
            if (paramsObj) {
                paramsCid = paramsObj.cid;
            }
        } catch (err) {
            console.error('Error fetching CIDs for cleanup tracking:', err);
        }

        const session = await prisma.commitCreationSession.findUnique({ where: { id: sessionId } });
        if (!session || session.consumed || session.status !== 'PARAMS_UPLOADED' || (session.expiresAt && session.expiresAt < new Date())) {
            await recordSessionError(sessionId, pk);
            res.status(403).json({ error: { message: 'Invalid or expired session. Expected PARAMS_UPLOADED status.' } });
            return;
        }

        const repo = await prisma.repository.findUnique({ where: { id: repoId }, include: { baseModel: true } });
        if (!repo?.baseModelId) {
            res.status(400).json({ error: { message: 'Base model not uploaded. Cannot create commit.' } });
            return;
        }

        if (!message) {
            res.status(400).json({ error: { message: 'Commit message is required.' } });
            return;
        }

        if (!branchId) {
            throw new Error('Critical Error: branchId not attached to response.');
        }

        if (!paramHash || !architecture) {
            res.status(400).json({ error: { message: 'paramHash and architecture are required.' } });
            return;
        }

        if (!commitHash) {
            res.status(400).json({ error: { message: 'commitHash is required.' } });
            return;
        }

        // Validate commitHash is a valid UUIDv4
        const uuidv4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidv4Regex.test(commitHash)) {
            res.status(400).json({ error: { message: 'commitHash must be a valid UUIDv4 format.' } });
            return;
        }

        const commitTypeRaw = (req.body?.commitType as string | undefined)?.toUpperCase();
        const commitType = commitTypeRaw === 'CHECKPOINT' ? 'CHECKPOINT' : 'DELTA';

        const committer = await prisma.user.findFirst({ where: { wallet: pk } });
        if (!committer) {
            res.status(401).json({ error: { message: 'User not found.' } });
            return;
        }

        const branch = await prisma.branch.findFirst({ where: { id: branchId }, include: { repository: true } });
        if (!branch) {
            res.status(404).json({ error: { message: 'Branch does not exist.' } });
            return;
        }

        // Parent commit hash was validated during initiation
        const parentCommitHash = sessionJwt.parentCommitHash as string;

        // Check commitHash uniqueness
        if (await prisma.commit.count({ where: { commitHash } })) {
            res.status(409).json({ error: { message: 'Commit hash already exists. Must use a unique UUIDv4.' } });
            return;
        }

        if (await prisma.commit.count({ where: { paramHash } })) {
            res.status(400).json({ error: { message: 'Parameter hash already exists.' } });
            return;
        }

        // Check if fork is needed (only for FORK policy - SERIAL was rejected at initiate)
        const existingChildren = await prisma.commit.count({
            where: { branchId, previousCommitHash: parentCommitHash }
        });

        const forkNeeded = existingChildren > 0 && branch.repository.commitPolicy === 'FORK';
        let targetBranchId = branchId;
        let forkedBranch: any = null;

        // Metrics are supplied directly by the commit finalization payload.
        // This removes runtime dependence on shared-folder data.
        let metricsFinal: Record<string, unknown> = {};
        if (metrics !== undefined && metrics !== null) {
            let parsedMetrics: unknown = metrics;

            if (typeof metrics === 'string') {
                try {
                    parsedMetrics = JSON.parse(metrics);
                } catch {
                    res.status(400).json({ error: { message: 'metrics must be valid JSON when provided as a string.' } });
                    return;
                }
            }

            if (typeof parsedMetrics !== 'object' || parsedMetrics === null || Array.isArray(parsedMetrics)) {
                res.status(400).json({ error: { message: 'metrics must be a JSON object.' } });
                return;
            }

            metricsFinal = parsedMetrics as Record<string, unknown>;
        }

        const paramsIpfs = await prisma.ipfsObject.findUnique({
            where: { id: paramsReceiptJwt.paramsIpfsId }
        });

        if (!paramsIpfs) {
            res.status(404).json({ error: { message: 'Parameters IPFS object not found. Please re-upload parameters.' } });
            return;
        }

        const commit = await prisma.$transaction(async (tx) => {
            if (zkmlRelationInput) {
                const duplicateProof = await tx.zKMLProof.findFirst({
                    where: {
                        proofIpfsId: zkmlRelationInput.create.proofIpfsId,
                        settingsIpfsId: zkmlRelationInput.create.settingsIpfsId,
                        verificationKeyIpfsId: zkmlRelationInput.create.verificationKeyIpfsId
                    }
                });

                if (duplicateProof) {
                    throw new Error('ZKML Proof combination already exists in database.');
                }
            }

            const paramsCreateInput: any = {
                ipfsObjectId: paramsIpfs.id
            };

            if (zkmlRelationInput) {
                paramsCreateInput.ZKMLProof = zkmlRelationInput;
            }

            if (forkNeeded) {
                const forkBranchName = `${branch.name}-fork-${uuidV4().split('-')[0]}`;
                forkedBranch = await tx.branch.create({
                    data: {
                        name: forkBranchName,
                        description: `Forked from ${branch.name} at ${parentCommitHash}`,
                        repositoryId: branch.repositoryId,
                        branchHash: uuidV4(),
                        ...(branch.latestParamsId && { latestParamsId: branch.latestParamsId })
                    }
                });
                targetBranchId = forkedBranch.id;
            }

            const newCommit = await tx.commit.create({
                data: {
                    committerAddress: pk,
                    message,
                    metrics: metricsFinal,
                    branchId: targetBranchId,
                    commitHash,
                    previousCommitHash: parentCommitHash,
                    commitType,
                    status: 'MERGED',               // the status is set to MERGED directly for simplicity for now
                    verified: !!zkmlRelationInput,
                    architecture,
                    paramHash,
                    params: {
                        create: paramsCreateInput,
                    },
                    committerId: committer.id
                },
                include: {
                    params: {
                        include: { ZKMLProof: true }
                    }
                }
            });

            await tx.branch.update({ where: { id: targetBranchId }, data: { updatedAt: new Date() } });
            await tx.repository.update({ where: { id: repoId }, data: { updatedAt: new Date() } });
            await tx.commitCreationSession.update({ where: { id: sessionId }, data: { consumed: true, status: 'FINALIZED' } });
            
            // Add committer to contributors list if not already present
            if (!branch.repository.contributorIds.includes(pk)) {
                await tx.repository.update({
                    where: { id: repoId },
                    data: {
                        contributorIds: { push: pk }
                    }
                });
            }
            
            return newCommit;
        });

        res.status(201).json({ 
            data: commit,
            forkedBranch: forkedBranch ? { branchHash: forkedBranch.branchHash, name: forkedBranch.name } : null,
            message: forkedBranch
                ? `Parent already used. Commit created on new branch ${forkedBranch.name}.`
                : 'Commit created successfully.'
        });

    } catch (error: any) {
        console.error('Error creating commit:', error);

        if (sessionId && zkmlCids) {
            try {
                const session = await prisma.commitCreationSession.findUnique({
                    where: { id: sessionId }
                });

                if (session?.zkmlProofIpfsId && session?.zkmlSettingsIpfsId && session?.zkmlVkIpfsId) {
                    const [proofObj, settingsObj, vkObj] = await Promise.all([
                        prisma.ipfsObject.findUnique({ where: { id: session.zkmlProofIpfsId } }),
                        prisma.ipfsObject.findUnique({ where: { id: session.zkmlSettingsIpfsId } }),
                        prisma.ipfsObject.findUnique({ where: { id: session.zkmlVkIpfsId } })
                    ]);

                    if (proofObj && settingsObj && vkObj) {
                        console.log('Cleaning up orphaned ZKML files from IPFS...');
                        await Promise.all([
                            storageProvider.remove(proofObj.cid),
                            storageProvider.remove(settingsObj.cid),
                            storageProvider.remove(vkObj.cid)
                        ]);

                        await Promise.all([
                            prisma.ipfsObject.delete({ where: { id: proofObj.id } }).catch(() => { }),
                            prisma.ipfsObject.delete({ where: { id: settingsObj.id } }).catch(() => { }),
                            prisma.ipfsObject.delete({ where: { id: vkObj.id } }).catch(() => { })
                        ]);

                        console.log('Successfully removed orphaned ZKML files and DB records.');
                    }
                }
            } catch (cleanupErr) {
                console.error('Error cleaning up ZKML files:', cleanupErr);
            }
        }

        if (paramsCid) {
            try {
                console.log('Cleaning up orphaned parameters file from IPFS...');
                await storageProvider.remove(paramsCid);
                console.log('Successfully removed orphaned parameters file.');
            } catch (cleanupErr) {
                console.error('Error cleaning up parameters file from IPFS:', cleanupErr);
            }
        }

        if (error.message === 'ZKML Proof combination already exists in database.') {
            res.status(409).json({ error: { message: error.message } });
            return;
        }

        res.status(500).send({ error: { message: 'Internal Server Error' } });
    }
};

export const createCommitNft = async (req: Request, res: Response, next: any) => {
    try {
        const pk = authorizedPk(res);
        const { commitHash } = req.params;

        const commit = await prisma.commit.findFirst({
            where: { commitHash },
            include: {
                branch: {
                    include: {
                        repository: true
                    }
                },
                nft: true
            }
        });

        if (!commit) {
            res.status(404).send({ error: { message: 'Commit not found.' } });
            return;
        }

        if (commit.nft) {
            res.status(409).send({ error: { message: 'This commit has already been minted as an NFT.' } });
            return;
        }

        const repo = commit.branch.repository;
        const hasPermission = repo.ownerAddress === pk || repo.adminIds.includes(pk) || repo.writeAccessIds.includes(pk);
        if (!hasPermission) {
            res.status(403).send({ error: { message: 'Unauthorized. You do not have permission to mint this commit NFT.' } });
            return;
        }

        const asset = await convertCommitToNft(umi, commitHash);
        res.status(200).json({ data: asset });
    }
    catch (err) {
        res.status(400).send({ error: { message: `${err}` } });
        return;
    }
};
