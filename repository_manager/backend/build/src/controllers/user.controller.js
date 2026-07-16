// User controllers
// Debashish Buragohain
import { prisma } from '../lib/prisma/index.js';
import { authorizedPrincipal } from '../middleware/auth/authHandler.js';
import { listSSHIdentitiesForUser, resolveUserIdFromPrincipal, upsertSSHIdentityForUser } from '../lib/auth/identity/index.js';
// Get user by username
export async function getUserByUsername(req, res) {
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
    }
    catch (err) {
        console.error(`Error getting profile: ${err}`);
        res.status(500).send({ error: { message: 'Error in getting profile' } });
        return;
    }
}
// Get user by wallet
export async function getUserByWallet(req, res) {
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
    }
    catch (err) {
        console.error(`Error getting profile: ${err}`);
        res.status(500).send({ error: { message: 'Could not update profile.' } });
        return;
    }
}
// Get current user profile
export async function getUserProfile(req, res) {
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
    }
    catch (err) {
        console.error(`Error getting profile: ${err}`);
        res.status(500).send({ error: { message: 'Could not update profile.' } });
        return;
    }
}
// Update user
export async function updateUser(req, res) {
    try {
        const principal = authorizedPrincipal(res);
        const userId = await resolveUserIdFromPrincipal(principal);
        if (!userId) {
            res.status(404).send({ error: { message: 'User not found.' } });
            return;
        }
        const { metadata, username, } = req.body;
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
            ...existingUser.metadata,
            ...(metadata || {}),
        };
        // Build the update payload
        const updateData = {
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
    }
    catch (err) {
        console.error(`Error updating user profile:`, err);
        res.status(500).send({ error: { message: 'Could not update profile.' } });
        return;
    }
}
// Deleting the user also deletes all his repositories
export async function deleteUser(req, res) {
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
    }
    catch (err) {
        console.error(`Error deleting user: ${err}`);
        res.status(500);
    }
}
export async function getUserSSHKeys(req, res) {
    try {
        const principal = authorizedPrincipal(res);
        const userId = await resolveUserIdFromPrincipal(principal);
        if (!userId) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        const keys = await listSSHIdentitiesForUser(userId);
        res.status(200).json({ data: keys });
    }
    catch (err) {
        console.error(`Error getting SSH keys: ${err}`);
        res.status(500).send({ error: { message: 'Could not load SSH keys.' } });
    }
}
export async function registerUserSSHKey(req, res) {
    try {
        const principal = authorizedPrincipal(res);
        const userId = await resolveUserIdFromPrincipal(principal);
        if (!userId) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        const { publicKey } = req.body;
        if (!publicKey || typeof publicKey !== 'string') {
            res.status(400).json({ error: { message: 'publicKey is required.' } });
            return;
        }
        const key = await upsertSSHIdentityForUser(userId, publicKey);
        res.status(200).json({ data: key });
    }
    catch (err) {
        const message = err?.message || 'Could not register SSH key.';
        if (message.includes('already linked to another account')) {
            res.status(409).json({ error: { message } });
            return;
        }
        console.error(`Error registering SSH key: ${err}`);
        res.status(400).json({ error: { message } });
    }
}
