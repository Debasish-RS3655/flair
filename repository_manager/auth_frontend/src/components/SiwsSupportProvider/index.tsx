import { useState, createContext, useContext, ReactNode, FC } from "react";

// Interface for SIWS Support Context state
interface SiwsSupportContextState {
    siwsSupport: boolean;
    setSiwsSupport: (siwsSupport: boolean) => void;
}

// Initialize the context with a default value
const SiwsSupportContext = createContext<SiwsSupportContextState | undefined>(undefined);

// Custom hook to use the SIWS Support Context
export function useSiwsSupport(): SiwsSupportContextState {
    const context = useContext(SiwsSupportContext);
    if (!context) {
        throw new Error("useSiwsSupport must be used within a SiwsSupportProvider");
    }
    return context;
}

// Provider component to manage SIWS Support state
export const SiwsSupportProvider: FC<{ children: ReactNode }> = ({ children }) => {
    // by default siws support is false
    const [siwsSupport, setSiwsSupport] = useState<boolean>(false);

    return (
        <SiwsSupportContext.Provider value={{ siwsSupport, setSiwsSupport }}>
            {children}
        </SiwsSupportContext.Provider>
    );
};
