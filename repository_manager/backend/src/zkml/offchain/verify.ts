// inherent functions for verifiying zk proofs offchain on the repository manager
// currently not being used anywhere
// separate zkp verification server that runs the verification dedicatedly
// Debasish Buragohain


import * as wasmFunctions from '@ezkljs/engine/nodejs';
import { 
    // readDataFile, 
    serializeZkmlProof } from './utils';
import JSONBig from 'json-bigint';
import { deserialize } from '@ezkljs/engine/nodejs';
import { zkmlDeserialized } from '../types/types';
import { stringToUint8ClampedArray } from './utils';


// the proof needs to be verified on the admin's local system only, we just need to serve it from here in the backend
export async function verifyProof(deserialized: zkmlDeserialized): Promise<boolean> {
    try {
        const serialized = serializeZkmlProof(deserialized);
        const { proof, settings, verification_key } = serialized;
        console.log('settings.json:', JSONBig.stringify(deserialize(settings), null, 4));
        const startTimeVerify: number = Date.now();
        // Perform verification
        const verification: boolean = wasmFunctions.verify(proof, verification_key, settings, stringToUint8ClampedArray('random_string'));
        // Record end time for verification
        const endTimeVerify: number = Date.now();
        console.log('Verification time (ms):', endTimeVerify - startTimeVerify);
        return verification;
    }
    catch (err) {
        console.error('Error during proof verification:', err);
        return false;
    }
}

// refernce verifier code
// export async function verifyProofFromFile(modelName: string): Promise<boolean> {
//     try {
//         wasmFunctions.init_panic_hook();
//         // Read in the verification key, settings file, and structured reference string (SRS)
//         const vk: Uint8ClampedArray = await readDataFile('vk.key', modelName);
//         const circuitSettingsSer: Uint8ClampedArray = await readDataFile('settings.json', modelName);
//         const srsSer: Uint8ClampedArray = await readDataFile('kzg', modelName);
//         // Deserialize settings for debugging
//         console.log('settings.json:', JSONBig.stringify(deserialize(circuitSettingsSer), null, 4));
//         // Read the proof file
//         const proofSer: Uint8ClampedArray = await readDataFile('proof.json', modelName);
//         // Record start time for verification
//         const startTimeVerify: number = Date.now();
//         // Perform verification
//         const verification: boolean = wasmFunctions.verify(proofSer, vk, circuitSettingsSer, srsSer);
//         // Record end time for verification
//         const endTimeVerify: number = Date.now();
//         console.log('Verification time (ms):', endTimeVerify - startTimeVerify);
//         return verification;
//     } catch (error) {
//         console.error('Error during proof verification:', error);
//         return false;
//     }
// }
