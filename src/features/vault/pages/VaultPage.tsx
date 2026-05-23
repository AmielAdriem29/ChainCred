import { useState } from 'react';
import { useCredentials } from '../../credentials/context/useCredentials';
import { CredentialCard } from '../components/CredentialCard';
import { ShareModal } from '../components/ShareModal';
import { IssuanceModal } from '../components/IssuanceModal';
import { useModal } from '../../../shared/hooks/useModal';
import styles from './VaultPage.module.css';

export function VaultPage() {
  const { credentials, isLoading } = useCredentials();
  const shareModal = useModal();
  const issuanceModal = useModal();
  const [showSharedToast, setShowSharedToast] = useState(false);

  // Search and Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'verified' | 'pending'>('all');

  const verified = credentials.filter(c => c.status === 'verified').length;
  const pending  = credentials.filter(c => c.status === 'pending').length;

  const handleShared = () => {
    setShowSharedToast(true);
    setTimeout(() => setShowSharedToast(false), 4000);
  };

  const filteredCredentials = credentials.filter(cred => {
    const matchesSearch = 
      cred.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cred.institution.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = 
      statusFilter === 'all' || cred.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className={styles.page}>
      {showSharedToast && (
        <div className={styles.toast}>Share link copied to clipboard!</div>
      )}

      {/* ── ROW 1: Title Bar + Top Right Share Button ── */}
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

      {/* ── ROW 2: Slim Stats + Search Filter Panel Row Block ── */}
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
            <div
              className={styles.statValue}
              style={{ color: pending > 0 ? 'var(--status-pending-text)' : undefined }}
            >
              {pending}
            </div>
          </div>
        </div>

        <div className={styles.searchPanel}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search by name or institution..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          
          {/* Dynamic layout state identifier class string appended here for CSS track animations */}
          <div className={`${styles.filterToggleGroup} ${styles[`filterActive-${statusFilter}`]}`}>
            <button 
              className={`${styles.filterTab} ${statusFilter === 'all' ? styles.activeTab : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              All
            </button>
            <button 
              className={`${styles.filterTab} ${statusFilter === 'verified' ? styles.activeTab : ''}`}
              onClick={() => setStatusFilter('verified')}
            >
              Verified
            </button>
            <button 
              className={`${styles.filterTab} ${statusFilter === 'pending' ? styles.activeTab : ''}`}
              onClick={() => setStatusFilter('pending')}
            >
              Pending
            </button>
          </div>
        </div>
      </div>

      {/* ── ROW 3: Dynamic Section Header + Right Aligned Upload Button ── */}
      <div className={styles.rowThree}>
        <div className={styles.sectionTitle}>Diplomas &amp; Certificates</div>
        <button className={styles.uploadBtn} onClick={issuanceModal.open}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M8 3v10M3 8h10" strokeLinecap="round"/>
          </svg>
          Upload Credential
        </button>
      </div>

      {/* ── ROW 4: Grid Layout Content Tier ── */}
      {isLoading ? (
        <div style={{ color: 'var(--text-tertiary)', fontSize: '16px', padding: '24px 0' }}>
          Loading credentials…
        </div>
      ) : filteredCredentials.length === 0 ? (
        <div style={{ color: 'var(--text-tertiary)', fontSize: '16px', padding: '48px 0', textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>📂</div>
          <div>
            {credentials.length === 0 
              ? "No credentials yet. Upload your first one above." 
              : "No matches found for your active search layout filters."}
          </div>
        </div>
      ) : (
        <div className={styles.grid}>
          {filteredCredentials.map(cred => (
            <CredentialCard key={cred.id} credential={cred} />
          ))}
        </div>
      )}

      <ShareModal
        key={shareModal.isOpen ? 'open' : 'closed'}
        isOpen={shareModal.isOpen}
        onClose={shareModal.close}
        onShared={handleShared}
      />
      <IssuanceModal isOpen={issuanceModal.isOpen} onClose={issuanceModal.close} />
    </div>
  );
}