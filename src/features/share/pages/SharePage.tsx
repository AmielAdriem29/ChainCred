import { useCallback, useEffect, useState, useMemo } from 'react';
import { useCredentials } from '../../credentials/context/useCredentials';
import type { ShareLinkRecord } from '../../../shared/types/index.ts';
import { StatusBadge } from '../../../shared/components/ui/StatusBadge';
import { Toggle } from '../../../shared/components/ui/Toggle';
import { useModal } from '../../../shared/hooks/useModal';
import { ShareModal } from "../../vault/components/ShareModal";
import { loadShareLinks, setShareLinkStatus, createShareUrl } from '../../../shared/utils/shareLinks';
import styles from './SharePage.module.css';
import { TOAST_DURATION } from '../../../constants/timings';

function formatWalletAddress(walletAddress: string): string {
  if (walletAddress.length <= 14) return walletAddress;
  return `${walletAddress.slice(0, 8)}…${walletAddress.slice(-6)}`;
}

export function SharePage() {
  const { wallet } = useCredentials();
  const shareModal = useModal();
  const [permissions, setPermissions] = useState<ShareLinkRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState('');

  const refreshPermissions = useCallback(() => {
    if (!wallet) {
      setPermissions([]);
      return;
    }
    setPermissions(loadShareLinks(wallet));
  }, [wallet]);

  useEffect(() => {
    if (!wallet) {
      void Promise.resolve().then(() => setPermissions([]));
      return;
    }
    void Promise.resolve().then(() => setPermissions(loadShareLinks(wallet)));
  }, [wallet]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (!wallet) return;
      if (event.key === null || event.key.startsWith('chaincred_share_links_')) {
        void Promise.resolve().then(() => setPermissions(loadShareLinks(wallet)));
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [wallet]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (!wallet) return;
      if (event.key === null || event.key.startsWith('chaincred_share_links_')) {
        refreshPermissions();
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [wallet, refreshPermissions]);

  const toggle = (id: string, val: boolean) => {
    if (!wallet) return;
    const status = val ? 'active' : 'revoked';
    setPermissions(prev => prev.map(p => p.token !== id ? p : { ...p, status }));
    setShareLinkStatus(wallet, id, status);
  };

  const handleCopy = async (p: ShareLinkRecord) => {
    if (!wallet) return;
    const url = createShareUrl(wallet, p.token);
    await navigator.clipboard.writeText(url);
    setToast('Link copied! You can manage access anytime from the Share Center.');
    setTimeout(() => setToast(''), TOAST_DURATION);
  };

  const handleModalSuccess = () => {
    refreshPermissions();
  };

  const totalLinks = permissions.length;
  const activeLinks = permissions.filter(p => p.status === 'active').length;

  const filteredPermissions = useMemo(() => {
    return permissions.filter(p =>
      p.recipientName.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [permissions, searchQuery]);

  return (
    <div className={styles.page}>
      {toast && (
        <div className={styles.toast}>
          <span>{toast}</span>
          <button className={styles.toastClose} onClick={() => setToast('')}>✕</button>
        </div>
      )}

      <div className={styles.rowOne}>
        <div className={styles.headerArea}>
          <h2 className={styles.heading}>Share Center</h2>
        </div>
        <button className={styles.primaryBtn} onClick={shareModal.open}>
          {/* New SVG: share portfolio icon (three circles + connecting lines) */}
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="4" r="2" />
            <circle cx="4" cy="8" r="2" />
            <circle cx="12" cy="12" r="2" />
            <path d="M6 7l4-2M6 9l4 2" />
          </svg>
          Generate Link
        </button>
      </div>

      <div className={styles.rowTwo}>
        <div className={styles.statsPanel}>
          <div className={styles.stat}>
            <div className={styles.statLabel}>Total Links</div>
            <div className={styles.statValue}>{totalLinks}</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>Active Links</div>
            <div className={`${styles.statValue} ${styles.blueTheme}`}>{activeLinks}</div>
          </div>
        </div>

        <div className={styles.searchPanel}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search by recipient name..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.rowThree}>
        <div className={styles.sectionTitle}>Active access permissions</div>
        <div className={styles.sectionCount}>
          {filteredPermissions.length} {filteredPermissions.length === 1 ? 'link' : 'links'} found
        </div>
      </div>

      <div className={styles.tableCard}>
        {!wallet ? (
          <div className={styles.emptyState}>
            Connect your wallet to manage public profile access.
          </div>
        ) : filteredPermissions.length === 0 ? (
          <div className={styles.emptyState}>
            {permissions.length === 0 
              ? 'No share links created yet. Use "Generate Link" above to build one.' 
              : 'No matches found for your recipient name search.'}
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Recipient</th>
                  <th>Date Granted</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'center' }}>Access</th>
                  <th style={{ textAlign: 'center' }}>Copy Link</th>
                </tr>
              </thead>
              <tbody>
                {filteredPermissions.map(p => (
                  <tr key={p.token}>
                    <td>
                      <strong className={styles.name}>{p.recipientName}</strong>
                      <span className={styles.wallet} title={p.walletAddress}>
                        {formatWalletAddress(p.walletAddress)}
                      </span>
                    </td>
                    <td className={styles.dateCell}>
                      {new Date(p.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </td>
                    <td><StatusBadge status={p.status} /></td>
                    <td className={styles.toggleCell}>
                      <div className={styles.toggleWrapper}>
                        <Toggle enabled={p.status === 'active'} onChange={val => toggle(p.token, val)} />
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button className={styles.copyBtn} onClick={() => handleCopy(p)}>
                        Copy
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className={styles.hint}>Revoking access immediately invalidates the link for that recipient.</p>

      <ShareModal
        key={shareModal.isOpen ? 'open' : 'closed'}
        isOpen={shareModal.isOpen}
        onClose={shareModal.close}
        onShared={handleModalSuccess}
      />
    </div>
  );
}