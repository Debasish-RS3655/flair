import { prisma } from '../lib/prisma/index.js';
import { Router } from 'express';
import { branchRouter } from './branch.js';
import { modelRouter } from './basemodel.js';
import * as repoController from '../controllers/repo.controller.js';
import { nftWalletLinkGate } from '../middleware/auth/nftWalletLinkGate.js';

const repoRouter = Router();

// Get all the repositories for the particular user
repoRouter.get('/', repoController.getAllRepositories);

// Get a specific repository given the repository name for the current user
repoRouter.get('/name/:name', repoController.getRepositoryByName);

// Getting the repository by the ownerAddress/repo_name as is done in GitHub
repoRouter.get('/owner/:ownerAddress/name/:name', repoController.getRepositoryByOwnerAndName);

// Get a specific repository given the repository hash
repoRouter.get('/hash/:repoHash', repoController.getRepositoryByHash);

// Clone repository: fetch repo + branches + latest commits for cloning
repoRouter.get('/hash/:repoHash/clone', repoController.cloneRepository);

// Create an empty repository
repoRouter.post('/create', repoController.createRepository);

// Update repository
repoRouter.patch('/hash/:repoHash/update', repoController.updateRepository);

// Convert to NFT collection route
repoRouter.post('/hash/:repoHash/create_collection', nftWalletLinkGate, repoController.createCollection);

// Delete repository
repoRouter.delete('/hash/:repoHash/delete', repoController.deleteRepository);

// Role management routes
repoRouter.post('/hash/:repoHash/roles/admin/add', repoController.addAdmin);
repoRouter.post('/hash/:repoHash/roles/admin/remove', repoController.removeAdmin);
repoRouter.post('/hash/:repoHash/roles/writer/add', repoController.addWriter);
repoRouter.post('/hash/:repoHash/roles/writer/revoke', repoController.revokeWriter);
repoRouter.get('/hash/:repoHash/roles', repoController.getRepositoryRoles);

// mounting the branch router here
repoRouter.use('/hash/:repoHash/branch', async (req, res, next) => {
    const { repoHash } = req.params;
    const matchRepo = await prisma.repository.findFirst({
        where: { repoHash }
    });
    if (!matchRepo) {
        res.status(404).send({ error: { message: 'Repository does not exist.' } });
        return;
    }
    // set the repoId in the request object
    req.repoId = matchRepo.id;
    // proceed to the next middleware if the referenced repository exists
    next();
}, branchRouter);

// mount the model upload router here
repoRouter.use('/hash/:repoHash/basemodel', async (req, res, next) => {
    const { repoHash } = req.params;
    const matchRepo = await prisma.repository.findFirst({
        where: { repoHash }
    });
    if (!matchRepo) {
        res.status(404).send({ error: { message: 'Repository does not exist.' } });
        return;
    }
    // cannot upload a new model to the same repository
    req.repoId = matchRepo.id;
    next();
}, modelRouter);

export { repoRouter };