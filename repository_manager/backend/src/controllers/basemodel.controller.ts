// Base model controllers
// Debashish Buragohain

import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import storageProvider from '../lib/storage/index.js';
import { authorizedPk } from '../middleware/auth/authHandler.js';
import { prisma } from '../lib/prisma/index.js';
import { constructIPFSUrl } from '../lib/ipfs/ipfs.js';

// Sends a model to the backend for uploading to the frontend
export async function uploadModel(req: Request, res: Response) {
    try {
        // First do a check that the user is actually uploading to his model only
        const pk = authorizedPk(res);
        const repo = await prisma.repository.findUnique({
            where: { id: req.repoId }, include: {
                branches: true,
                baseModel: true
            }
        });
        if (!repo) {
            res.status(400).send({ error: { message: 'Repository does not exist to upload the base model into.' } });
            return;
        }
        // Check if user is owner or admin
        const isOwner = repo.ownerAddress === pk;
        const isAdmin = repo.adminIds.includes(pk);
        if (!isOwner && !isAdmin) {
            res.status(403).send({ error: { message: 'Only the owner or admin can add models to this repository.' } });
            return;
        }
        if (repo.baseModel && repo.branches) {
            res.status(400).send({ error: { message: 'Model already uploaded to repository. ' } })
            return;
        }
        if (repo.ownerAddress !== pk) {
            res.status(401).send({ error: { message: "You cannot upload to someone else's repository." } });
            return;
        }

        if (!req.file) {
            console.error('File not saved to /tmp/uploads.');
            res.status(500).send({ error: { message: 'No file uploaded!' } });
            return;
        }

        const { fileExtension } = req;
        const { size } = req.file;

        if (!fileExtension) {
            res.status(400).send({ error: { message: 'Invalid file extension of the file.' } })
            return;
        }

        if (!size) {
            res.status(400).send({ error: { message: 'Invalid size of the file.' } });
            return;
        }

        // Reached here means the file is saved in the folder
        const modelPath = path.join(req.file.destination, req.file.filename);
        if (!fs.existsSync(modelPath)) {
            console.error('Error: File does not exist for uploading to IPFS.');
            res.status(500).send({ error: { message: 'Internal Server Error.' } });
            return;
        }
        // Start the uploading of the model via provider
        const uploadRes = await storageProvider.add(modelPath, { pin: true });
        const cid = uploadRes?.cid;
        if (!cid) {
            res.status(500).send({ error: { message: `Could not upload to IPFS.` } });
            return;
        }
        // Create or reuse IpfsObject record for the base model
        const ipfsObj = await prisma.ipfsObject.upsert({
            where: { cid },
            update: {},
            create: {
                cid,
                uri: constructIPFSUrl(cid),
                extension: fileExtension,
                size
            }
        });

        await prisma.repository.update({
            where: { id: req.repoId! },
            data: {
                baseModelId: ipfsObj.id,
                updatedAt: new Date(),
                baseModelHash: cid      // Base model hash is checked to know if the repo has a base model or not
            }
        });
        res.status(200).json({ data: { cid, fileExtension: fileExtension, url: constructIPFSUrl(cid) } });
        return;
    }
    catch (err) {
        console.error('Could not upload file to IPFS:', err);
        res.status(500).send({ error: { message: 'Could not upload file to IPFS.' } });
        return;
    }
}

// If the repo has commits, you delete the repository then the model gets deleted
export async function deleteModel(req: Request, res: Response) {
    try {
        // First check if the same model hash is present in more than one repos
        const pk = authorizedPk(res);
        const currentRepo = await prisma.repository.findUnique({
            where: { id: req.repoId },
            include: { baseModel: true }
        });
        if (!currentRepo) {
            res.status(404).send({ error: { message: 'Repository does not exist.' } });
            return;
        }
        // Check if user is owner or admin
        const isOwner = currentRepo.ownerAddress === pk;
        const isAdmin = currentRepo.adminIds.includes(pk);
        if (!isOwner && !isAdmin) {
            res.status(403).send({ error: { message: 'Only the owner or admin can delete models from this repository.' } });
            return;
        }
        if (!currentRepo.baseModel || !currentRepo.baseModelId) {
            res.status(400).send({ error: { message: 'No base model to delete in the repository.' } });
            return;
        }
        const reposWithThisModel = await prisma.repository.count({
            where: { baseModelId: currentRepo.baseModelId }
        });
        // If this is the only repo with the model actually unpin the model from IPFS
        if (reposWithThisModel <= 1) {
            // Give the request to unpin the model from IPFS
            const status = await storageProvider.remove(currentRepo.baseModel!.cid);
            if (typeof status === 'string' && status.toLowerCase().includes('error')) {
                console.error(`Error unpinning model from IPFS`);
                res.status(500).send({ error: { message: 'Could not unpin model from IPFS.', status } });
                return;
            }
        }
        // Finally delete the reference of the model from the repository
        await prisma.repository.update({
            where: { id: req.repoId },
            data: {
                baseModelId: null,
                updatedAt: new Date()
            }
        });
        // Means the model is deleted from the repository
        res.status(200).json({ data: currentRepo.baseModel.cid });
    }
    catch (err: any) {
        console.error('Could not delete model: ', err);
        res.status(400).send({ error: { message: err.message } });
        return;
    }
}

// Get the fetch URL for the model from IPFS
export async function getModelFetchUrl(req: Request, res: Response) {
    const { repoId } = req;
    const repo = await prisma.repository.findUnique({ 
        where: { id: repoId },
        include: { baseModel: true }
    });
    if (!repo) {
        res.status(404).send({ error: { message: 'Repository does not exist.' } });
        return;
    }
    if (!repo.baseModel || !repo.baseModelId) {
        res.status(400).send({ error: { message: 'Repository does not contain a base model.' } });
        return;
    }
    // IPFS URL is same for all gateways
    const url = constructIPFSUrl(repo.baseModel.cid);
    res.status(200).json({ data: url, fileExtension: repo.baseModel.extension });
}
