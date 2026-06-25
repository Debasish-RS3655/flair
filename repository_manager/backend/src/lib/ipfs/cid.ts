// create a CID for the sent file without uploading to IPFS
// Debashish Buragohain

import { sha256 } from 'multiformats/hashes/sha2'
import { CID } from 'multiformats/cid';
import * as raw from 'multiformats/codecs/raw';

// this function needs to be mostly implemented in the frontend or client since it is power intensive
export async function computeCID(input: Buffer | Uint8Array | string): Promise<string> {
    let bytes: Uint8Array;
    if (typeof input === 'string') {
        bytes = new TextEncoder().encode(input);
    } else {
        bytes = new Uint8Array(input);
    }
    const digest = await sha256.digest(bytes);
    const cid = CID.createV1(raw.code, digest);
    return cid.toString();
}