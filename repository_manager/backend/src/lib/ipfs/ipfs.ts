// IPFS controller functions
// Debashish Buragohain

// during production we are going to have multiple IPFS gateways. this mechanism chooses the best one out of them
export function constructIPFSUrl(cid: string) {
    const gatewayUrl = process.env.GATEWAY_URL || "https://gateway.pinata.cloud/ipfs";
    const url = `${gatewayUrl}/${cid}`;
    return url;
}