// Parses the ABNF-like sign-in message and returns an object with its fields.
export function parseSignInMessage(message: string): Record<string, string | string[]> {
    // Split the message into lines and trim each line.
    const lines = message.split('\n').map(line => line.trim());
    const fields: Record<string, string | string[]> = {};

    // The message is structured as:
    //   <domain> wants you to sign in with your Solana account:
    //   <address>
    //   [optional statement lines...]
    //   (blank line)
    //   Action: <action>
    //   URI: <uri>
    //   Version: <version>
    //   Chain ID: <chainId>
    //   Nonce: <nonce>
    //   Issued At: <issuedAt>
    //   Expiration Time: <expirationTime>
    //   Not Before: <notBefore>
    //   Request ID: <requestId>
    //   Resources:
    //   - <resource1>
    //   - <resource2>
    //   ...
    //
    // We'll assume that the fields start after the first blank line.
    let fieldStart = lines.findIndex(line => line === '');
    if (fieldStart === -1) {
        // If no blank line is found, assume fields start at line index 2.
        fieldStart = 2;
    } else {
        fieldStart += 1; // Fields start after the blank line.
    }
    
    // Process each line in the fields section.
    for (let i = fieldStart; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        // If the line indicates the start of a resources list, prepare an array.
        if (line.startsWith("Resources:")) {
            fields["Resources"] = [];
        }
        // If the line is a resource item (starts with "-"), add it to the Resources array.
        else if (line.startsWith("-")) {
            if (Array.isArray(fields["Resources"])) {
                fields["Resources"].push(line.substring(1).trim());
            }
        }
        // Otherwise, split the line on the first colon to get a key-value pair.
        else {
            const colonIndex = line.indexOf(":");
            if (colonIndex > -1) {
                const key = line.substring(0, colonIndex).trim();
                const value = line.substring(colonIndex + 1).trim();
                fields[key] = value;
            }
        }
    }
    return fields;
}
