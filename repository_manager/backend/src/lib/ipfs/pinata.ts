// code for the pinata upload handling
// Debashish Buragohain

import { PinataSDK, PinResponse } from 'pinata-web3';
import path from 'path';
import fs from 'fs';
import { computeCID } from './cid.js';
import { prisma } from '../prisma/index.js';
import { StorageProvider, AddResult, AddOptions, GetCIDResponse } from '../storage/types.js';
import stream from 'stream';
import config from '../../../config.js';

export const pinata = new PinataSDK({
    pinataJwt: process.env.PINATA_JWT!,
    pinataGateway: process.env.GATEWAY_URL!,
});

// creating a universal pinata provider
export class PinataProvider implements StorageProvider {
    public readonly name = 'pinata';
    private client: PinataSDK;

    // initiating the pinata client
    constructor(opts?: { jwt?: string, gateway?: string }) {
        this.client = new PinataSDK({
            pinataJwt: opts?.jwt || process.env.PINATA_JWT!,
            pinataGateway: opts?.gateway || process.env.GATEWAY_URL!,
        });
    }

    // create a stream from the buffer or string given
    private toStream(input: Buffer | string) {
        return stream.Readable.from(Buffer.isBuffer(input) ? input : Buffer.from(input));
    }

    /**
     * Adds content to IPFS via Pinata provider.
     * 
     * Handles multiple content types with specialized logic:
     * - File paths with allowed base model extensions are uploaded via the existing uploadToIpfs function
     *   to preserve deduplication and Prisma database logic
     * - File paths with non-allowed extensions (non-base file paths) are uploaded directly as files
     * - JSON objects are uploaded as metadata
     * - Buffers and streams are converted to file uploads
     * 
     * @param content - The content to add. Can be a file path (string), JSON object, Buffer, or stream
     * @param opts - Optional upload configuration options
     * @returns A promise resolving to the upload result containing the CID, provider name, and optional size/raw data
     * @throws Error if the upload fails
     * 
     * @example
     * // Upload a base model file
     * const result = await pinata.add('/path/to/model.safetensors');
     * 
     * @example
     * // Upload a non-base model file
     * const result = await pinata.add('/path/to/document.pdf');
     * 
     * @example
     * // Upload JSON metadata
     * const result = await pinata.add({ name: 'example', value: 123 });
     */
    public async add(content: Buffer | stream.Readable | object | string, opts?: AddOptions): Promise<AddResult> {
        // If content is a file path and the extension is one of base model allowed types,
        // delegate to the existing uploadToIpfs function to preserve dedup+prisma logic
        try {
            if (typeof content === 'string' && fs.existsSync(content)) {
                const ext = path.extname(content).replace('.', '').toLowerCase();
                const allowed: string[] = (config.upload && config.upload.baseModel && Array.isArray(config.upload.baseModel.allowedFileTypes)) ? config.upload.baseModel.allowedFileTypes.map((s: string) => s.toLowerCase()) : [];
                if (allowed.includes(ext)) {
                    const cid = await uploadToIpfs(content);
                    if (!cid) throw new Error('Failed to upload base model to Pinata');
                    return { cid, provider: this.name };
                }

                // Non-base model file path: treat as file and upload directly
                const fileStream = fs.createReadStream(content);
                const upload = await this.client.upload.file(fileStream as any);
                if (!upload || !upload.IpfsHash) {
                    throw new Error('Failed to upload file to Pinata');
                }
                return { cid: upload.IpfsHash, size: (upload as any).PinSize || (upload as any).size, raw: upload, provider: this.name };
            }

            // object (JSON metadata)
            if (typeof content === 'object' && !Buffer.isBuffer(content) && !(content instanceof stream.Readable)) {
                const upload = await this.client.upload.json(content);
                if (!upload || !upload.IpfsHash) {
                    throw new Error('Failed to upload JSON metadata to Pinata');
                }
                return { cid: upload.IpfsHash, size: (upload as any).PinSize || (upload as any).size, raw: upload, provider: this.name };
            }

            // Buffer or stream or raw string
            const s = Buffer.isBuffer(content) ? this.toStream(content) : (content as stream.Readable);
            const upload = await this.client.upload.file(s as any);
            if (!upload || !upload.IpfsHash) {
                throw new Error('Failed to upload content to Pinata');
            }
            return { cid: upload.IpfsHash, size: (upload as any).PinSize || (upload as any).size, raw: upload, provider: this.name };
        } catch (err) {
            throw err;
        }
    }

    // remove/unpin using existing unpin flow and returns the status of deletion
    public async remove(cid: string): Promise<string | void> {
        return await unpinFromIpfs(cid);
    }

    // fetch the file
    public async get(cid: string): Promise<GetCIDResponse> {
        // "application/json" | "application/xml" | "text/plain" | "text/html" | "text/css" | "text/javascript" | "application/javascript" | "image/jpeg" | "image/png" | "image/gif" | "image/svg+xml" | "audio/mpeg" | "audio/ogg" | "video/mp4" | "application/pdf" | "application/octet-stream" | string | null
        const file = await this.client.gateways.get(cid);
        return file;
    }
}


// upload the file given in the model path to IPFS, update in prisma and then delete the temporary file instance
// the optimization function happens here itself it does not need to be informed to the user for this
export async function uploadToIpfs(filePath: string): Promise<string | undefined> {
    try {
        const inputFile = fs.readFileSync(filePath);
        // check here itself if the model ealready exists in ipfs
        const cid = await computeCID(inputFile);
        if (!cid) {
            throw new Error('Failed to compute CID of uploaded file.');
        }
        const existingRepo = await prisma.repository.findFirst({
            where: { baseModelHash: cid }
        });
        let upload: Partial<PinResponse> = {};
        // if the model does not already exist
        if (!existingRepo) {
            // upload newly now to IPFS using an in-memory Readable stream
            const fileStream = stream.Readable.from(inputFile);
            upload = await pinata.upload.file(fileStream as any);
        }
        else {
            // if the base model is the same as another repository we just return the url of the previous repository
            // this is already happening in IPFS. But since we are using Pinata, we need to upload the entire model first to Pinata
            // thus local cid searching will make things much faster        
            upload.IpfsHash = existingRepo.baseModelHash!;
            // use the other parameters at a later time... not required now        
        }
        // model Uri needs to be updated in the repository
        fs.unlinkSync(filePath);
        return upload.IpfsHash!;
    }
    catch (err) {
        console.error('Error uploading Base Model to IPFS:', err);
        return undefined;
    }
}


// deprecated but working code: buffer to uint8 array and then into blob conversion
// export async function uploadToIpfs(filePath: string): Promise<string | undefined> {
//     try {
//         const inputFile = fs.readFileSync(filePath);
//         // check here itself if the model ealready exists in ipfs
//         const cid = await computeCID(inputFile);
//         if (!cid) {
//             throw new Error('Failed to compte CID of uploaded file.');
//         }
//         const existingRepo = await prisma.repository.findFirst({
//             where: { baseModelHash: cid }
//         });
//         let upload: Partial<PinResponse> = {};
//         // if the model does not already exist
//         if (!existingRepo) {
//             // upload newly now to IPFS
//             const blob = new Blob([new Uint8Array(inputFile)]);
//             const fileName = path.basename(filePath);
//             const file = new File([blob], fileName, { type: "application/octet-stream" });
//             upload = await pinata.upload.file(file);
//         }
//         else {
//             // if the base model is the same as another repository we just return the url of the previous repository
//             // this is already happening in IPFS. But since we are using Pinata, we need to upload the entire model first to Pinata
//             // thus local cid searching will make things much faster        
//             upload.IpfsHash = existingRepo.baseModelHash!;
//             // use the other parameters at a later time... not required now        
//         }
//         // model Uri needs to be updated in the repository
//         fs.unlinkSync(filePath);
//         return upload.IpfsHash!;
//     }
//     catch (err) {
//         console.error('Error uploading Base Model to IPFS:', err);
//         return undefined;
//     }
// }

// unpins and returns the status of deletion
export async function unpinFromIpfs(cid: string): Promise<string> {
    const unpin = await pinata.unpin([cid]);
    return unpin[0].status;
}
