import { FC, useCallback, useMemo } from "react";
import {
    ConnectionProvider,
    WalletProvider
} from "@solana/wallet-adapter-react";
import {
    PhantomWalletAdapter,
    SolflareWalletAdapter,
    TorusWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "react-query";
import "@solana/wallet-adapter-react-ui/styles.css";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { AutoConnectProvider } from "./components/AutoConnectProvider";
import { SiwsSupportProvider } from "./components/SiwsSupportProvider";
import { SignedInProvider } from "./components/signInTokenProivder";
import { AdapterProvider } from "./components/AdapterProvider";

import Auth from "./pages/Auth";
import GoogleAuth from "./pages/GoogleAuth";
import TreeAuth from './pages/treeAuth';

const queryClient = new QueryClient();

export const App: FC = () => {
    // by default we are going for devnet
    const network = import.meta.env.VITE_SOLANA_NETWORK == 'mainnet' ? WalletAdapterNetwork.Mainnet : WalletAdapterNetwork.Devnet;
    const endpoint = useMemo(() => clusterApiUrl(network), [network]);
    const wallets = useMemo(
        () => [
            new PhantomWalletAdapter(),
            new SolflareWalletAdapter({ network }),
            new TorusWalletAdapter()
        ],
        [network]
    );

    // This error handler is invoked when a wallet error occurs.
    const onWalletError = useCallback((error: Error) => {
        console.error(`Error connecting to wallet: ${error}`);
    }, []);

    return (
        <AdapterProvider>
            <SiwsSupportProvider>
                <AutoConnectProvider>
                    <SignedInProvider>
                        <QueryClientProvider client={queryClient}>
                            <ConnectionProvider endpoint={endpoint}>
                                <WalletProvider wallets={wallets} onError={onWalletError} autoConnect={true}>
                                    <WalletModalProvider>
                                        <Router>
                                            <Routes>
                                                {/* Google OAuth2 workflow */}
                                                <Route path="/" element={<GoogleAuth />} />
                                                {/* Solana wallet workflow */}
                                                <Route path="/wallet" element={<Auth />} />
                                                <Route path="/tree" element={<TreeAuth />} />
                                            </Routes>
                                        </Router>
                                    </WalletModalProvider>
                                </WalletProvider>
                            </ConnectionProvider>
                        </QueryClientProvider>
                    </SignedInProvider>
                </AutoConnectProvider>
            </SiwsSupportProvider>
        </AdapterProvider>
    );
};
