export interface ZKMLProof {
    proof: string;
    settings: string;
    verification_key: string;
}

export interface ZKMLProofCID {
    proofCID: string;
    settingsCID: string;
    verificationKeyCID: string;
}

export interface ZKMLProofCreateObj {
    create: {
        proofIpfsId: string,
        settingsIpfsId: string,
        verificationKeyIpfsId: string
    }
}