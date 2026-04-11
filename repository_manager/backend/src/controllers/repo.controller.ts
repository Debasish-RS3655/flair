// Repository controllers
// Debashish Buragohain

import { Request, Response } from 'express';
import { prisma } from '../lib/prisma/index.js';
import { authorizedPk } from '../middleware/auth/authHandler.js';
import { RepositoryMetdata } from '../lib/types/repo';
import { convertRepoToCollection } from '../lib/nft/nft.js';
import { umi } from '../lib/nft/umi.js';
import { v4 as uuidv4 } from 'uuid';

// Get all the repositories for the particular user
export async function getAllRepositories(req: Request, res: Response) {
    // Extract the authorized public key
    const pk = authorizedPk(res);
    prisma.repository.findMany({
        where: { ownerAddress: pk }
    }).then(repos => {
        res.status(200).json({ data: repos });
        return;
    }).catch(err => {
        console.error('Error fetching repositories:', err);
        res.status(400).send({ error: err });
        return;
    })
}

// Get a specific repository given the repository name for the current user
export async function getRepositoryByName(req: Request, res: Response) {
    const { name } = req.params;
    const pk = authorizedPk(res);
    const matchRepo = await prisma.repository.findFirst({ where: { ownerAddress: pk, name } });
    if (!matchRepo) {
        res.status(404).send({ error: { message: 'Repository not found.' } });
        return;
    }
    res.status(200).json({ data: matchRepo });
}

// Getting the repository by the ownerAddress/repo_name as is done in GitHub
export async function getRepositoryByOwnerAndName(req: Request, res: Response) {
    const { ownerAddress, name } = req.params
    const matchRepo = await prisma.repository.findFirst({ where: { ownerAddress, name } });
    if (!matchRepo) {
        res.status(404).send({ error: { message: 'Repository not found.' } });
        return;
    }
    res.status(200).json({ data: { matchRepo } });
}

// Get a specific repository given the repository hash
export async function getRepositoryByHash(req: Request, res: Response) {
    const { repoHash } = req.params;
    const matchRepo = await prisma.repository.findUnique({
        where: { repoHash },
    });
    if (!matchRepo) {
        res.status(404).send({ error: { message: 'Repository not found.' } });
        return;
    }
    res.status(200).json({ data: matchRepo });
}

// Create an empty repository
export async function createRepository(req: Request, res: Response) {
    try {
        // Create a repository
        const pk = authorizedPk(res);
        const { metadata, name, }: { metadata: Partial<RepositoryMetdata>, name: string } = req.body;
        if (!metadata || !name) {
            res.status(400).send({ error: { message: 'Name and metadata are required fields.' } });
            return;
        }
        if (name.includes(" ")) {
            res.status(400).send({ error: { message: 'Name of a repository cannot contain spaces.' } });
            return;
        }        
        if (!metadata.framework) {
            res.status(400).send({ error: { message: 'Framework is a required field in the metadata.' } });
            return;
        }
        // Check to ensure that the combination of the user and the repository name is unique
        const existingRepo = await prisma.repository.findFirst({
            where: {
                ownerAddress: pk,
                name: name
            }
        });
        if (existingRepo) {
            res.status(400).send({ error: { message: 'You already have a repository with this name.' } });
            return;
        }

        const owner = await prisma.user.findFirst({
            where: { wallet: pk }
        });
        if (!owner) {
            res.status(401).send({ error: { message: 'User not found!' } });
            return;
        }
        const repository = await prisma.repository.create({
            data: {
                name,
                ownerAddress: pk,
                contributorIds: [pk],
                writeAccessIds: [pk],
                adminIds: [pk],
                metadata: {
                    set: {
                        name: name,
                        creator: pk,
                        framework: metadata.framework,
                        useCase: metadata.useCase || undefined,
                        description: metadata.description || undefined,
                    }
                },
                repoHash: uuidv4(),
                ownerId: owner.id
            }
        });

        res.status(201).json({ data: repository });
        return;
    }
    catch (err) {
        console.error('Error creating repository:', err);
        res.status(500).send({ error: { message: 'Internal server error' } });
        return;
    }
}

// Update repository
export async function updateRepository(req: Request, res: Response) {
    try {
        const pk = authorizedPk(res);
        const { repoHash } = req.params;
        const {
            name,
            addContributorIds = [],
            removeContributorIds = [],
            addAdminIds = [],
            removeAdminIds = [],
            addWriteAccessIds = [],
            removeWriteAccessIds = [],
            metadata,
        } = req.body;

        if (!repoHash) {
            res.status(400).send({ error: { message: 'Repository hash not provided to update.' } });
            return;
        }

        if (!metadata && !addContributorIds.length && !removeContributorIds.length && !addAdminIds.length && !removeAdminIds.length && !addWriteAccessIds.length && !removeWriteAccessIds.length) {
            res.status(400).send({ error: { message: 'No fields provided to update.' } });
            return;
        }

        // Find the repository
        const match = await prisma.repository.findUnique({ where: { repoHash } });
        if (!match) {
            res.status(404).send({ error: { message: 'Repository does not exist.' } });
            return;
        }
        // Check if the user is the owner or an admin
        const isAdmin = match.ownerAddress === pk || (match.adminIds && match.adminIds.includes(pk));
        if (!isAdmin) {
            res.status(401).send({ error: { message: 'Unauthorized. Only admins can update repository details.' } });
            return;
        }
        // Prepare updates for contributors and admins
        const updatedContributorIds = Array.from(
            new Set([
                ...(match.contributorIds || []),
                ...addContributorIds
            ].filter(id => !removeContributorIds.includes(id)))
        );

        const updatedAdminIds = Array.from(
            new Set([
                ...(match.adminIds || []),
                ...addAdminIds
            ].filter(id => !removeAdminIds.includes(id)))
        );

        const updatedWriteAccessIds = Array.from(
            new Set([
                ...(match.writeAccessIds || []),
                ...addWriteAccessIds
            ].filter(id => !removeWriteAccessIds.includes(id)))
        );

        const exisingMetadata: Object = match.metadata || {};
        const updatedMetdata: RepositoryMetdata = { ...exisingMetadata, ...metadata };

        // Update the repository
        const updatedRepo = await prisma.repository.update({
            where: { id: match.id },
            data: {
                ...(updatedContributorIds && { contributorIds: updatedContributorIds }),
                ...(updatedAdminIds && { adminIds: updatedAdminIds }),
                ...(updatedWriteAccessIds && { writeAccessIds: updatedWriteAccessIds }),
                ...(updatedMetdata && { metadata: updatedMetdata }),
                ...(name && { name }),        // In case we want to change the name of the repository
                updatedAt: new Date(),
            },
        });
        res.status(200).json(updatedRepo);
        return;

    } catch (error) {
        console.error('Error updating repository:', error);
        res.status(500).send({ error: { message: 'Internal Server Error' } });
        return;
    }
}

// Convert to NFT collection route
export async function createCollection(req: Request, res: Response) {
    const { repoHash } = req.params;
    try {
        const pk = authorizedPk(res);
        const matchedRepo = await prisma.repository.findUnique({ where: { repoHash } });
        if (!matchedRepo) {
            res.status(404).send({ error: { message: 'Repository not found.' } });
            return;
        }

        const isAuthorized = matchedRepo.ownerAddress === pk || matchedRepo.adminIds.includes(pk);
        if (!isAuthorized) {
            res.status(403).send({ error: { message: 'Unauthorized. Only owner or admins can create NFT collections.' } });
            return;
        }

        if (matchedRepo.collectionId) {
            res.status(409).send({ error: { message: 'Repository already converted to an NFT collection.' } });
            return;
        }

        const collection = await convertRepoToCollection(umi, repoHash);
        res.status(200).json({ data: collection });
    }
    catch (err) {
        res.status(400).send({ error: { message: `${err}` } });
        return;
    }
}

// Delete repository
export async function deleteRepository(req: Request, res: Response) {
    const { repoHash } = req.params;
    const pk = authorizedPk(res);
    try {
        const matchedRepo = await prisma.repository.findUnique({
            where: { repoHash }
        });
        if (!matchedRepo) {
            res.status(404).send({ error: { message: 'Repository not found.' } });
            return;
        }
        if (matchedRepo.ownerAddress !== pk && !matchedRepo.adminIds.includes(pk)) {
            res.status(401).send({ error: { message: 'Unauthorized. Only a creator or an admin can delete the branch.' } });
            return;
        }

        // Get all the branches for this repository
        const branches = await prisma.branch.findMany({
            where: { repositoryId: matchedRepo.id },
            select: { id: true }
        });

        // Delete all the commits for each branch and then the branch itself
        for (const branch of branches) {
            // Get all commits associated with the branch
            const commits = await prisma.commit.findMany({
                where: { branchId: branch.id },
                select: { id: true },
            });
            // Extract commit IDs
            const commitIds = commits.map((commit) => commit.id);
            // Perform the deletion within a transaction
            await prisma.$transaction([
                // Delete params associated with the commits
                prisma.params.deleteMany({ where: { commitId: { in: commitIds } } }),

                // Permanent deletion is the best action because obviously
                // Permanently delete commits
                prisma.commit.deleteMany({ where: { branchId: branch.id } }),

                // Soft delete commits
                // prisma.commit.updateMany({
                //     where: { branchId: branch.id },
                //     data: { isDeleted: true }
                // }),

                // Delete the branch finally
                prisma.branch.delete({ where: { id: branch.id } }),
            ]);
        }

        // Finally after all the branches have been deleted we can delete the repository
        // Update the repository's updatedAt field
        const deletedRepo = await prisma.repository.delete({ where: { repoHash } });
        // Inform the client that the repo has been deleted successfully
        res.status(200).json({ message: 'The repository and its associated branches and commits deleted successfully.', deleted: deletedRepo })

    } catch (err) {
        console.error('Error deleting branch: ', err);
        res.status(500).send({ error: { message: 'Internal Server Error' } });
    }
}

// Add admin to repository (Owner only)
export async function addAdmin(req: Request, res: Response) {
    try {
        const pk = authorizedPk(res);
        const { repoHash } = req.params;
        const { walletAddress } = req.body;

        if (!walletAddress) {
            res.status(400).json({ error: { message: 'walletAddress is required.' } });
            return;
        }

        const repo = await prisma.repository.findUnique({ where: { repoHash } });
        if (!repo) {
            res.status(404).json({ error: { message: 'Repository not found.' } });
            return;
        }

        // Only owner can add admins
        if (repo.ownerAddress !== pk) {
            res.status(403).json({ error: { message: 'Unauthorized. Only the owner can assign admins.' } });
            return;
        }

        // Check if already an admin
        if (repo.adminIds.includes(walletAddress)) {
            res.status(400).json({ error: { message: 'User is already an admin.' } });
            return;
        }

        const updatedRepo = await prisma.repository.update({
            where: { repoHash },
            data: {
                adminIds: { push: walletAddress },
                updatedAt: new Date()
            }
        });

        res.status(200).json({ 
            message: 'Admin added successfully.',
            data: updatedRepo 
        });

    } catch (error) {
        console.error('Error adding admin:', error);
        res.status(500).json({ error: { message: 'Internal Server Error' } });
    }
}

// Remove admin from repository (Owner only)
export async function removeAdmin(req: Request, res: Response) {
    try {
        const pk = authorizedPk(res);
        const { repoHash } = req.params;
        const { walletAddress } = req.body;

        if (!walletAddress) {
            res.status(400).json({ error: { message: 'walletAddress is required.' } });
            return;
        }

        const repo = await prisma.repository.findUnique({ where: { repoHash } });
        if (!repo) {
            res.status(404).json({ error: { message: 'Repository not found.' } });
            return;
        }

        // Only owner can remove admins
        if (repo.ownerAddress !== pk) {
            res.status(403).json({ error: { message: 'Unauthorized. Only the owner can remove admins.' } });
            return;
        }

        // Cannot remove owner from admins
        if (walletAddress === repo.ownerAddress) {
            res.status(400).json({ error: { message: 'Cannot remove owner from admins.' } });
            return;
        }

        if (!repo.adminIds.includes(walletAddress)) {
            res.status(400).json({ error: { message: 'User is not an admin.' } });
            return;
        }

        const updatedAdminIds = repo.adminIds.filter(id => id !== walletAddress);

        const updatedRepo = await prisma.repository.update({
            where: { repoHash },
            data: {
                adminIds: updatedAdminIds,
                updatedAt: new Date()
            }
        });

        res.status(200).json({ 
            message: 'Admin removed successfully.',
            data: updatedRepo 
        });

    } catch (error) {
        console.error('Error removing admin:', error);
        res.status(500).json({ error: { message: 'Internal Server Error' } });
    }
}

// Add writer to repository (Owner or Admin)
export async function addWriter(req: Request, res: Response) {
    try {
        const pk = authorizedPk(res);
        const { repoHash } = req.params;
        const { walletAddress } = req.body;

        if (!walletAddress) {
            res.status(400).json({ error: { message: 'walletAddress is required.' } });
            return;
        }

        const repo = await prisma.repository.findUnique({ where: { repoHash } });
        if (!repo) {
            res.status(404).json({ error: { message: 'Repository not found.' } });
            return;
        }

        // Owner or admin can add writers
        const isAuthorized = repo.ownerAddress === pk || repo.adminIds.includes(pk);
        if (!isAuthorized) {
            res.status(403).json({ error: { message: 'Unauthorized. Only owner or admins can add writers.' } });
            return;
        }

        // Check if already a writer
        if (repo.writeAccessIds.includes(walletAddress)) {
            res.status(400).json({ error: { message: 'User already has write access.' } });
            return;
        }

        const updatedRepo = await prisma.repository.update({
            where: { repoHash },
            data: {
                writeAccessIds: { push: walletAddress },
                updatedAt: new Date()
            }
        });

        res.status(200).json({ 
            message: 'Writer added successfully.',
            data: updatedRepo 
        });

    } catch (error) {
        console.error('Error adding writer:', error);
        res.status(500).json({ error: { message: 'Internal Server Error' } });
    }
}

// Revoke writer access from repository (Owner or Admin)
export async function revokeWriter(req: Request, res: Response) {
    try {
        const pk = authorizedPk(res);
        const { repoHash } = req.params;
        const { walletAddress } = req.body;

        if (!walletAddress) {
            res.status(400).json({ error: { message: 'walletAddress is required.' } });
            return;
        }

        const repo = await prisma.repository.findUnique({ where: { repoHash } });
        if (!repo) {
            res.status(404).json({ error: { message: 'Repository not found.' } });
            return;
        }

        // Owner or admin can revoke writers
        const isAuthorized = repo.ownerAddress === pk || repo.adminIds.includes(pk);
        if (!isAuthorized) {
            res.status(403).json({ error: { message: 'Unauthorized. Only owner or admins can revoke write access.' } });
            return;
        }

        // Cannot revoke owner or admin write access
        if (walletAddress === repo.ownerAddress || repo.adminIds.includes(walletAddress)) {
            res.status(400).json({ error: { message: 'Cannot revoke write access from owner or admins.' } });
            return;
        }

        if (!repo.writeAccessIds.includes(walletAddress)) {
            res.status(400).json({ error: { message: 'User does not have write access.' } });
            return;
        }

        const updatedWriteAccessIds = repo.writeAccessIds.filter(id => id !== walletAddress);

        const updatedRepo = await prisma.repository.update({
            where: { repoHash },
            data: {
                writeAccessIds: updatedWriteAccessIds,
                updatedAt: new Date()
            }
        });

        res.status(200).json({ 
            message: 'Write access revoked successfully.',
            data: updatedRepo 
        });

    } catch (error) {
        console.error('Error revoking writer:', error);
        res.status(500).json({ error: { message: 'Internal Server Error' } });
    }
}

// Get all roles for a repository
export async function getRepositoryRoles(req: Request, res: Response) {
    try {
        const { repoHash } = req.params;

        const repo = await prisma.repository.findUnique({ 
            where: { repoHash },
            select: {
                ownerAddress: true,
                adminIds: true,
                writeAccessIds: true,
                contributorIds: true
            }
        });

        if (!repo) {
            res.status(404).json({ error: { message: 'Repository not found.' } });
            return;
        }

        res.status(200).json({ 
            data: {
                owner: repo.ownerAddress,
                admins: repo.adminIds,
                writers: repo.writeAccessIds,
                contributors: repo.contributorIds
            }
        });

    } catch (error) {
        console.error('Error fetching repository roles:', error);
        res.status(500).json({ error: { message: 'Internal Server Error' } });
    }
}

// Clone repository: fetch repo + branches + latest commit + params for cloning
export async function cloneRepository(req: Request, res: Response) {
    try {
        const { repoHash } = req.params;

        // Get repository details
        const repo = await prisma.repository.findUnique({
            where: { repoHash },
            select: {
                id: true,
                name: true,
                repoHash: true,
                ownerAddress: true,
                metadata: true,
                createdAt: true,
                updatedAt: true,
                baseModelHash: true,
                defaultBranchHash: true
            }
        });

        if (!repo) {
            res.status(404).json({ error: { message: 'Repository not found.' } });
            return;
        }

        // Get all branches for this repository
        const branches = await prisma.branch.findMany({
            where: { repositoryId: repo.id },
            select: {
                id: true,
                name: true,
                branchHash: true,
                description: true,
                createdAt: true,
                updatedAt: true
            }
        });

        // Get latest commit for each branch
        const branchesWithLatest = await Promise.all(
            branches.map(async (branch) => {
                const latestCommit = await prisma.commit.findFirst({
                    where: {
                        branchId: branch.id,
                        isDeleted: false
                    },
                    orderBy: { createdAt: 'desc' },
                    select: {
                        id: true,
                        commitHash: true,
                        message: true,
                        paramHash: true,
                        status: true,
                        createdAt: true,
                        committerAddress: true,
                        params: {
                            select: {
                                ipfsObject: {
                                    select: {
                                        cid: true,
                                        uri: true,
                                        extension: true,
                                        size: true
                                    }
                                },
                                ZKMLProof: {
                                    select: {
                                        proof: { select: { cid: true, uri: true, extension: true } },
                                        settings: { select: { cid: true, uri: true, extension: true } },
                                        verification_key: { select: { cid: true, uri: true, extension: true } },
                                    }
                                }
                            }
                        }
                    }
                });

                return {
                    ...branch,
                    latestCommit: latestCommit || null,
                    isDefault: repo.defaultBranchHash ? branch.branchHash === repo.defaultBranchHash : false
                };
            })
        );

        // Get base model info if exists
        let baseModel = null;
        if (repo.baseModelHash) {
            baseModel = await prisma.ipfsObject.findFirst({
                where: { cid: repo.baseModelHash },
                select: {
                    cid: true,
                    uri: true,
                    extension: true,
                    size: true,
                    createdAt: true
                }
            });
        }

        // Prepare clone data
        const cloneData = {
            repo: {
                name: repo.name,
                hash: repo.repoHash,
                owner: repo.ownerAddress,
                metadata: repo.metadata,
                baseModel: baseModel,
                defaultBranchHash: repo.defaultBranchHash,
                createdAt: repo.createdAt,
                updatedAt: repo.updatedAt
            },
            branches: branchesWithLatest,
            branchCount: branches.length
        };

        res.status(200).json({ data: cloneData });

    } catch (error) {
        console.error('Error cloning repository:', error);
        res.status(500).json({ error: { message: 'Internal Server Error' } });
    }
}
