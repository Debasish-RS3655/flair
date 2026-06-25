// !! Support for regular Nfts is deprecated and will be removed in future use

// NFT creator program
// Two modes of NFT creation: compressed NFTs and regular MetaPlex NFTs
// Debashish Buragohain

// the regular Metaplex NFTs will be created entirely in the frontend by using the Phantom Wallet funded by the User's sol
// the compressed NFTs 

import { generateSigner, percentAmount, Umi } from "@metaplex-foundation/umi";
import { createNft } from "@metaplex-foundation/mpl-token-metadata";
import { base58 } from "@metaplex-foundation/umi/serializers";

// import {
//     createTree,
//     findLeafAssetIdPda,
//     mintV1,
//     mplBubblegum,
//     parseLeafFromMintV1Transaction
// } from '@metaplex-foundation/mpl-bubblegum';

import { CreateInstructions, NftMetadata, CompletedCreateInstructions} from './types';

// creates the NFT and returns the deserialized signature
export async function mintNft(umi: Umi, createIns: CreateInstructions, metadata: NftMetadata): Promise<string> {
    // for the practicality it is not possible to store the model's parameters in arweave
    // so we just use json and store the hashes only and nothing else
    if (!umi.identity) {
        throw new Error('Wallet not connected. Cannot mint NFT.');
    }
    const metadataUri = await umi.uploader.uploadJson(metadata)
        .catch(err => { throw new Error('Error uploading metadata: ' + err) });
    // creating the mint address for the NFT
    const nftSigner = generateSigner(umi);
    const finalIns: CompletedCreateInstructions = {
        ...createIns,
        mint: nftSigner,
        uri: metadataUri,
        sellerFeeBasisPoints: percentAmount(0.0)
    }
    const tx = await createNft(umi, finalIns).sendAndConfirm(umi);
    return base58.deserialize(tx.signature)[0];
}

// get the metadata from the backend using the hash given
// export async function getMetadata(modelHash: string) {
//     const metadata: NftMetadata = await fetch('').then(r => r.json());
// }