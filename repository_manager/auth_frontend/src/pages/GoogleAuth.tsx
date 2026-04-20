import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles.css';
import { exchangeGoogleCredential, getGoogleClientId, GoogleSessionToken, loadGoogleIdentityScript } from '../lib/auth/google';

interface GoogleSessionState {
  principal?: string;
  userId?: string;
  sessionToken?: string;
  status: 'Signed In' | 'Not Signed In';
  details: string;
}

export default function GoogleAuth() {
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const [session, setSession] = useState<GoogleSessionState>({
    status: 'Not Signed In',
    details: 'No Google session found.'
  });
  const [error, setError] = useState<string | undefined>(undefined);
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    const storedToken = GoogleSessionToken.getInstance().getToken();
    if (storedToken) {
      setSession({
        status: 'Signed In',
        details: 'Signed in with a previously stored Google session token.',
        sessionToken: storedToken,
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const bootstrapGoogle = async () => {
      try {
        await loadGoogleIdentityScript();
        if (cancelled || !window.google || !buttonRef.current) {
          return;
        }

        const clientId = getGoogleClientId();
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response) => {
            try {
              setError(undefined);
              const data = await exchangeGoogleCredential(response.credential);
              
              GoogleSessionToken.getInstance().setToken(data.sessionToken);
              setSession({
                status: 'Signed In',
                details: 'Signed in using Google OAuth2 workflow.',
                principal: data.principal,
                userId: data.userId,
                sessionToken: data.sessionToken,
              });
            } catch (signInError: any) {
              setError(signInError?.message || 'Google sign-in failed.');
            }
          },
        });

        buttonRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'pill',
          width: 320,
        });
        window.google.accounts.id.prompt();
        setScriptReady(true);
      } catch (bootstrapError: any) {
        setError(bootstrapError?.message || 'Could not initialize Google sign-in.');
      }
    };

    bootstrapGoogle();

    return () => {
      cancelled = true;
    };
  }, []);

  const logout = () => {
    GoogleSessionToken.getInstance().clearToken();
    setSession({
      status: 'Not Signed In',
      details: 'Google session cleared.'
    });
    setError(undefined);
  };

  return (
    <div className="home-container google-home">
      <h1>Sign into Flair with Google</h1>
      <div className="display-board google-board">
        {/* Google OAuth2 workflow */}
        <section className="workflow-section">
          <h2>Google workflow</h2>
          <p>
            Sign in with Google to receive a session token from the backend.
            This workflow is separate from Solana wallet sign-in.
          </p>
          <div ref={buttonRef} className="google-button-slot" />
          {!scriptReady && <p>Loading Google sign-in button...</p>}
          {error && <p className="error-text">{error}</p>}
          {session.status === 'Signed In' && (
            <div className="session-summary">
              <p><strong>Principal:</strong> {session.principal}</p>
              <p><strong>User ID:</strong> {session.userId}</p>
              <p><strong>Status:</strong> {session.status}</p>
              <p><strong>Details:</strong> {session.details}</p>
              <button onClick={logout}>Logout</button>
            </div>
          )}
        </section>

        {/* Solana workflow */}
        <section className="workflow-section workflow-divider">
          <h2>Solana workflow</h2>
          <p>
            The existing wallet-based workflow remains available on the main sign-in page.
          </p>
          <Link to="/">Go to Solana sign-in</Link>
        </section>
      </div>
    </div>
  );
}
