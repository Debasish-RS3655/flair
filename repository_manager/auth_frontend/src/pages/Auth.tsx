import { useEffect, useState } from 'react';
import { genSignIn } from '../lib/auth/general';
import '../styles.css';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { LocalStorageTokenGen } from '../lib/auth/general';
import { verifyToken } from '../lib/requests';
import { usesignedIn } from '../components/signInTokenProivder';
import { Link } from 'react-router-dom';

interface ConnectedDetails {
  walletAddress: string;
  status: 'Signed In' | 'Not Signed In';
  details: string;
}

export default function Auth() {
  const [connectedDetails, setConnectedDetails] = useState<ConnectedDetails | undefined>(undefined);
  const { setsignedIn } = usesignedIn();
  const { publicKey, signMessage, signIn } = useWallet();

  useEffect(() => {
    const localStoredToken = LocalStorageTokenGen.getInstance().getToken();   // get the local storage stored token
    if (localStoredToken) {
      // before using a local storage token we make sure if it is valid or not
      console.log('Found a local storage token:', localStoredToken);
      try {
        const verified = verifyToken(localStoredToken, 'signin');
        if (verified) {
          console.log('Existing token verified. Authenticated.');
          // set the connected details for display
          const [pk] = localStoredToken.split(".");
          setConnectedDetails({
            walletAddress: pk,
            status: 'Signed In',
            details: 'Signed in using existing general token.'
          })
        }
      }
      catch (err) {
        console.error('Error verifying token:', err);
        // this basically means the token is useless so we clear it and sign in again
        LocalStorageTokenGen.getInstance().clearToken();
      }
    }
  }, []);

  useEffect(() => {
    if (!publicKey) return;
    console.log('Wallet selected address:', publicKey.toBase58());
    (async () => {
      try {
        if (signIn && false) {
          // For this version we are not using the SIWS method.
        } else {
          console.log('Signing in using general auth workflow.');
          if (!connectedDetails || connectedDetails.status === 'Not Signed In') {
            if (!signMessage) {
              console.error('Wallet does not support signMessage.');
              return;
            }
            console.log('Signing using general workflow.');
            const authToken = await genSignIn(publicKey, signMessage);
            if (authToken) {
              setConnectedDetails({
                walletAddress: publicKey.toBase58(),
                status: 'Signed In',
                details: 'Signed in using general workflow'
              });
              // time to set it in the signed in state
              setsignedIn({
                wallet: publicKey.toBase58(),
                token: authToken,
                signedIn: true
              });
            }
            else console.error('Could not sign in.');
          }
        }
      } catch (error) {
        console.error("Error during sign-in:", error);
      }
    })();
  }, [publicKey, connectedDetails]);


  const logout = () => {
    // clears the auth tokens from the local storage
    LocalStorageTokenGen.getInstance().clearToken();
    setConnectedDetails(undefined);   // also clear the connected details state
    console.log('Logged out.');
  }

  return (
    <div className="home-container google-home">
      <h1>Sign into Flair</h1>
      <div className="display-board">
        {/* Solana wallet workflow */}
        {connectedDetails ? (
          <div>
            <p><strong>Wallet Address:</strong> {connectedDetails.walletAddress}</p>
            <p><strong>Status:</strong> Signed In</p>
            <p>Details: {connectedDetails.details}</p>
            <button onClick={logout}>Logout</button>
          </div>
        ) : (
          <div>
            <WalletMultiButton />
            <p>No wallet connected. Click the button above to connect.</p>
            <p>
              Prefer Google sign-in? <Link to="/google">Use the Google OAuth page</Link>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
