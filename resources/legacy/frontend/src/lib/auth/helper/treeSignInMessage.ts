// Non SIWS ABNF-like message generation
// Message construction using the ABNF format
// message creator for the tree sign in functions 
// Debashish Buragohain

import type { SolanaActionMessage } from "../types";

export function createTreeSignInMessageText(input: SolanaActionMessage): string {
    let message = `${input.domain} wants you to sign in with your Solana account:\n`;
    message += `${input.address}`;

    if (input.statement) {
        message += `\n\n${input.statement}`;
    }
    const fields: string[] = [];
    // action must be pushed as a mandatory action for Non SIWS actions and special requests
    // though not in the ABNF message format, this is included becasue we are using the traditional message verification and not SIWS
    fields.push(`Action: ${input.action}`);
    if (input.uri) {        
        fields.push(`URI: ${input.uri}`);
    }
    if (input.version) {
        fields.push(`Version: ${input.version}`);
    }
    if (input.chainId) {
        fields.push(`Chain ID: ${input.chainId}`);
    }
    if (input.nonce) {
        fields.push(`Nonce: ${input.nonce}`);
    }
    if (input.issuedAt) {
        fields.push(`Issued At: ${input.issuedAt}`);
    }
    if (input.expirationTime) {
        fields.push(`Expiration Time: ${input.expirationTime}`);
    }
    if (input.notBefore) {
        fields.push(`Not Before: ${input.notBefore}`);
    }
    if (input.requestId) {
        fields.push(`Request ID: ${input.requestId}`);
    }
    if (input.resources) {
        fields.push(`Resources:`);
        for (const resource of input.resources) {
            fields.push(`- ${resource}`);
        }
    }
    if (fields.length) {
        message += `\n\n${fields.join('\n')}`;
    }
    return message;
};
