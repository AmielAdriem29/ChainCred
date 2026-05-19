import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth';
import type { Credential, ShareLinkRecord } from '../../../shared';
import { StatusBadge } from '../../../shared';
import { findShareLink, markShareLinkViewed } from '../../../shared/utils/shareLinks';
import { previewCredentialFile } from '../../../shared/utils/filePreview';
import styles from './PublicProfilePage.module.css';

const VAULT_KEY_PREFIX = 'chaincred_vault_';

function loadVaultCredentials(walletAddress: string): Credential[] {
  try {
    const raw = localStorage.getItem(`${VAULT_KEY_PREFIX}${walletAddress}`);
    return raw ? (JSON.parse(raw) as Credential[]) : [];
  } catch {
    return [];
  }
}

function formatShortWallet(walletAddress: string): string {
  return `${walletAddress.slice(0, 8)}…${walletAddress.slice(-6)}`;
}

interface PublicProfilePageProps {
  publicProfileWallet?: string;
}

export function PublicProfilePage({ publicProfileWallet }: PublicProfilePageProps = {}) {
  const { user } = useAuth();
  const [sharedCredentials, setSharedCredentials] = useState<Credential[]>([]);
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  const searchParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const requestedWallet = searchParams.get('wallet') ?? '';
  const requestedToken = searchParams.get('token') ?? '';
  const ownerWallet = user?.walletAddress ?? '';

  // Determine if this is a direct public profile route or a share link
  const isDirectProfileRoute = Boolean(publicProfileWallet);

  // Whether this page was opened via a share link (token present in URL)
  const isShareLinkRequest = Boolean(requestedWallet && requestedToken);

  // Read the share record from localStorage — only present in the owner's browser.
  // In a recruiter's browser this will always be null (their localStorage is empty),
  // which is NOT the same as revoked. We only use this record to detect explicit
  // revocation by the owner; absence means "unknown / cross-browser" → grant access.
  const [shareRecord, setShareRecord] = useState<ShareLinkRecord | null>(() => {
    if (!isShareLinkRequest) return null;
    return findShareLink(requestedWallet, requestedToken);
  });

  // shareDenied is true ONLY when we can positively confirm revocation:
  // the record exists in localStorage AND its status is 'revoked'.
  // If the record is null (cross-browser recruiter view), we trust the URL token.
  const shareDenied =
    isShareLinkRequest && shareRecord !== null && shareRecord.status === 'revoked';

  // Active share: either the record says 'active', or we're in a cross-browser
  // recruiter view where the record simply doesn't exist locally (trust the token).
  const isSharedView =
    isShareLinkRequest &&
    (shareRecord === null || shareRecord.status === 'active');

  const activeWallet: string = isDirectProfileRoute
    ? (publicProfileWallet ?? '')
    : isSharedView
      ? (shareRecord?.walletAddress ?? requestedWallet)
      : ownerWallet;

  // Poll for status changes (same-tab) + storage events (cross-tab, same-browser).
  // This catches both revocation AND re-granting by the owner in the same browser.
  // Cross-browser revocations are not detectable via localStorage alone.
  useEffect(() => {
    if (!isShareLinkRequest) return;

    // Poll every 500ms to catch same-tab revocations in real-time
    const interval = setInterval(() => {
      const latest = findShareLink(requestedWallet, requestedToken);
      setShareRecord(latest);
    }, 500);

    // Storage event listener for cross-tab revocations
    const handler = (e: StorageEvent) => {
      if (e.key === null || e.key.startsWith('chaincred_share_links_')) {
        const latest = findShareLink(requestedWallet, requestedToken);
        setShareRecord(latest);
      }
    };
    window.addEventListener('storage', handler);

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handler);
    };
  }, [isShareLinkRequest, requestedWallet, requestedToken]);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      if (!activeWallet) {
        if (!cancelled) setSharedCredentials([]);
        return;
      }

      const hydrated = loadVaultCredentials(activeWallet);

      if (!cancelled) {
        setSharedCredentials(hydrated.filter(item => item.status === 'verified'));
        // Only mark viewed if the link is still active
        if (shareRecord && shareRecord.status === 'active') {
          markShareLinkViewed(shareRecord.walletAddress, shareRecord.token);
        }
      }
    };

    hydrate();

    return () => {
      cancelled = true;
    };
  }, [activeWallet, isSharedView, isDirectProfileRoute, shareRecord]);

  const handleCardClick = async (credential: Credential) => {
    // Prefer IPFS — works for any viewer, not just the owner's browser
    if (credential.ipfsGatewayUrl) {
      window.open(credential.ipfsGatewayUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    // Fallback: local IndexedDB blob (only works on the owner's browser)
    if (!credential.fileKey || !credential.fileName || !credential.fileType) {
      return;
    }
    setPreviewingId(credential.id);
    try {
      await previewCredentialFile(
        activeWallet,
        credential.id,
        credential.fileName,
        credential.fileType,
      );
    } catch (error) {
      console.error('Failed to preview file:', error);
    } finally {
      setPreviewingId(null);
    }
  };

  if (shareDenied) {
    return (
      <div className={styles.page}>
        <div className={styles.watermark}>ACCESS DENIED</div>

        <div className={styles.contentArea}>
          <div className={styles.deniedCard}>
            <div className={styles.deniedTitle}>Access Denied</div>
            <p className={styles.deniedText}>
              This public profile link has been revoked or is no longer valid.
            </p>
            <p className={styles.deniedMeta}>
              {requestedWallet && <span>Wallet: {formatShortWallet(requestedWallet)}</span>}
              {requestedToken && <span>Token: {requestedToken.slice(0, 12)}…</span>}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const publicCredentials = sharedCredentials;

  // In a cross-browser recruiter view, user is null and shareRecord is null —
  // we only have requestedWallet from the URL, so fall back to the wallet address.
  const profileDisplayName =
    shareRecord?.recipientName ??
    user?.name ??
    (activeWallet ? formatShortWallet(activeWallet) : 'Student');

  const walletDisplayName = isDirectProfileRoute
    ? formatShortWallet(publicProfileWallet ?? '')
    : profileDisplayName;

  return (
    <div className={styles.page}>
      <div className={styles.watermark}>
        {isDirectProfileRoute ? 'PUBLIC PROFILE' : isSharedView ? 'PUBLIC PROFILE' : 'RECRUITER VIEW'}
      </div>

      <div className={styles.contentArea}>
        <div className={styles.banner}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="8" cy="6" r="2.5" />
            <path d="M3 13c0-2.5 2.2-4 5-4s5 1.5 5 4" />
          </svg>
          {isDirectProfileRoute
            ? 'This is a public profile view. Only verified credentials are displayed. Click any card to preview.'
            : isSharedView
              ? `Shared with ${shareRecord?.recipientName ?? 'you'} · Only verified credentials are shown.`
              : 'You are viewing your public profile as a recruiter would see it.'}
        </div>

        <div className={styles.topbar}>
          <h2 className={styles.heading}>
            {isDirectProfileRoute
              ? `${walletDisplayName} · Public Profile`
              : isSharedView
                ? `${formatShortWallet(activeWallet || requestedWallet)} · Public Profile`
                : `${user?.name ?? 'Your Profile'} · Public Profile`}
          </h2>
          {!isDirectProfileRoute && user?.email && (
            <p className={styles.profileEmail}>{user.email}</p>
          )}
        </div>

        <div className={styles.grid}>
          {publicCredentials.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>
              {isDirectProfileRoute
                ? 'No verified credentials available for this profile.'
                : isSharedView
                  ? 'No verified credentials are available for this link.'
                  : 'No verified credentials yet.'}
            </p>
          ) : (
            publicCredentials.map(cred => (
              <article
                key={cred.id}
                className={styles.publicCard}
                onClick={() => handleCardClick(cred)}
                style={{
                  cursor: (cred.ipfsGatewayUrl || cred.fileKey) ? 'pointer' : 'default',
                  opacity: previewingId === cred.id ? 0.7 : 1,
                  transition: 'opacity 0.2s',
                }}
              >
                <div className={styles.publicCardTop}>
                  <div>
                    <div className={styles.publicName}>{cred.name}</div>
                    <div className={styles.publicInst}>{cred.institution} · {cred.year}</div>
                  </div>
                  <StatusBadge status={cred.status} />
                </div>
                <div className={styles.publicMeta}>{cred.issuedDate}</div>
                {(cred.ipfsGatewayUrl || cred.fileKey) && (
                  <div style={{ marginTop: '12px', fontSize: '13px', color: 'var(--text-tertiary)' }}>
                    📎 {cred.fileName ? 'Click to view' : 'File attached'}
                  </div>
                )}
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}