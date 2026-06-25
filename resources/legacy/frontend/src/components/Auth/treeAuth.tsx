import { useState } from 'react';
import { treeSignIn } from '@/lib/auth/tree';
import '../styles.css';
import { useWallet } from '@solana/wallet-adapter-react';
import { useSignedIn } from '@/lib/SigninTokenProvider';

export default function TreeAuth() {
  const { publicKey, signMessage } = useWallet();
  const [treeToken, setTreeToken] = useState<string | undefined>(undefined);
  const { signedIn } = useSignedIn(); // hook that is fulled when the sign in is completed

  // initiate the tree sign in process
  const initiateTreeSignIn = async () => {
    if (!publicKey || !signedIn || signedIn.signedIn === false) {
      console.error('Wallet not signed in. Cannot intiate tree sign in.');
      return;
    }
    try {
      console.log('Signing into tree sign in.');
      if (!signMessage) {
        console.error('Wallet does not support signMessage.');
        return;
      }
      const successTreeToken = await treeSignIn(publicKey, signMessage);
      setTreeToken(successTreeToken); // set the tree token to the state to be displayed
    } catch (error) {
      console.error('Error during sign-in:', error);
    }
  };

  return (
    <div className="TreeAuth-container">
      <h1>Sign into Tree Control</h1>
      {signedIn && signedIn.wallet ? (
        <div>
          <p>
            <strong>Signed in wallet:</strong>
            {signedIn.wallet}
          </p>
          <button onClick={initiateTreeSignIn}>Click to sign into tree</button>
          {treeToken ? (
            <div>
              <p>
                <strong>Tree sign in token:</strong>
                {treeToken}
              </p>
              <p>
                <strong>Status:</strong>Tree sign in token created.
              </p>
            </div>
          ) : (
            <p>Wallet not signed into tree.</p>
          )}
        </div>
      ) : (
        <p>Wallet not signed in. Please sign in first.</p>
      )}
    </div>
  );
}
