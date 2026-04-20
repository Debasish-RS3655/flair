const apiUrl = import.meta.env.VITE_API_URL;
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const googleScriptId = 'google-identity-services-script';

type GoogleCredentialResponse = {
  credential: string;
};

type GoogleBackendResponse = {
  success: boolean;
  data?: {
    sessionToken: string;
    principal: string;
    userId: string;
  };
  error?: string;
};

type GoogleSessionData = {
  sessionToken: string;
  principal: string;
  userId: string;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: GoogleCredentialResponse) => void;
          }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
          prompt: () => void;
        };
      };
    };
  }
}

export class GoogleSessionToken {
  private constructor() {}
  private static instance: GoogleSessionToken;
  private key = 'googleAuthToken';

  static getInstance(): GoogleSessionToken {
    if (!GoogleSessionToken.instance) {
      GoogleSessionToken.instance = new GoogleSessionToken();
    }
    return GoogleSessionToken.instance;
  }

  getToken(): string | null {
    return localStorage.getItem(this.key);
  }

  setToken(token: string): void {
    localStorage.setItem(this.key, token);
  }

  clearToken(): void {
    localStorage.removeItem(this.key);
  }
}

export async function loadGoogleIdentityScript(): Promise<void> {
  if (window.google) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(googleScriptId) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = googleScriptId;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services.'));
    document.head.appendChild(script);
  });
}

export async function exchangeGoogleCredential(credential: string): Promise<GoogleSessionData> {
  const response = await fetch(apiUrl + '/auth/signin/google', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ idToken: credential }),
  });

  const payload = (await response.json()) as GoogleBackendResponse;
  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error || 'Google sign-in failed.');
  }

  return payload.data;
}

export function getGoogleClientId(): string {
  if (!googleClientId) {
    throw new Error('VITE_GOOGLE_CLIENT_ID is not configured.');
  }
  return googleClientId;
}
