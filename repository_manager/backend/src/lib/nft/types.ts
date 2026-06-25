import { KeypairSigner, Amount } from "@metaplex-foundation/umi";

// the metadata that needs to be entered by the user in a form
export interface FormMetadata {
    name: string;               // the display name of the ML model
    description: string;        // description of the model
    use_case: string;           // description of the intended use case
}

// final metadata for the NFTs
export type NftMetadata = {
    creator: string;            // name of the author who has created it
    file_url: string;           // URL to download the model or code
    image_url: string;          // URI of the display image for the model (optional)    
    framework: string;          // framework used to train the model
    contributors: {
        contributor: string;               // public key of the contributor
        contibuted_model_hash: string;     // hash of the parameters that the person contributed
        push_timestamp: number;            // when the person pushed the model
        local_accuracy: number;            // accuracy of the pushed model
        zkml_proof?: string;               // the ZKML proof created for the local model (optional)
    }[];
    model_hash: string;         // latest model parameters hash
};

export interface CreateInstructions {
    name: string;
};

export interface CompletedCreateInstructions extends CreateInstructions {
    mint: KeypairSigner;
     uri: string;
    sellerFeeBasisPoints: Amount<'%', 2>;
}

export type MerkleTreeConfig = {
    maxDepth: number;
    maxBufferSize: number;
    canopyDepth: number;
};

// type config of an asset stored as json in prisma
export type Asset = {
    signature: string;
    assetId: string;
}