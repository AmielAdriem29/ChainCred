import { useState } from 'react';
import { useCredentials } from '../../credentials/context/useCredentials';
import { CredentialCard } from '../components/CredentialCard';
import { ShareModal } from '../components/ShareModal';
import { IssuanceModal } from '../components/IssuanceModal';
import { useModal } from '../../../shared/hooks/useModal';
import styles from './VaultPage.module.css';
import { TOAST_DURATION } from '../../../constants/timings';

export function VaultPage() {
  const { credentials, isLoading } = useCredentials();
  const shareModal = useModal();
  const issuanceModal = useModal();
  const [showSharedToast, setShowSharedToast] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'verified' | 'pending'>('all');

  const verified = credentials.filter(c => c.status === 'verified').length;
  const pending  = credentials.filter(c => c.status === 'pending').length;

  const handleShared = () => {
    setShowSharedToast(true);
    setTimeout(() => setShowSharedToast(false), TOAST_DURATION);
  };

  const filteredCredentials = credentials.filter(cred => {
    const matchesSearch = 
      cred.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cred.organization.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || cred.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className={styles.page}>
      {showSharedToast && <div className={styles.toast}>Share link copied to clipboard!</div>}

      <div className={styles.rowOne}>
        <div className={styles.headerArea}>
          <h2 className={styles.heading}>My Credential Vault</h2>
        </div>
        <button className={styles.shareBtn} onClick={shareModal.open}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="4" r="2" />
            <circle cx="4" cy="8" r="2" />
            <circle cx="12" cy="12" r="2" />
            <path d="M6 7l4-2M6 9l4 2" />
          </svg>
          Share Portfolio
        </button>
      </div>

      <div className={styles.rowTwo}>
        <div className={styles.statsGroup}>
          <div className={styles.stat}>
            <div className={styles.statLabel}>Total credentials</div>
            <div className={styles.statValue}>{credentials.length}</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>Verified</div>
            <div className={`${styles.statValue} ${styles.green}`}>{verified}</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>Awaiting review</div>
            <div className={styles.statValue} style={{ color: pending > 0 ? 'var(--status-pending-text)' : undefined }}>
              {pending}
            </div>
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
          <div className={`${styles.filterToggleGroup} ${styles[`filterActive-${statusFilter}`]}`}>
            <button className={`${styles.filterTab} ${statusFilter === 'all' ? styles.activeTab : ''}`} onClick={() => setStatusFilter('all')}>All</button>
            <button className={`${styles.filterTab} ${statusFilter === 'verified' ? styles.activeTab : ''}`} onClick={() => setStatusFilter('verified')}>Verified</button>
            <button className={`${styles.filterTab} ${statusFilter === 'pending' ? styles.activeTab : ''}`} onClick={() => setStatusFilter('pending')}>Pending</button>
          </div>
        </div>
      </div>

      <div className={styles.rowThree}>
        <div className={styles.sectionTitle}>Diplomas & Certificates</div>
        <button className={styles.uploadBtn} onClick={issuanceModal.open}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M8 3v10M3 8h10" strokeLinecap="round"/>
          </svg>
          Upload Credential
        </button>
      </div>

      {isLoading ? (
        <div className={styles.loadingState}>Loading credentials…</div>
      ) : filteredCredentials.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 4h16v16H4z" />
              <path d="M8 8h8M8 12h6M8 16h4" />
            </svg>
          </div>
          <div className={styles.emptyTitle}>
            {credentials.length === 0 ? 'No credentials yet' : 'No matches found'}
          </div>
          <div className={styles.emptyDescription}>
            {credentials.length === 0
              ? 'Upload your first credential using the button above.'
              : 'Try adjusting your search or filter settings.'}
          </div>
        </div>
      ) : (
        <div className={styles.grid}>
          {filteredCredentials.map(cred => <CredentialCard key={cred.id} credential={cred} />)}
        </div>
      )}

      <ShareModal key={shareModal.isOpen ? 'open' : 'closed'} isOpen={shareModal.isOpen} onClose={shareModal.close} onShared={handleShared} />
      <IssuanceModal isOpen={issuanceModal.isOpen} onClose={issuanceModal.close} />
    </div>
  );
}