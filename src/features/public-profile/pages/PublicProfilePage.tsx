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
  const [allCredentials, setAllCredentials] = useState<Credential[]>([]);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const searchParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const requestedWallet = searchParams.get('wallet') ?? '';
  const requestedToken = searchParams.get('token') ?? '';
  const ownerWallet = user?.walletAddress ?? '';

  const isDirectProfileRoute = Boolean(publicProfileWallet);
  const isShareLinkRequest = Boolean(requestedWallet && requestedToken);

  const [shareRecord, setShareRecord] = useState<ShareLinkRecord | null>(() => {
    if (!isShareLinkRequest) return null;
    return findShareLink(requestedWallet, requestedToken);
  });

  const shareDenied = isShareLinkRequest && shareRecord !== null && shareRecord.status === 'revoked';
  const isSharedView = isShareLinkRequest && (shareRecord === null || shareRecord.status === 'active');

  const activeWallet: string = isDirectProfileRoute
    ? (publicProfileWallet ?? '')
    : isSharedView
      ? (shareRecord?.walletAddress ?? requestedWallet)
      : ownerWallet;

  useEffect(() => {
    if (!isShareLinkRequest) return;
    const interval = setInterval(() => {
      const latest = findShareLink(requestedWallet, requestedToken);
      setShareRecord(latest);
    }, 500);
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
        if (!cancelled) setAllCredentials([]);
        return;
      }
      const hydrated = loadVaultCredentials(activeWallet);
      if (!cancelled) {
        setAllCredentials(hydrated);
        if (shareRecord && shareRecord.status === 'active') {
          markShareLinkViewed(shareRecord.walletAddress, shareRecord.token);
        }
      }
    };
    hydrate();
    return () => { cancelled = true; };
  }, [activeWallet, isSharedView, isDirectProfileRoute, shareRecord]);

  const handleCardClick = async (credential: Credential) => {
    if (credential.ipfsGatewayUrl) {
      window.open(credential.ipfsGatewayUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    if (!credential.fileKey || !credential.fileName || !credential.fileType) return;
    setPreviewingId(credential.id);
    try {
      await previewCredentialFile(activeWallet, credential.id, credential.fileName, credential.fileType);
    } catch (error) {
      console.error('Failed to preview file:', error);
    } finally {
      setPreviewingId(null);
    }
  };

  const verifiedCount = allCredentials.filter(c => c.status === 'verified').length;
  const uniqueOrganizations = useMemo(() => {
    const orgSet = new Set(allCredentials.map(c => c.organization));
    return orgSet.size;
  }, [allCredentials]);

  const filteredCredentials = useMemo(() => {
    if (!searchQuery.trim()) return allCredentials;
    const query = searchQuery.toLowerCase();
    return allCredentials.filter(
      cred => cred.name.toLowerCase().includes(query) || cred.organization.toLowerCase().includes(query)
    );
  }, [allCredentials, searchQuery]);

  if (shareDenied) {
    return (
      <div className={styles.page}>
        <div className={styles.watermark}>ACCESS DENIED</div>
        <div className={styles.contentArea}>
          <div className={styles.deniedCard}>
            <div className={styles.deniedTitle}>Access Denied</div>
            <p className={styles.deniedText}>This public profile link has been revoked or is no longer valid.</p>
            <p className={styles.deniedMeta}>
              {requestedWallet && <span>Wallet: {formatShortWallet(requestedWallet)}</span>}
              {requestedToken && <span>Token: {requestedToken.slice(0, 12)}…</span>}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const profileDisplayName = shareRecord?.recipientName ?? user?.name ?? (activeWallet ? formatShortWallet(activeWallet) : 'Student');
  const walletDisplayName = isDirectProfileRoute ? formatShortWallet(publicProfileWallet ?? '') : profileDisplayName;
  const bannerText = isDirectProfileRoute
    ? 'Public profile – all credentials are displayed (pending ones are marked)'
    : isSharedView
      ? `Shared with ${shareRecord?.recipientName ?? 'you'} – all credentials are shown`
      : 'Recruiter preview – what employers see when you share your profile';

  return (
    <div className={styles.page}>
      <div className={styles.watermark}>
        {isDirectProfileRoute ? 'PUBLIC PROFILE' : isSharedView ? 'PUBLIC PROFILE' : 'RECRUITER VIEW'}
      </div>

      <div className={styles.contentArea}>
        <div className={styles.rowOne}>
          <div className={styles.headerArea}>
            <h2 className={styles.heading}>
              {isDirectProfileRoute
                ? `${walletDisplayName} · Public Profile`
                : isSharedView
                  ? `${formatShortWallet(activeWallet || requestedWallet)} · Public Profile`
                  : `${user?.name ?? 'Your Profile'} · Public Profile`}
            </h2>
            {!isDirectProfileRoute && user?.email && <p className={styles.profileEmail}>{user.email}</p>}
          </div>
          <div className={styles.bannerPill}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="8" cy="6" r="2.5" />
              <path d="M3 13c0-2.5 2.2-4 5-4s5 1.5 5 4" />
            </svg>
            {bannerText}
          </div>
        </div>

        <div className={styles.rowTwo}>
          <div className={styles.statsPanel}>
            <div className={styles.stat}>
              <div className={styles.statLabel}>Verified Credentials</div>
              <div className={styles.statValue}>{verifiedCount}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statLabel}>Organizations</div>
              <div className={styles.statValue}>{uniqueOrganizations}</div>
            </div>
          </div>
          <div className={styles.searchPanel}>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search by name or organization..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className={styles.rowThree}>
          <div className={styles.sectionTitle}>Credentials</div>
          <div className={styles.sectionCount}>
            {filteredCredentials.length} {filteredCredentials.length === 1 ? 'credential' : 'credentials'} found
          </div>
        </div>

        <div className={styles.grid}>
          {filteredCredentials.length === 0 ? (
            <div className={styles.emptyState}>
              {allCredentials.length === 0 ? 'No credentials available for this profile.' : 'No matches found for your search.'}
            </div>
          ) : (
            filteredCredentials.map(cred => (
              <article
                key={cred.id}
                className={styles.publicCard}
                onClick={() => handleCardClick(cred)}
                style={{
                  cursor: (cred.ipfsGatewayUrl || cred.fileKey) ? 'pointer' : 'default',
                  opacity: previewingId === cred.id ? 0.7 : 1,
                }}
              >
                <div
                  className={styles.cardLogo}
                  style={{
                    background: cred.logoColor || '#1a2c4e',
                    color: cred.logoTextColor || '#ffffff',
                  }}
                >
                  {cred.logoText || cred.organization.slice(0, 3).toUpperCase()}
                </div>
                <div className={styles.cardContent}>
                  <div className={styles.cardHeader}>
                    <div>
                      <div className={styles.cardTitle}>{cred.name}</div>
                      <div className={styles.cardSubtitle}>{cred.organization} · {cred.year}</div>
                    </div>
                    <StatusBadge status={cred.status} />
                  </div>
                  <div className={styles.cardMeta}>{cred.issuedDate}</div>
                  {(cred.ipfsGatewayUrl || cred.fileKey) && (
                    <div className={styles.fileHint}>📎 {cred.fileName ? 'Click to view' : 'File attached'}</div>
                  )}
                </div>
              </article>
            ))
          )}
        </div>

        <footer className={styles.footer}>
          Verified on Cardano · <span className={styles.brand}>ChainCred</span>
        </footer>
      </div>
    </div>
  );
}