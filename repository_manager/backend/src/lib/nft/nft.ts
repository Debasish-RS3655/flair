// Nft minter and fetcher for Flair
// Debashish Buragohain

import { generateSigner, percentAmount, PublicKey, publicKey, Umi } from "@metaplex-foundation/umi";
// import { createNft } from "@metaplex-foundation/mpl-token-metadata";
import { base58 } from "@metaplex-foundation/umi/serializers";
import {
    findLeafAssetIdPda,
    mintToCollectionV1,
    // mintV1,
    parseLeafFromMintV1Transaction,
    parseLeafFromMintToCollectionV1Transaction
} from "@metaplex-foundation/mpl-bubblegum";
//  import { NftMetadata, CreateInstructions, CompletedCreateInstructions } from "./types";
//  import { generateSigner } from "@metaplex-foundation/umi";
import { DasApiAsset, GetAssetProofRpcResponse } from "@metaplex-foundation/digital-asset-standard-api";
import { getCurrentTree, updateCurrentTree } from "./tree.js";
import { CommitNftMetdata } from "../types/commit";
import { prisma } from "../prisma/index.js";
import { createCommitMetadata, createRepositoryMetadata } from "./metadata.js";
import { RepositoryMetdata, RepositoryNftCollectionMetadata } from "../types/repo";
import { createNft } from "@metaplex-foundation/mpl-token-metadata";
import storageProvider from "../storage/index.js";
import { constructIPFSUrl } from "../../lib/ipfs/ipfs.js";

// upload the metadata to Pinata (via provider)
export async function uploadMetadataToIPFS(metadata: CommitNftMetdata | RepositoryNftCollectionMetadata): Promise<string | undefined> {
    try {
        const res = await storageProvider.add(metadata);
        return res.cid;
    }
    catch (err) {
        console.error('Error uploading Metadata to IPFS:', err);
        return undefined;
    }
}

// takes a commit and converts it into Nft and returns the asset id
export const convertCommitToNft = async (umi: Umi, commitHash: string): Promise<MintCNftResponse> => {
    const commit = await prisma.commit.findUnique({ where: { commitHash }, include: { nft: true } });
    if (!commit) {
        throw new Error("Error creating Nft: Commit does not exist.");
    }
    // secondary check here, the first check is applied in the route itself
    // if the commit is already an nft
    if (commit.nft) {
        throw new Error("Error creating Nft: Commit is already an Nft.");
    }
    const metadata = await createCommitMetadata(commit);
    const repo = await prisma.repository.findUnique({
        where: { repoHash: metadata.repositoryHash },
        include: { collection: true }
    });
    if (!repo) {
        throw new Error('Error creating Nft: No repository exists for the given commit');
    }
    // first check if the repository is an nft collection
    if (!repo.collectionId || !repo.collection || !repo.collection.address) {
        throw new Error('Error creating Nft: Repository for the Nft is not a collection.');
    }
    const mintedNft = await mintCNft(umi, metadata, repo.collection.address);
    return mintedNft;
}


// response of the mint cnft function
export interface MintCNftResponse {
    assetId: string;
    metadataUri: string;
    metadataCID: string;
}

// mint the cNFT provided the metadata and return the signature of the transaction
// we need the signature every time we fetch the Nft asset
export const mintCNft = async (umi: Umi, metadata: CommitNftMetdata, collectionAddress: string): Promise<MintCNftResponse> => {
    if (!umi.identity) {
        throw new Error('Crticial Error: Wallet not connected. Cannot mint cNft.');
    }

    // in the latest version we would not be uploading the data to Arweave but instead to Pinata and
    // attach the Pinata Uri as the metadata uri of the cNft

    // const metadataUri = await umi.uploader.uploadJson(metadata)
    //     .catch(err => { throw new Error('Error uploading Nft metadata: ' + err) });

    const metadataCID = await uploadMetadataToIPFS(metadata);
    if (!metadataCID) {
        throw new Error('Could not upload metadata to IPFS');
    }
    const metadataUri = constructIPFSUrl(metadataCID);
    const leafOwner = publicKey(metadata.committer);
    // fetch the current merkle tree address from the backend
    const merkleTreeAdress = await getCurrentTree();
    const merkleTree = publicKey(merkleTreeAdress);

    // for the compressed Nfts we do not need to generate a separate keypair for the account
    // the cNft is non transferreable therefore there is no leaf delegate property defined here

    const collectionMint = publicKey(collectionAddress);
    const { signature } = await mintToCollectionV1(umi, {
        leafOwner,
        merkleTree,
        collectionMint,
        metadata: {
            name: metadata.message.substring(0, 32),
            uri: metadataUri,
            sellerFeeBasisPoints: 0,
            creators: [{
                address: umi.identity.publicKey,
                verified: true,
                share: 100
            }],
            collection: { key: collectionMint, verified: true }
        }
    }).sendAndConfirm(umi, { send: { commitment: 'finalized' } });

    const deserialized = base58.deserialize(signature)[0]
    // fetch the asset from the merkle tree and return it
    const leaf = await parseLeafFromMintToCollectionV1Transaction(umi, signature);
    const [assetId, bump] = findLeafAssetIdPda(umi, {
        merkleTree: merkleTree,
        leafIndex: leaf.nonce,
    });

    // update the current merkle tree and the database
    await updateCurrentTree(assetId);
    await prisma.nft.create({
        data: {
            assetId,
            signature: deserialized,
            merkleTreeAddress: merkleTree,
            owner: metadata.committer,
            commit: {
                connect: { commitHash: metadata.commitHash }
            },
            collection: {
                connect: { address: collectionAddress }
            },
            metadataCID
        }
    });


    // return the asset id, the text signature and the address of the uploaded merkle tree
    return { assetId: assetId.toString(), metadataCID, metadataUri } as MintCNftResponse;
}

// the type of the fetched Nft
export type FectchedCNft = {
    asset: DasApiAsset;
    rpcAssetProof: GetAssetProofRpcResponse;
}

// fetch the cnft from its asset id
// not included in the current version
// export async function fetchCnft(umi: Umi, assetId: string): Promise<FectchedCNft> {
//     const assetIdPub = publicKey(assetId);
//     const asset = await umi.rpc.getAsset(assetIdPub);
//     const rpcAssetProof = await umi.rpc.getAssetProof(assetIdPub);
//     return { asset, rpcAssetProof };
// }

// fetch the nft by using its signature and its merkle tree
// not included in the current verision
// export async function fetchCNftFromSignature(umi: Umi, merkleTree: string, signature: string): Promise<FectchedCNft> {
//     if (!umi.rpc) {
//         throw new Error('Critical error: No rpc connected to fetch cNft data.');
//     }
//     const serialzed = base58.serialize(signature);
//     const leaf = await parseLeafFromMintToCollectionV1Transaction(umi, serialzed);
//     const [assetId, bump] = findLeafAssetIdPda(umi, {
//         merkleTree: publicKey(merkleTree),
//         leafIndex: leaf.nonce,
//     });
//     const asset = await umi.rpc.getAsset(assetId);
//     // fetch the proof of the aset
//     const rpcAssetProof = await umi.rpc.getAssetProof(assetId);
//     return { asset, rpcAssetProof };
// }

export interface RepoToCollectionResponse {
    collectionAddress: PublicKey<string>;
    metadataUri: string;
}

// convert the repo to a collection and return the address of the collection
export async function convertRepoToCollection(umi: Umi, repoHash: string): Promise<RepoToCollectionResponse> {
    const repo = await prisma.repository.findUnique({ where: { repoHash } });
    if (!repo) {
        throw new Error('Repository does not exist to convert to collection.');
    }
    // having a base model is essential to create a collection from a repository
    if (!repo.baseModelHash) {
        throw new Error('Error creating collection: Repository does not contain any base model.')
    }
    const repoMetadata = await createRepositoryMetadata(repo);
    console.log("Repo metadata created:", repoMetadata);
    const { collectionAddress, collectionId, metadataUri } = await createCollection(umi, repoMetadata);

    // at this point update the repository data for the collection
    await prisma.repository.update({ where: { repoHash }, data: { collectionId } });
    return { collectionAddress, metadataUri } as RepoToCollectionResponse;
}

export interface CreateCollectionResponse {
    collectionAddress: PublicKey<string>;
    collectionId: string;
    metadataUri: string;
}

// function to create a collection for the repository
export async function createCollection(umi: Umi, metadata: RepositoryNftCollectionMetadata): Promise<CreateCollectionResponse> {
    if (!umi.identity.publicKey) {
        throw new Error('Crticial Error: Wallet not connected. Cannot create Nft collection.');
    }
    try {

        // in the current version we are uploading the metadata to Pinata itself 

        // const metadataUri = await umi.uploader.uploadJson(metadata);
        const metadataCID = await uploadMetadataToIPFS(metadata);
        if (!metadataCID) {
            throw new Error('Error uploading collection metadata to IPFS.');
        }
        const metadataUri = constructIPFSUrl(metadataCID);
        const collectionSigner = generateSigner(umi);

        const { signature } = await createNft(umi, {
            mint: collectionSigner,
            name: metadata.name,
            uri: metadataUri,
            isCollection: true, // main catch for collection
            sellerFeeBasisPoints: percentAmount(0)
        }).sendAndConfirm(umi);

        // update the collection in prisma
        const newCollection = await prisma.collection.create({
            data: {
                address: collectionSigner.publicKey,
                signature: base58.deserialize(signature)[0],
                privateKey: base58.deserialize(collectionSigner.secretKey)[0],
                owner: metadata.owner,
                metadataCID
            }
        });

        return {
            collectionAddress: collectionSigner.publicKey,
            collectionId: newCollection.id,
            metadataUri
        } as CreateCollectionResponse;
    }
    catch (err: any) {
        console.error('Error uploading Nft collection metadata ', err);
        throw new Error('Error uploading Nft collection metadata ', err);
    }
}   
