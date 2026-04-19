// User controllers
// Debashish Buragohain

import { Request, Response } from 'express';
import { prisma } from '../lib/prisma/index.js';
import { authorizedPrincipal } from '../middleware/auth/authHandler.js';
import { UserMetadata } from '../lib/types/user.js';
import { resolveUserIdFromPrincipal } from '../lib/auth/identity/index.js';

// Get user by username
export async function getUserByUsername(req: Request, res: Response) {
    try {
        const { username } = req.params;
        // Include the repositories and commits for the user
        const user = await prisma.user.findUnique({
            where: { username },
            include: {
                repositories: true,
                commits: true,
            },
        });
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.status(200).json({ data: user });
    } catch (err) {
        console.error(`Error getting profile: ${err}`);
        res.status(500).send({ error: { message: 'Error in getting profile' } });
        return;
    }
}

// Get user by wallet
export async function getUserByWallet(req: Request, res: Response) {
    try {
        const { wallet } = req.params;
        // Include the repositories and commits for the user
        const user = await prisma.user.findUnique({
            where: { wallet },
            include: {
                repositories: true,
                commits: true,
            },
        });
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.status(200).json({ data: user });
    } catch (err) {
        console.error(`Error getting profile: ${err}`);
        res.status(500).send({ error: { message: 'Could not update profile.' } });
        return;
    }
}

// Get current user profile
export async function getUserProfile(req: Request, res: Response) {
    try {
        const principal = authorizedPrincipal(res);
        const userId = await resolveUserIdFromPrincipal(principal);
        if (!userId) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        // Include the repositories and commits for the user
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                repositories: true,
                commits: true,
            },
        });
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.status(200).json({ data: user });
    } catch (err) {
        console.error(`Error getting profile: ${err}`);
        res.status(500).send({ error: { message: 'Could not update profile.' } });
        return;
    }
}

// Update user
export async function updateUser(req: Request, res: Response) {
    try {
        const principal = authorizedPrincipal(res);
        const userId = await resolveUserIdFromPrincipal(principal);
        if (!userId) {
            res.status(404).send({ error: { message: 'User not found.' } });
            return;
        }

        const {
            metadata,
            username,
        }: { metadata?: Partial<UserMetadata>; username?: string } = req.body;

        // Fetch existing user
        const existingUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { metadata: true, username: true },
        });
        if (!existingUser) {
            res.status(404).send({ error: { message: 'User not found.' } });
            return;
        }

        // Merge old and new metadata
        const mergedMetadata = {
            ...(existingUser.metadata as Record<string, any>),
            ...(metadata || {}),
        };

        // Build the update payload
        const updateData: any = {
            metadata: { set: mergedMetadata }, // JSON field must use `set`
            updatedAt: new Date(), // Use JS Date object
        };
        if (username) {
            updateData.username = username;
        }

        // Perform the update
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: updateData,
            include: {
                // Optionally return related data
                repositories: true,
                commits: true,
            },
        });

        // Send back the updated record
        res.status(200).json({ data: updatedUser });
        return;
    } catch (err) {
        console.error(`Error updating user profile:`, err);
        res.status(500).send({ error: { message: 'Could not update profile.' } });
        return;
    }
}

// Deleting the user also deletes all his repositories
export async function deleteUser(req: Request, res: Response) {
    try {
        const principal = authorizedPrincipal(res);
        const userId = await resolveUserIdFromPrincipal(principal);
        if (!userId) {
            res
                .status(404)
                .send({ error: { message: 'User does not exist to delete!' } });
            return;
        }

        const deletedUser = await prisma.user.delete({
            where: { id: userId },
        });
        if (!deletedUser) {
            res
                .status(404)
                .send({ error: { message: 'User does not exist to delete!' } });
            return;
        }
        // Successfully deleted the user here
        res.status(200).json({ data: deletedUser });
    } catch (err) {
        console.error(`Error deleting user: ${err}`);
        res.status(500);
    }
}
