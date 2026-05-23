import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../auth/context/useAuth';
import type { Credential } from '../../../shared/types';
import { IssueCredentialModal } from '../components/IssueCredentialModal';
import styles from './OrganizationPages.module.css';

const VAULT_KEY_PREFIX = 'chaincred_vault_';

function getAllHolderCredentials(): Credential[] {
  const all: Credential[] = [];
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(VAULT_KEY_PREFIX)) keys.push(key);
  }
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Credential[];
      if (Array.isArray(parsed)) all.push(...parsed);
    } catch { /* skip malformed */ }
  }
  return all;
}

function updateCredentialStatus(ownerWallet: string, credentialId: string, status: Credential['status']): void {
  const key = `${VAULT_KEY_PREFIX}${ownerWallet}`;
  const raw = localStorage.getItem(key);
  if (!raw) return;
  try {
    const credentials = JSON.parse(raw) as Credential[];
    const updated = credentials.map(c => c.id === credentialId ? { ...c, status } : c);
    localStorage.setItem(key, JSON.stringify(updated));
  } catch { /* skip */ }
}

type SortField = 'name' | 'issuedDate' | 'status';
type SortDir = 'asc' | 'desc';

export function InstitutionDashboardPage() {
  const { user } = useAuth();
  const walletAddress = user?.walletAddress ?? null;
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [revokeTarget, setRevokeTarget] = useState<Credential | null>(null);
  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'verified' | 'revoked'>('all');
  const [sortField, setSortField] = useState<SortField>('issuedDate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => {
    if (!walletAddress) return;
    const refresh = () => {
      const all = getAllHolderCredentials();
      setCredentials(
        all.filter(c =>
          c.organizationWallet === walletAddress &&
          (c.status === 'verified' || c.status === 'revoked')
        )
      );
    };
    void Promise.resolve().then(refresh);
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [walletAddress, refreshTick]);

  const totalVerified = credentials.filter(c => c.status === 'verified').length;
  const totalRevoked = credentials.filter(c => c.status === 'revoked').length;

  const filtered = useMemo(() => {
    let result = credentials;

    if (statusFilter !== 'all') {
      result = result.filter(c => c.status === statusFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.ownerName ?? '').toLowerCase().includes(q)
      );
    }

    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortField === 'status') cmp = a.status.localeCompare(b.status);
      else if (sortField === 'issuedDate') cmp = a.issuedDate.localeCompare(b.issuedDate);
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [credentials, search, statusFilter, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return <span className={styles.sortIcon}>↕</span>;
    return <span className={`${styles.sortIcon} ${styles.sortActive}`}>{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  const handleRevokeConfirm = () => {
    if (!revokeTarget?.ownerWallet) return;
    updateCredentialStatus(revokeTarget.ownerWallet, revokeTarget.id, 'revoked');
    setRevokeTarget(null);
    setRefreshTick(t => t + 1);
  };

  const handleIssueModalClose = () => {
    setIssueModalOpen(false);
    setRefreshTick(t => t + 1);
  };

  return (
    <div className={styles.page}>
      <div className={styles.contentArea}>

        {/* Header */}
        <div className={styles.topbar}>
          <div>
            <h1 className={styles.heading}>Dashboard</h1>
            <span className={styles.sub}>{user?.organizationName ?? user?.name}</span>
          </div>
          <button className={styles.issueBtn} onClick={() => setIssueModalOpen(true)}>
            + Issue Credential
          </button>
        </div>

        {/* Stats row */}
        <div className={styles.statsRow}>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{credentials.length}</span>
            <span className={styles.statLabel}>Total Issued</span>
          </div>
          <div className={styles.statCard}>
            <span className={`${styles.statValue} ${styles.statVerified}`}>{totalVerified}</span>
            <span className={styles.statLabel}>Verified</span>
          </div>
          <div className={styles.statCard}>
            <span className={`${styles.statValue} ${styles.statRevoked}`}>{totalRevoked}</span>
            <span className={styles.statLabel}>Revoked</span>
          </div>
        </div>

        {/* Controls: search + filter */}
        <div className={styles.controls}>
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon}>⌕</span>
            <input
              className={styles.searchInput}
              placeholder="Search by credential name or holder…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className={styles.searchClear} onClick={() => setSearch('')}>✕</button>
            )}
          </div>
          <div className={styles.filterBtns}>
            {(['all', 'verified', 'revoked'] as const).map(f => (
              <button
                key={f}
                className={`${styles.filterBtn} ${statusFilter === f ? styles.filterBtnActive : ''}`}
                onClick={() => setStatusFilter(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <p className={styles.sectionTitle}>Issued Credentials</p>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th onClick={() => toggleSort('name')} className={styles.sortable}>
                  Credential Name {sortIcon('name')}
                </th>
                <th>Credential Holder</th>
                <th onClick={() => toggleSort('issuedDate')} className={styles.sortable}>
                  Issued Date {sortIcon('issuedDate')}
                </th>
                <th onClick={() => toggleSort('status')} className={styles.sortable}>
                  Status {sortIcon('status')}
                </th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className={styles.emptyCell}>
                    {search || statusFilter !== 'all' ? 'No credentials match your search.' : 'No verified or revoked credentials yet.'}
                  </td>
                </tr>
              ) : (
                filtered.map(cred => (
                  <>
                    <tr
                      key={cred.id}
                      className={`${styles.dataRow} ${expandedId === cred.id ? styles.dataRowExpanded : ''}`}
                      onClick={() => setExpandedId(expandedId === cred.id ? null : cred.id)}
                    >
                      <td>
                        <span className={styles.credName}>{cred.name}</span>
                      </td>
                      <td>
                        <span className={styles.holderName}>{cred.ownerName ?? '—'}</span>
                        <span className={styles.holderWallet}>{cred.ownerWallet ?? '—'}</span>
                      </td>
                      <td className={styles.dateCell}>{cred.issuedDate}</td>
                      <td>
                        <span className={`${styles.badge} ${styles[cred.status]}`}>
                          {cred.status.charAt(0).toUpperCase() + cred.status.slice(1)}
                        </span>
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        {cred.status !== 'revoked' ? (
                          <button className={styles.revokeBtn} onClick={() => setRevokeTarget(cred)}>
                            Revoke
                          </button>
                        ) : (
                          <span className={styles.revokedLabel}>—</span>
                        )}
                      </td>
                    </tr>
                    {expandedId === cred.id && (
                      <tr key={`${cred.id}-detail`} className={styles.expandedRow}>
                        <td colSpan={5} className={styles.expandedCell}>
                          <div className={styles.expandedContent}>
                            {cred.sha256Hash && (
                              <div className={styles.detailItem}>
                                <span className={styles.detailLabel}>SHA-256</span>
                                <span className={styles.detailValue}>{cred.sha256Hash}</span>
                              </div>
                            )}
                            {cred.txHash && (
                              <div className={styles.detailItem}>
                                <span className={styles.detailLabel}>TX Hash</span>
                                {cred.txHash.startsWith('sha256:') ? (
                                  <span className={styles.detailValue}>{cred.txHash}</span>
                                ) : (
                                  <a
                                    className={styles.detailLink}
                                    href={`https://preview.cardanoscan.io/transaction/${cred.txHash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={e => e.stopPropagation()}
                                  >
                                    {cred.txHash.slice(0, 16)}…{cred.txHash.slice(-8)} ↗
                                  </a>
                                )}
                              </div>
                            )}
                            {cred.ipfsCid && (
                              <div className={styles.detailItem}>
                                <span className={styles.detailLabel}>IPFS</span>
                                <a
                                  className={styles.detailLink}
                                  href={`https://ipfs.io/ipfs/${cred.ipfsCid}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                >
                                  {cred.ipfsCid.slice(0, 16)}…{cred.ipfsCid.slice(-8)} ↗
                                </a>
                              </div>
                            )}
                            {cred.fileName && (
                              <div className={styles.detailItem}>
                                <span className={styles.detailLabel}>File</span>
                                <span className={styles.detailValue}>{cred.fileName}</span>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Revoke modal */}
      {revokeTarget && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalIcon}>⚠</div>
            <h2 className={styles.modalHeading}>Revoke Credential?</h2>
            <p className={styles.modalBody}>
              You are about to revoke <strong>{revokeTarget.name}</strong> issued to{' '}
              <strong>{revokeTarget.ownerName ?? 'this holder'}</strong>. This action will be recorded on-chain and cannot be undone.
            </p>
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setRevokeTarget(null)}>Cancel</button>
              <button className={styles.confirmRevokeBtn} onClick={handleRevokeConfirm}>Yes, Revoke</button>
            </div>
          </div>
        </div>
      )}

      <IssueCredentialModal isOpen={issueModalOpen} onClose={handleIssueModalClose} />
    </div>
  );
}