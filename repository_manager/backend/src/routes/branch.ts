import { prisma } from '../lib/prisma/index.js';
import { Router } from 'express';
import { commitRouter } from './commit.js';
import * as branchController from '../controllers/branch.controller.js';

const branchRouter = Router();

// Get all the branches for the particular repository
branchRouter.get('/', branchController.getAllBranches);

// Get a specific branch in a repository
branchRouter.get('/hash/:branchHash', branchController.getBranchByHash);
branchRouter.get('/name/:name', branchController.getBranchByName);

// Create a new branch in a repository
branchRouter.post('/create', branchController.createBranch);

// Only thing we can update or change in a branch is its description and the write access ids
branchRouter.patch('/hash/:branchHash/update', branchController.updateBranch);

// Delete a branch from a repository
branchRouter.delete('/hash/:branchHash/delete', branchController.deleteBranch);

// Fork a branch within the same repository
branchRouter.post('/hash/:branchHash/fork', branchController.forkBranch);

// Set default branch (owner/admin only)
branchRouter.patch('/hash/:branchHash/default/set', branchController.setDefaultBranch);

branchRouter.use('/hash/:branchHash/commit', async (req, res, next) => {
    const { branchHash } = req.params;
    const matchBranch = await prisma.branch.findFirst({
        where: { branchHash }
    });
    if (!matchBranch) {
        res.status(404).send({ error: { message: 'Branch does not exist' } });
        return;
    }
    req.branchId = matchBranch.id;  // attach the id of the given branch in the request
    next();
}, commitRouter);

export { branchRouter };