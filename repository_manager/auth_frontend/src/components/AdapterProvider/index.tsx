// Wallet adapter provider for the useAdapter hook to access the adapter anywyhere inside the code
// Debashish Buragohain

import { useState, useContext, createContext, ReactNode, FC } from "react";
import { Adapter } from "@solana/wallet-adapter-base";


interface AdapterContextState {
    adapter: Adapter,
    setAdapter: (adapter: Adapter) => void;
}

const adapterContext = createContext<AdapterContextState | null>(null);

export function useAdapter(): AdapterContextState {
    const context = useContext(adapterContext);
    if (!context) {
        throw new Error('useAdapter must be used within a AdapterProvider.');
    }
    return context;
}

// Adapter provider context
export const AdapterProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const [adapter, setAdapter] = useState<Adapter>({} as Adapter);
    return (
        <adapterContext.Provider value={{adapter, setAdapter}}>
            {children}
        </adapterContext.Provider>
    )
}