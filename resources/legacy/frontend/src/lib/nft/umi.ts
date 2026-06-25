// create the Umi instance
// Debashish Buragohain

import { mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import { Umi } from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters";
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys";
import { Adapter } from "@solana/wallet-adapter-base";
import { clusterApiUrl } from "@solana/web3.js";
import { dasApi } from '@metaplex-foundation/digital-asset-standard-api';
// import { mockStorage } from "@metaplex-foundation/umi-storage-mock";

export const initializeUmi = async (adapter: Adapter): Promise<Umi> => {
    const umi = createUmi(clusterApiUrl('devnet'))
        .use(mplTokenMetadata())
        .use(irysUploader({
            address: "https://devnet.irys.xyz",
        }))
        .use(walletAdapterIdentity(adapter))
        .use(dasApi());
    // .use(mockStorage());

    return umi;
}