'use client';
import { useEffect, useState } from 'react';
import { genSignIn } from '@/lib/auth/general';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { LocalStorageTokenGen } from '@/lib/auth/general';
import { request, verifyToken } from '@/lib/requests';
import { useSignedIn } from '@/lib/SigninTokenProvider';
import { useRouter } from 'next/navigation';

interface ConnectedDetails {
  walletAddress: string;
  status: 'Signed In' | 'Not Signed In';
  details: string;
}

export default function Auth() {
  const [connectedDetails, setConnectedDetails] = useState<ConnectedDetails | undefined>(undefined);
  const { setsignedIn } = useSignedIn();
  const { publicKey, signMessage, signIn } = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  useEffect(() => {
    const localStoredToken = LocalStorageTokenGen.getToken(); // get the local storage stored token
    if (localStoredToken) {
      // before using a local storage token we make sure if it is valid or not
      console.log('Found a local storage token:', localStoredToken);
      try {
        const verified = verifyToken(localStoredToken, 'signin');
        if (verified) {
          console.log('Existing token verified. Authenticated.');
          // set the connected details for display
          const [pk] = localStoredToken.split('.');
          setConnectedDetails({
            walletAddress: pk,
            status: 'Signed In',
            details: 'Signed in using existing general token.',
          });
        }
      } catch (err) {
        console.error('Error verifying token:', err);
        // this basically means the token is useless so we clear it and sign in again
        LocalStorageTokenGen.clearToken();
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
            setIsLoading(true);

            if (authToken) {
              setConnectedDetails({
                walletAddress: publicKey.toBase58(),
                status: 'Signed In',
                details: 'Signed in using general workflow',
              });
              // time to set it in the signed in state
              setsignedIn({
                wallet: publicKey.toBase58(),
                token: authToken,
                signedIn: true,
              });
            } else console.error('Could not sign in.');
          }
        }
      } catch (error) {
        console.error('Error during sign-in:', error);
      }
      setIsLoading(false);
    })();
  }, [publicKey, connectedDetails]);

  const logout = () => {
    // clears the auth tokens from the local storage
    LocalStorageTokenGen.clearToken();
    setConnectedDetails(undefined); // also clear the connected details state
  };

  useEffect(() => {
    if (connectedDetails) {
      console.log('Connected details:', connectedDetails);
      const fetchProfile = async () => {
        try {
          const response = await request({
            method: 'GET',
            url: `${process.env.NEXT_PUBLIC_API_URL}/user/profile`,
            action: 'signin',
          });

          const data = await response.json();
          console.log('Profile data:', data);
          if (data.data.username) {
            router.push(`/${data.data.username}`);
          } else {
            router.push('/register');
          }
        } catch (err) {
          console.error('Request failed:', err);
        }
      };
      fetchProfile();
    }
  }, [connectedDetails]);

  return (
    <div className="h-full w-full flex flex-col items-center justify-center gap-4">
      {isLoading ? (
        <div className="flex items-center justify-center">Loding</div>
      ) : (
        <>
          <h1 className="text-3xl font-bold">Sign into Flair</h1>
          <div className="">
            {connectedDetails ? (
              <div>
                <p>Loding</p>
                <p>{/* <strong>Wallet Address:</strong> {connectedDetails.walletAddress} */}</p>
                <p>
                  <strong>Status:</strong> Signed In
                </p>
                {/* <p>Details: {connectedDetails.details}</p> */}
                <button onClick={logout}>Logout</button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <WalletMultiButton />
                <p className="text-lg">No wallet connected. Click the button above to connect.</p>
                <p>
                  {"Don't have a Solana Wallet. Create one "}
                  <a
                    className="text-blue-500"
                    href="https://chromewebstore.google.com/detail/phantom/bfnaelmomeimhlpmgjnjophhpkkoljpa"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    here
                  </a>
                  .
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
