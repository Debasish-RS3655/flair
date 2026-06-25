import { useLocalStorage } from '@solana/wallet-adapter-react';
import type { FC, ReactNode } from 'react';
import { createContext, useContext } from 'react';

// the auto connect provider for the dapp
// just yes or no if auto connect or not
// Debashish Buragohain

interface AutoConnectContextState {
    autoConnect: boolean;
    setAutoConnect(autoConnect: boolean): void;
}

// this is the react context that stores the state for the auto-connect feature
const AutoConnectContext = createContext<AutoConnectContextState>({} as AutoConnectContextState);

// allows access to the autoConnect state and the auto connect setter function
export function useAutoConnect(): AutoConnectContextState {
    return useContext(AutoConnectContext);
}

// this component allows all the child components to access the value it provides here autoConnect and setAutoConnect options
export const AutoConnectProvider: FC<{ children: ReactNode }> = ({ children }) => {
    // by default the auto connect is set to true
    const [autoConnect, setAutoConnect] = useLocalStorage('autoConnect', true);
    return (
        <AutoConnectContext.Provider value={{ autoConnect, setAutoConnect }}>
            {children}
        </AutoConnectContext.Provider>
    )
}