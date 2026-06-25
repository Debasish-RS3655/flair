// Backend wallet controllers
// Debashish Buragohain

import { Request, Response } from "express";
import { umi, setKeypairSigner } from "../lib/nft/umi.js";
import { createSignerFromKeypair } from "@metaplex-foundation/umi";
import bs58 from 'bs58';
import bip39 from "bip39";

// Sends only the private key as the body component 
export async function signInWithSecret(req: Request, res: Response) {
    const { privateKey } = req.body;
    if (!privateKey) {
        res.status(400).send({ error: { message: 'Private key is required for signing in.' } });
        return;
    }
    console.log('Received private key:', privateKey);
    try {
        const secretKeyUint8Array = bs58.decode(privateKey); 
        console.log('Decoded key length:', secretKeyUint8Array.length);
        const umiKeypair = umi.eddsa.createKeypairFromSecretKey(secretKeyUint8Array)
        const keypairSigner = createSignerFromKeypair(umi, umiKeypair);
        let signedWallet = setKeypairSigner(keypairSigner, umi);
        if (!signedWallet) {
            res.status(500).send({ error: { message: 'Could not sign in to backend wallet using private key.' } });
            return;
        }
        console.log('Backend wallet signed in using private key: ', signedWallet.toString());
        res.status(200).json({ data: signedWallet.toString() });
        return;
    }
    catch (err: any) {
        console.error('Error signing into backend wallet using private key:', err);
        res.status(500).send({ error: { message: "Error signing into backend wallet using private key " + err.message } });
        return;
    }
}

// POST endpoint to sign in with a mnemonic seed phrase
// Send the seed as the following in the request:
// seed: "apple banana cherry date egg fruit grape honey kiwi lemon mango nut"
export async function signInWithSeed(req: Request, res: Response) {
    const { seed } = req.body;
    if (!seed || typeof seed !== 'string') {
        res.status(400).send({ error: { message: 'Seed is required and must be a mnemonic string.' } });
        return;
    }
    console.log('Received seed phrase:', seed);
    try {
        // Convert mnemonic to seed bytes using bip39.
        // This returns a Buffer (usually 64 bytes long).
        const seedBuffer = bip39.mnemonicToSeedSync(seed);
        // Use the first 32 bytes for creating the keypair.
        const seedUint8Array = new Uint8Array(seedBuffer.slice(0, 32));
        console.log('Converted seed length:', seedUint8Array.length);    
        // Create the keypair from the 32-byte seed.
        // Ensure that umi.eddsa.createKeypairFromSeed exists or adapt accordingly.
        const umiKeypair = umi.eddsa.createKeypairFromSeed(seedUint8Array);    
        // Create a signer from the keypair.
        const keypairSigner = createSignerFromKeypair(umi, umiKeypair);
        // Set the signer on the Umi instance.
        let signedWallet = setKeypairSigner(keypairSigner, umi);
        if (!signedWallet) {
            res.status(500).send({ error: { message: 'Could not sign in to backend wallet using seed.' } });
            return;
        }
        console.log('Backend wallet signed in: ', signedWallet.toString());
        res.status(200).json({ data: signedWallet.toString() });
    } catch (err: any) {
        console.error('Error signing into backend wallet using seed:', err);
        res.status(500).send({ error: { message: "Error signing into backend wallet using seed: " + err.message } });
    }
}
