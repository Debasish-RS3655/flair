// Handler for the merkle trees
// Debashish Buragohain
import { createTree } from '@metaplex-foundation/mpl-bubblegum';
import { generateSigner, Umi, PublicKey } from '@metaplex-foundation/umi';
import { prisma } from "../prisma/index.js";
import { MerkleTreeConfig } from "./types";
import bs58 from 'bs58';

// the config for the merkleTree
export const merkleTreeConfig: MerkleTreeConfig = {
    maxDepth: 20,
    maxBufferSize: 64,
    canopyDepth: 14,
};

// creates a merkle tree and stores it in the database and returns a base58 encoded address of the merkle tree
export async function createMerkleTree(umi: Umi): Promise<string | undefined> {
    try {
        const merkleTree = generateSigner(umi);
        const createTreeTx = await createTree(umi, {
            merkleTree,
            ...merkleTreeConfig
        });
        const tx = await createTreeTx.sendAndConfirm(umi);
        const treeAddress = merkleTree.publicKey;                       // already a base58 encoded string
        const treePrivateKey = bs58.encode(merkleTree.secretKey);       // encode the secret key of the merkle tree into base58 format
        const txSignature = bs58.encode(tx.signature);                  // encode the transaction signature of the merkle tree into base58 format

        console.log('Transaction:', tx.result);
        console.log('Signature:', txSignature);
        console.log(`Merkle Tree created with address: ${treeAddress}
            \nSecret Key: ${treePrivateKey}
            \nSave the keypair for future usage.`);
        // this is to be done on the admin dashboard itself where we have access to the phantom wallet            

        const totalLeaves = 2 ** merkleTreeConfig.maxDepth;
        // store the merkleTree in the database now
        await prisma.merkleTree.create({
            data: {
                mintAuthority: umi.identity.publicKey,      // the mint authority is the currently instantiated wallet for umi
                secret: treePrivateKey,    // secret key of the merkle tree is not actually used anywhere
                address: treeAddress,      // the address of the merkle tree will be required everytime we mint a new NFT
                totalLeaves,                                // the number of nfts that can be stored in the tree
                remainingLeaves: totalLeaves,               // remaining of the leaves that can be used to store in the tree
                signature: txSignature,                     // signature of the create tree transaction
            }
        });        
        return treeAddress;
    }
    catch (err) {
        console.error('Error creating merkle tree:', err);
    }
}

// updates the remaining leaves property of the current merkle tree or switches to the next merkle tree in reservoir
export async function updateCurrentTree(assetId: PublicKey<string>): Promise<void> {
    // Fetch the active Merkle tree    
    const activeTrees = await prisma.merkleTree.findMany({ where: { active: true } });
    // active trees 
    if (!activeTrees.length) {
        throw new Error('Critical Error: No active Merkle tree found.');
    }
    if (activeTrees.length !== 1) {
        throw new Error('Critical Error: Invalid number of active merkle trees. Fix immediately to continue NFT minting operations.');
    }
    // update the remaining leaves property and push the given signature
    const currentTree = await prisma.merkleTree.update({
        where: { id: activeTrees[0].id },
        data: {
            remainingLeaves: { decrement: 1 },
            assetIds: { push: assetId }
        }
    });
    if (currentTree.totalLeaves - currentTree.remainingLeaves !== currentTree.assetIds.length) {
        console.error('Critical Error! Mismatch in signatures and used leaves in active tree.');
    }
    // if we have reached the full capacity of the current tree then move to the next tree
    if (!currentTree.remainingLeaves) {
        // get the next tree in the timelines
        const nextActiveTree = await prisma.merkleTree.findMany({
            where: { createdAt: { gt: currentTree.createdAt } },
            orderBy: { createdAt: 'asc' },
            take: 1
        });
        if (!nextActiveTree.length) {
            throw new Error('Critical Error: No Trees available to mint cNfts.');
        }
        // update the current and the next trees
        try {
            await prisma.$transaction([
                prisma.merkleTree.update({
                    where: { id: currentTree.id },
                    data: { active: false }
                }),
                prisma.merkleTree.update({
                    where: { id: nextActiveTree[0].id },
                    data: { active: true }
                })
            ]);
            console.log('Updated to the next merkle tree.');
            return;
        }
        catch (err) {
            console.error('High-Level Error: Error updating to next merkle tree:', err);
            return;
        }
    }
    console.log('Updated the current merkle tree.');
}


// get the address of the current merkle tree
export async function getCurrentTree(): Promise<string> {
    const currentTree = await prisma.merkleTree.findFirst({ where: { active: true } });
    // Critical Error when the current tree is not present    
    if (!currentTree) {
        throw new Error('No active tree found.');
    }
    if (currentTree.remainingLeaves < 0.25 * currentTree.totalLeaves) {
        console.warn('Warning!! Current active tree has reached 75% of its capacity.');
        // check if there are other empty trees present
        const availableTrees = await prisma.merkleTree.findMany({
            where: { createdAt: { gt: currentTree.createdAt } }
        });
        if (!availableTrees.length) {
            console.warn('Critical Warning!! No trees available in reservoir. Add a new tree immediately to prevent terminating of operations.');
        }
    }
    if (!currentTree.remainingLeaves) {
        throw new Error('Current Merkle Tree has reached its capacity. Please add a new Merkle Tree to continue NFT mining.');
    }
    // if the current tree    
    return currentTree.address;
}

