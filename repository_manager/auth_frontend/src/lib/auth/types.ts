// defining a common type for specific solana actions
// Debashish Buragohain

export interface SolanaActionMessage {
    /**
     * Optional EIP-4361 Domain.
     * If not provided, the wallet must determine the Domain to include in the message.
     */
    domain?: string;

    /**
     * Optional EIP-4361 Address.
     * If not provided, the wallet must determine the Address to include in the message.
     */
    address?: string;

    /**
     * Mandatory action text
     */

    action: string;

    /**
     * Optional EIP-4361 Statement.
     * If not provided, the wallet must not include Statement in the message.
     */
    statement?: string;

    /**
     * Optional EIP-4361 URI.
     * If not provided, the wallet must not include URI in the message.
     */
    uri?: string;

    /**
     * Optional EIP-4361 Version.
     * If not provided, the wallet must not include Version in the message.
     */
    version?: string;

    /**
     * Optional EIP-4361 Chain ID.
     * If not provided, the wallet must not include Chain ID in the message.
     */
    chainId?: string;

    /**
     * Optional EIP-4361 Nonce.
     * If not provided, the wallet must not include Nonce in the message.
     */
    nonce?: string;

    /**
     * Optional EIP-4361 Issued At.
     * If not provided, the wallet must not include Issued At in the message.
     */
    issuedAt?: string;

    /**
     * Optional EIP-4361 Expiration Time.
     * If not provided, the wallet must not include Expiration Time in the message.
     */
    expirationTime?: string;

    /**
     * Optional EIP-4361 Not Before.
     * If not provided, the wallet must not include Not Before in the message.
     */
    notBefore?: string;

    /**
     * Optional EIP-4361 Request ID.
     * If not provided, the wallet must not include Request ID in the message.
     */
    requestId?: string;

    /**
     * Optional EIP-4361 Resources.
     * If not provided, the wallet must not include Resources in the message.
     */
    resources?: string[];
}


export interface generalSignedInData {
    signedIn: boolean;
    token: string | undefined;
    wallet: string | undefined;
}