export interface VerifyTokenPayload {
  credentialId: string;
  credentialName: string;
  institution: string;
  issuedDate: string;
  sha256Hash: string;
  ownerName: string;
  ownerWallet: string;
  issuedAt: number; 
}

export function encodeVerifyToken(payload: VerifyTokenPayload): string {
  const json = JSON.stringify(payload);
  return btoa(encodeURIComponent(json))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function decodeVerifyToken(token: string): VerifyTokenPayload | null {
  try {
    const base64 = token.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(atob(base64));
    return JSON.parse(json) as VerifyTokenPayload;
  } catch {
    return null;
  }
}