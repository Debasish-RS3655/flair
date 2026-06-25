import b58 from 'bs58';
import { DateTime } from 'luxon';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { parseSignInMessage } from '../helper/abnf_parser.js';

// returns the public key in case the user is authenticated
export const verifyGenSignIn = (authHeader: string, action: string = 'signin'): string => {
    if (!authHeader) {
        throw new Error("No authentication header provided.");
    }

    // Remove the "Bearer" and "universal" prefixes.
    // For example, if authHeader is:
    // "Bearer universalDUwyw8WeSjJEYakMs1TqzvXNLy...<rest of token>"
    // this will remove "Bearer universal" so only "<pk>.<msg>.<sig>" remains.
    const cleanToken = authHeader.trim().replace(/^Bearer\s*universal\s*/, '').trim();

    const tokenParts = cleanToken.split('.');
    if (tokenParts.length !== 3) {
        throw new Error("Token format is invalid.");
    }
    const [pk, msg, sig] = tokenParts;

    // Verify the signature
    const hasValidSig = nacl.sign.detached.verify(
        b58.decode(msg),
        b58.decode(sig),
        new PublicKey(pk).toBytes()
    );
    if (!hasValidSig) {
        throw new Error("Invalid signature.");
    }

    // Decode the message
    const decodedString = new TextDecoder().decode(b58.decode(msg));

    // Parse the message using our ABNF parser
    const contents = parseSignInMessage(decodedString);
    // Ensure that both 'Action' and 'Expiration Time' fields exist
    if (!contents["Action"] || !contents["Expiration Time"]) {
        throw new Error("Required fields (Action, Expiration Time) are missing from token.");
    }

    // Check token expiration: Convert the ISO string to a Unix timestamp
    const expUnix = DateTime.fromISO(contents["Expiration Time"] as string).toUnixInteger();
    if (DateTime.local().toUTC().toUnixInteger() > expUnix) {
        throw new Error("Expired token.");
    }

    // Validate action
    if ((contents["Action"] as string).trim() !== action) {
        throw new Error("Invalid action.");
    }

    return pk;
};

export const verifyGenSignInFirstTime = (authToken: string, action: string = 'signin'): string => {
    const tokenParts = authToken.split('.');
    if (tokenParts.length !== 3) {
        throw new Error("Token format is invalid.");
    }
    const [pk, msg, sig] = tokenParts;

    const hasValidSig = nacl.sign.detached.verify(
        b58.decode(msg),
        b58.decode(sig),
        new PublicKey(pk).toBytes()
    );
    if (!hasValidSig) {
        throw new Error("Invalid signature.");
    }

    const decodedString = new TextDecoder().decode(b58.decode(msg));

    const contents = parseSignInMessage(decodedString);
    if (!contents["Action"] || !contents["Expiration Time"]) {
        throw new Error("Required fields (Action, Expiration Time) are missing from token.");
    }

    const expUnix = DateTime.fromISO(contents["Expiration Time"] as string).toUnixInteger();
    if (DateTime.local().toUTC().toUnixInteger() > expUnix) {
        throw new Error("Expired token.");
    }

    if ((contents["Action"] as string).trim() !== action) {
        throw new Error("Invalid action.");
    }

    console.log('public key signed in: ', pk)
    return pk;
};

// same code as the import
// // Include the parser function here, or import it from a separate file
// function parseSignInMessage(message: string): Record<string, string | string[]> {
//     const lines = message.split('\n').map(line => line.trim());
//     const fields: Record<string, string | string[]> = {};
//     // Assume fields start after the first blank line
//     let fieldStart = lines.findIndex(line => line === '');
//     if (fieldStart === -1) {
//         fieldStart = 2;
//     } else {
//         fieldStart += 1;
//     }
//     for (let i = fieldStart; i < lines.length; i++) {
//         const line = lines[i];
//         if (!line) continue;
//         if (line.startsWith("Resources:")) {
//             fields["Resources"] = [];
//         } else if (line.startsWith("-")) {
//             if (Array.isArray(fields["Resources"])) {
//                 fields["Resources"].push(line.substring(1).trim());
//             }
//         } else {
//             const colonIndex = line.indexOf(":");
//             if (colonIndex > -1) {
//                 const key = line.substring(0, colonIndex).trim();
//                 const value = line.substring(colonIndex + 1).trim();
//                 fields[key] = value;
//             }
//         }
//     }
//     return fields;
// }
