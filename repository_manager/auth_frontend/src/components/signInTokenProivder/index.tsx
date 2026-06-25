import { useLocalStorage } from '@solana/wallet-adapter-react';
import type { FC, ReactNode } from 'react';
import { createContext, useContext } from 'react';
import { generalSignedInData } from '../../lib/auth/types';


// the auto connect provider for the dapp
// just yes or no if auto connect or not
// Debashish Buragohain

interface signedInContextState {
    signedIn: generalSignedInData;
    setsignedIn(signedIn: generalSignedInData): void;
}

// this is the react context that stores the state for the auto-connect feature
const signedInContext = createContext<signedInContextState>({} as signedInContextState);

// allows access to the signedIn state and the auto connect setter function
export function usesignedIn(): signedInContextState {
    return useContext(signedInContext);
}

// this component allows all the child components to access the value it provides here signedIn and setsignedIn options
export const SignedInProvider: FC<{ children: ReactNode }> = ({ children }) => {
    // by default signed in is set to false
    const [signedIn, setsignedIn] = useLocalStorage<generalSignedInData>('signedIn', {
        signedIn: false,
        wallet: undefined,
        token: undefined
    });
    return (
        <signedInContext.Provider value={{ signedIn, setsignedIn }}>
            {children}
        </signedInContext.Provider>
    )
}