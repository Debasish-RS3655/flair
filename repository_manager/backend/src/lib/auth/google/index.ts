type GoogleTokenInfo = {
    sub?: string;
    email?: string;
    name?: string;
    picture?: string;
    aud?: string;
};


// this endpoint is constant therefore we can hardcode it without needing to put it in env vars
const GOOGLE_TOKENINFO_ENDPOINT = 'https://oauth2.googleapis.com/tokeninfo';

export async function verifyGoogleIdToken(idToken: string): Promise<Required<Pick<GoogleTokenInfo, 'sub'>> & GoogleTokenInfo> {
    const response = await fetch(`${GOOGLE_TOKENINFO_ENDPOINT}?id_token=${encodeURIComponent(idToken)}`);
    if (!response.ok) {
        throw new Error('Invalid Google ID token.');
    }

    const payload = await response.json() as GoogleTokenInfo;
    if (!payload.sub) {
        throw new Error('Google token payload missing subject.');
    }

    const expectedAudience = process.env.GOOGLE_CLIENT_ID;
    if (expectedAudience && payload.aud !== expectedAudience) {
        throw new Error('Google token audience mismatch.');
    }

    return payload as Required<Pick<GoogleTokenInfo, 'sub'>> & GoogleTokenInfo;
}
