// middleware to check if the model already exists in the user's repository before uploading a new model
// Debashish Buragohain

import { Response, Request, NextFunction } from 'express';
import { prisma } from '../../lib/prisma/index.js';

export const existingModelCheck = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { repoId } = req;
    if (!repoId) {
        res.status(500).send({ error: { message: 'Repository ID not attached to the request.' } });
        return;
    }
    const repo = await prisma.repository.findUnique({
        where: { id: repoId },
        include: {
            branches: { include: { commits: true } }
        }
    });
    if (!repo) {
        res.status(404).send({ error: { message: 'Repository not found.' } });
        return;
    }
    // if a base model already exists in the repository
    if (repo.baseModelHash) {
        // an already committed repo cannot reupload a base model
        if (repo.branches.filter(branch => {
            // filter out the branches that contain commits
            return branch.commits.length !== 0;
        }).length !== 0) {
            res.status(400).send({ error: { message: 'Cannot reupload or delete a model to a repository that already contains commits' } });
            return;
        }
    }

    // reached here means that the repository does not contain commits
    next();
}