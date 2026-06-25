// Branch controllers
// Debashish Buragohain

import { Request, Response } from 'express';
import { prisma } from '../lib/prisma/index.js';
import { authorizedPk } from '../middleware/auth/authHandler.js';
import { v4 as uuidv4 } from 'uuid';

// Get all the branches for the particular repository
export async function getAllBranches(req: Request, res: Response) {
    // We do not need the public key for the retrieval of branches
    try {
        const { repoId } = req;
        // Find the branches having the specific repository id
        const matchBranches = await prisma.branch.findMany({
            where: {
                repositoryId: repoId
            }
        });
        res.status(200).json({ data: matchBranches });
        return;
    }
    catch (err) {
        console.error('Error in all branch retrieval:', err);
        res.status(500).send({ error: { message: `${err}` } });
    }
}

// Get a specific branch in a repository
export async function getBranchByHash(req: Request, res: Response) {
    try {
        // Find the branches having the specific repository id
        const { branchHash } = req.params;
        const matchBranches = await prisma.branch.findUnique({
            where: { branchHash }
        });
        // Send an empty list if we do not have any branches in the repository
        if (!matchBranches) {
            res.status(200).json({ data: [] });
            return;
        }
        res.status(200).json({ data: matchBranches });
    }
    catch (err) {
        console.error('Error in branch retrieval:', err);
        res.status(500).send({ error: { message: `${err}` } });
    }
}

// Get a specific branch in a repository by name
export async function getBranchByName(req: Request, res: Response) {
    try {
        const { name } = req.params;
        const { repoId } = req;

        const matchBranch = await prisma.branch.findFirst({
            where: {
                repositoryId: repoId,
                name
            }
        });

        if (!matchBranch) {
            res.status(200).json({ data: [] });
            return;
        }

        res.status(200).json({ data: matchBranch });
    }
    catch (err) {
        console.error('Error in branch retrieval by name:', err);
        res.status(500).send({ error: { message: `${err}` } });
    }
}

// Create a new branch in a repository
export async function createBranch(req: Request, res: Response) {
    try {
        const pk = authorizedPk(res);
        const { repoId } = req;
        const matchRepo = await prisma.repository.findUnique({
            where: { id: repoId },
            include: { 
                branches: true, 
                baseModel: true
             }
        });
        if (!matchRepo) {
            console.error('Critical Error: Repository does not exist for branch to create.');
            res.status(500).send({ error: { message: 'Repository does not exist for branch to create.' } });
            return;
        }
        // If the user is not the creator of the repo and is not in the write access list
        if (matchRepo!.ownerAddress !== pk && !matchRepo!.writeAccessIds.includes(pk)) {
            res.status(401).send({ error: { message: 'Unauthorized. You can only create a branch in your own repository or those that you have write access.' } });
            return;
        }
        // If the base model is not uploaded we cannot create a branch
        if (!matchRepo!.baseModel || !matchRepo!.baseModelId) {
            res.status(400).send({ error: { message: 'No base model uploaded. Cannot create a new branch.' } });
            return;
        }

        // When we create a new branch, we make a copy of our current working branch
        const { currentBranchHash, name, description }: { currentBranchHash?: string, name: string, description?: string } = req.body;
        if (name.includes(" ")) {
            res.status(400).send({ error: { message: "Name of the branch cannot contain spaces." } });
            return;
        }
        // If this needs to be the first branch in this repository then there will not be any latest parameters in it
        let currentBranch;
        if (!currentBranchHash) {
            // Check if this is the first branch in this repository
            if (matchRepo.branches.length !== 0) {
                res.status(400).send({ error: { message: 'Current branch hash is mandatory for repos with more than one existing branches.' } });
                return;
            }
        }
        else {
            currentBranch = await prisma.branch.findFirst({ where: { branchHash: currentBranchHash } });
            if (!currentBranch) {
                res.status(400).send({ error: { message: 'Current branch does not exist in the repository.' } });
                return;
            }
        }

        // Create the new branch here
        const newBranch = await prisma.branch.create({
            data: {
                name,
                description,
                // Add the parameters of the current branch to this new branch if it is not the first branch in the repository
                ...(currentBranch && currentBranch.latestParamsId && { latestParamsId: currentBranch.latestParamsId }),
                repositoryId: repoId!,
                branchHash: uuidv4()
            }
        });

        // If this is the first branch, set it as default for the repository
        if (matchRepo.branches.length === 0) {
            await prisma.repository.update({
                where: { id: repoId },
                data: {
                    defaultBranchHash: newBranch.branchHash,
                    updatedAt: new Date()
                }
            });
        }
        res.status(201).json({ data: newBranch });
        return;
    }
    catch (err) {
        console.error('Error creating branch in repository: ', err);
        res.status(500).send({ error: { message: 'Internal Server Error' } });
        return;
    }
}

// Only thing we can update or change in a branch is its description and the write access ids
export async function updateBranch(req: Request, res: Response) {
    const { repoId } = req;
    const { branchHash } = req.params;  // Repo id is in the params
    const pk = authorizedPk(res);
    // First check if the public key belongs to this repository
    const matchRepo = await prisma.repository.findFirst({
        where: {
            id: repoId
        }
    });
    if (!matchRepo) {
        res.status(404).send({ error: { message: 'Repository not found.' } });
        return;
    }
    if (matchRepo.ownerAddress !== pk && !matchRepo.writeAccessIds.includes(pk)) {
        res.status(401).send({ error: { message: 'Unauthorized. You can only update your own repository or those you have write access.' } });
        return;
    }
    // Now check if the branch exists in the repository
    const matchBranch = await prisma.branch.findFirst({
        where: { branchHash }
    });
    if (!matchBranch) {
        // Cannot update a branch that does not exist
        res.status(404).send({ error: { message: 'Branch not found.' } });
        return;
    }
    // Description is the only possible updateable entity as of now
    const { description } = req.body;
    const updatedBranch = await prisma.branch.update({
        where: { id: matchBranch.id },
        data: {
            ...(description && { description }),
            updatedAt: new Date()
        },
    });

    // Update the repository updated time
    await prisma.repository.update({
        where: { id: repoId },
        data: { updatedAt: new Date() }
    });
    res.status(200).json({ data: updatedBranch });
}

// Delete a branch from a repository
export async function deleteBranch(req: Request, res: Response) {
    const { branchHash } = req.params;
    const pk = authorizedPk(res);
    const { repoId } = req;

    try {
        // Find the repository
        const matchRepo = await prisma.repository.findUnique({
            where: { id: repoId },
        });
        if (!matchRepo) {
            res.status(404).send({ error: { message: 'Repository not found.' } });
            return;
        }
        if (matchRepo.ownerAddress !== pk && !matchRepo.adminIds.includes(pk)) {
            res.status(401).send({ error: { message: 'Unauthorized. Only a creator or an admin can delete the branch.' } });
            return;
        }
        // Find the branch
        const matchBranch = await prisma.branch.findFirst({ where: { branchHash } });
        if (!matchBranch) {
            res.status(404).send({ error: { message: 'Branch not found.' } });
            return;
        }

        // Get all commits associated with the branch
        const commits = await prisma.commit.findMany({
            where: { branchId: matchBranch.id },
            select: { id: true },
        });

        // Extract commit IDs
        const commitIds = commits.map((commit) => commit.id);
        // Perform the deletion within a transaction
        await prisma.$transaction([
            // Delete params associated with the commits
            prisma.params.deleteMany({ where: { commitId: { in: commitIds } } }),
            // Delete the commits themselves
            prisma.commit.deleteMany({ where: { branchId: matchBranch.id } }),

            // Soft delete is unnecessary in here go for permanent deletion only
            // Soft delete all the commits in the branch
            // prisma.commit.updateMany({
            //     where: { id: matchBranch.id },
            //     data: { isDeleted: true }
            // }),

            // Update the repository's updatedAt field
            prisma.repository.update({
                where: { id: repoId },
                data: { updatedAt: new Date() },
            }),
        ]);
        
        // Delete the branch
        const deletedBranch = await prisma.branch.delete({ where: { id: matchBranch.id } });
        res.status(200).send({ message: 'The branch and its associated commits deleted successfully.', branch: deletedBranch });
        return;

    } catch (err) {
        console.error('Error deleting branch: ', err);
        res.status(500).send({ error: { message: 'Internal Server Error' } });
    }
}

// Set default branch for repository (owner or admin only)
export async function setDefaultBranch(req: Request, res: Response) {
    try {
        const pk = authorizedPk(res);
        const { repoId } = req;
        const { branchHash } = req.params;

        const repo = await prisma.repository.findUnique({ where: { id: repoId } });
        if (!repo) {
            res.status(404).send({ error: { message: 'Repository not found.' } });
            return;
        }

        const isAuthorized = repo.ownerAddress === pk || repo.adminIds.includes(pk);
        if (!isAuthorized) {
            res.status(403).send({ error: { message: 'Unauthorized. Only owner or admins can change default branch.' } });
            return;
        }

        const branch = await prisma.branch.findFirst({ where: { branchHash, repositoryId: repoId } });
        if (!branch) {
            res.status(404).send({ error: { message: 'Branch not found in this repository.' } });
            return;
        }

        await prisma.repository.update({
            where: { id: repoId },
            data: {
                defaultBranchHash: branch.branchHash,
                updatedAt: new Date()
            }
        });

        res.status(200).json({ message: 'Default branch updated successfully.', defaultBranchHash: branch.branchHash });
    }
    catch (err) {
        console.error('Error setting default branch:', err);
        res.status(500).send({ error: { message: 'Internal Server Error' } });
        return;
    }
}

// Fork a branch within the same repository
// can be manual or automatically forked when a merge conflict occurs
export async function forkBranch(req: Request, res: Response) {
    try {
        const pk = authorizedPk(res);
        const { repoId } = req;
        const { branchHash } = req.params;
        const { name, description }: { name: string, description?: string } = req.body;

        if (!name || !name.trim()) {
            res.status(400).send({ error: { message: 'Branch name is required for forking.' } });
            return;
        }

        if (name.includes(" ")) {
            res.status(400).send({ error: { message: "Name of the branch cannot contain spaces." } });
            return;
        }

        // Find the repository and check permissions
        const matchRepo = await prisma.repository.findUnique({
            where: { id: repoId },
            include: { baseModel: true }
        });

        if (!matchRepo) {
            res.status(404).send({ error: { message: 'Repository not found.' } });
            return;
        }

        // Check if user has write access
        if (matchRepo.ownerAddress !== pk && !matchRepo.writeAccessIds.includes(pk)) {
            res.status(401).send({ error: { message: 'Unauthorized. You can only fork branches in repositories you have write access to.' } });
            return;
        }

        // If the base model is not uploaded we cannot fork a branch
        if (!matchRepo.baseModel || !matchRepo.baseModelId) {
            res.status(400).send({ error: { message: 'No base model uploaded. Cannot fork a branch.' } });
            return;
        }

        // Find the source branch to fork from
        const sourceBranch = await prisma.branch.findFirst({ 
            where: { branchHash, repositoryId: repoId } 
        });

        if (!sourceBranch) {
            res.status(404).send({ error: { message: 'Source branch not found in this repository.' } });
            return;
        }

        // Check if a branch with the same name already exists
        const existingBranch = await prisma.branch.findFirst({
            where: { name, repositoryId: repoId }
        });

        if (existingBranch) {
            res.status(409).send({ error: { message: 'A branch with this name already exists in the repository.' } });
            return;
        }

        // Create the forked branch with the same latest params as the source branch
        const forkedBranch = await prisma.branch.create({
            data: {
                name,
                description: description || `Forked from ${sourceBranch.name}`,
                repositoryId: repoId!,
                branchHash: uuidv4(),
                // Copy the latest params from the source branch to start from the same point
                ...(sourceBranch.latestParamsId ? { latestParamsId: sourceBranch.latestParamsId } : {})
            }
        });

        // Update repository timestamp
        await prisma.repository.update({
            where: { id: repoId },
            data: { updatedAt: new Date() }
        });

        res.status(201).json({ 
            data: forkedBranch,
            message: `Branch '${sourceBranch.name}' forked successfully as '${name}'. You can now develop independently on this branch.`
        });
        return;

    } catch (err) {
        console.error('Error forking branch:', err);
        res.status(500).send({ error: { message: 'Internal Server Error' } });
        return;
    }
}
