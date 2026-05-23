import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../auth/context/useAuth';
import type { Credential } from '../../../shared/types';
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

function updateCredentialInStorage(
  ownerWallet: string,
  credentialId: string,
  updates: Partial<Credential>,
): void {
  const key = `${VAULT_KEY_PREFIX}${ownerWallet}`;
  const raw = localStorage.getItem(key);
  if (!raw) return;
  try {
    const credentials = JSON.parse(raw) as Credential[];
    const updated = credentials.map(c =>
      c.id === credentialId ? { ...c, ...updates } : c
    );
    localStorage.setItem(key, JSON.stringify(updated));
  } catch { /* skip */ }
}

async function submitVerificationToChain(credential: Credential, institutionName: string): Promise<string> {
  const mnemonic = import.meta.env.VITE_APP_WALLET_MNEMONIC as string;
  const blockfrostKey = import.meta.env.VITE_BLOCKFROST_API_KEY as string;
  const { MeshWallet, BlockfrostProvider, Transaction } = await import('@meshsdk/core');
  const provider = new BlockfrostProvider(blockfrostKey);
  const wallet = new MeshWallet({
    networkId: 0,
    fetcher: provider,
    submitter: provider,
    key: { type: 'mnemonic', words: mnemonic.trim().split(' ') },
  });
  const trim64 = (s: string) => s.slice(0, 64);
  const metadata = {
    credential_id: trim64(credential.id),
    credential_name: trim64(credential.name),
    institution: trim64(credential.organization),
    issued_date: trim64(credential.issuedDate),
    sha256: trim64(credential.sha256Hash ?? ''),
    owner: {
      name: trim64(credential.ownerName ?? ''),
      wallet: trim64(credential.ownerWallet ?? ''),
    },
    verified_by: {
      institution: trim64(institutionName),
      verified_at: new Date().toISOString().slice(0, 64),
    },
    ipfs_cid: trim64(credential.ipfsCid ?? ''),
  };
  const address = await wallet.getChangeAddress();
  const tx = new Transaction({ initiator: wallet })
    .sendLovelace(address, '1000000')
    .setMetadata(674, metadata);
  const unsignedTx = await tx.build();
  const signedTx = await wallet.signTx(unsignedTx);
  return await wallet.submitTx(signedTx);
}

function daysAgo(dateStr: string, now: number): string {
  try {
    const submitted = new Date(dateStr);
    if (isNaN(submitted.getTime())) return dateStr;
    const diff = Math.floor((now - submitted.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return `${diff} days ago`;
  } catch {
    return dateStr;
  }
}

type ConfirmAction = { credentials: Credential[]; type: 'approve' | 'reject' } | null;
type ApproveStep = 'idle' | 'submitting' | 'done' | 'error';
type SortField = 'name' | 'issuedDate';
type SortDir = 'asc' | 'desc';

export function InstitutionPendingPage() {
  const { user } = useAuth();
  const walletAddress = user?.walletAddress ?? null;
  const [pending, setPending] = useState<Credential[]>([]);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [approveStep, setApproveStep] = useState<ApproveStep>('idle');
  const [approveError, setApproveError] = useState('');
  const [lastTxHash, setLastTxHash] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('issuedDate');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!walletAddress) return;
    const read = () => {
      void Promise.resolve().then(() => {
        const all = getAllHolderCredentials();
        setPending(all.filter(c => c.organizationWallet === walletAddress && c.status === 'pending'));
      });
    };
    read();
    const interval = setInterval(read, 3000);
    return () => clearInterval(interval);
  }, [walletAddress]);

  const reloadPending = () => {
    const all = getAllHolderCredentials();
    setPending(all.filter(c => c.organizationWallet === walletAddress && c.status === 'pending'));
  };

  // Stats
  const [now] = useState(() => Date.now());
  const avgWaitDays = useMemo(() => {
    if (pending.length === 0) return null;
    const total = pending.reduce((sum, c) => {
      try {
        const diff = (now - new Date(c.issuedDate).getTime()) / (1000 * 60 * 60 * 24);
        return sum + (isNaN(diff) ? 0 : diff);
      } catch { return sum; }
    }, 0);
    return Math.round(total / pending.length);
  }, [pending, now]);

  // Filter + sort
  const filtered = useMemo(() => {
    let result = pending;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.ownerName ?? '').toLowerCase().includes(q)
      );
    }
    result = [...result].sort((a, b) => {
      const cmp = sortField === 'name'
        ? a.name.localeCompare(b.name)
        : a.issuedDate.localeCompare(b.issuedDate);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [pending, search, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return <span className={styles.sortIcon}>↕</span>;
    return <span className={`${styles.sortIcon} ${styles.sortActive}`}>{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  // Selection
  const allFilteredIds = filtered.map(c => c.id);
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selected.has(id));
  const someSelected = allFilteredIds.some(id => selected.has(id));

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(prev => {
        const next = new Set(prev);
        allFilteredIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelected(prev => new Set([...prev, ...allFilteredIds]));
    }
  };

  const selectedCredentials = filtered.filter(c => selected.has(c.id));

  // Confirm + submit
  const handleConfirm = async () => {
    if (!confirmAction || !walletAddress) return;
    const { credentials, type } = confirmAction;

    if (type === 'reject') {
      credentials.forEach(cred => {
        if (cred.ownerWallet) updateCredentialInStorage(cred.ownerWallet, cred.id, { status: 'rejected' });
      });
      setSelected(new Set());
      setConfirmAction(null);
      reloadPending();
      return;
    }

    setApproveStep('submitting');
    setApproveError('');

    let lastHash = '';
    try {
      for (const credential of credentials) {
        if (!credential.ownerWallet) continue;
        const hash = await submitVerificationToChain(credential, user?.organizationName ?? user?.name ?? walletAddress);
        updateCredentialInStorage(credential.ownerWallet, credential.id, {
          status: 'verified',
          txHash: hash,
          extra: undefined,
        });
        lastHash = hash;
      }
      setLastTxHash(lastHash);
      setSelected(new Set());
      setApproveStep('done');
      reloadPending();
    } catch (err) {
      console.error('Blockchain verification failed:', err);
      setApproveError(err instanceof Error ? err.message : 'Transaction failed. Please try again.');
      setApproveStep('error');
    }
  };

  const closeModal = () => {
    setConfirmAction(null);
    setApproveStep('idle');
    setApproveError('');
    setLastTxHash('');
  };

  return (
    <div className={styles.page}>
      <div className={styles.contentArea}>

        {/* Header */}
        <div className={styles.topbar}>
          <div>
            <h1 className={styles.heading}>Pending Queue</h1>
            <span className={styles.sub}>{user?.organizationName ?? user?.name}</span>
          </div>
        </div>

        {/* Stats row */}
        <div className={styles.statsRow}>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{pending.length}</span>
            <span className={styles.statLabel}>Awaiting Review</span>
          </div>
          <div className={styles.statCard}>
            <span className={`${styles.statValue} ${pending.length > 0 ? styles.statPending : ''}`}>
              {avgWaitDays !== null ? `${avgWaitDays}d` : '—'}
            </span>
            <span className={styles.statLabel}>Avg. Wait Time</span>
          </div>
          <div className={styles.statCard}>
            <span className={`${styles.statValue} ${selected.size > 0 ? styles.statSelected : ''}`}>
              {selected.size}
            </span>
            <span className={styles.statLabel}>Selected</span>
          </div>
        </div>

        {/* Controls */}
        <div className={styles.controls}>
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon}>⌕</span>
            <input
              className={styles.searchInput}
              placeholder="Search by credential name or holder…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && <button className={styles.searchClear} onClick={() => setSearch('')}>✕</button>}
          </div>

          {/* Bulk actions — only shown when something is selected */}
          {selected.size > 0 && (
            <div className={styles.bulkActions}>
              <span className={styles.bulkCount}>{selected.size} selected</span>
              <button
                className={styles.bulkApproveBtn}
                onClick={() => setConfirmAction({ credentials: selectedCredentials, type: 'approve' })}
              >
                Approve All
              </button>
              <button
                className={styles.bulkRejectBtn}
                onClick={() => setConfirmAction({ credentials: selectedCredentials, type: 'reject' })}
              >
                Reject All
              </button>
            </div>
          )}
        </div>

        <p className={styles.sectionTitle}>Awaiting Review</p>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.checkboxCol}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={allSelected}
                    ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th onClick={() => toggleSort('name')} className={styles.sortable}>
                  Credential Name {sortIcon('name')}
                </th>
                <th>Credential Holder</th>
                <th onClick={() => toggleSort('issuedDate')} className={styles.sortable}>
                  Submitted {sortIcon('issuedDate')}
                </th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className={styles.emptyCell}>
                    {search ? 'No credentials match your search.' : 'No pending credentials. When holders submit credentials to your organization, they will appear here.'}
                  </td>
                </tr>
              ) : (
                filtered.map(cred => (
                  <>
                    <tr
                      key={cred.id}
                      className={`${styles.dataRow} ${expandedId === cred.id ? styles.dataRowExpanded : ''} ${selected.has(cred.id) ? styles.dataRowSelected : ''}`}
                      onClick={() => setExpandedId(expandedId === cred.id ? null : cred.id)}
                    >
                      <td className={styles.checkboxCol} onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className={styles.checkbox}
                          checked={selected.has(cred.id)}
                          onChange={() => toggleSelect(cred.id)}
                        />
                      </td>
                      <td>
                        <span className={styles.credName}>{cred.name}</span>
                      </td>
                      <td>
                        <span className={styles.holderName}>{cred.ownerName ?? '—'}</span>
                        <span className={styles.holderWallet}>{cred.ownerWallet ?? '—'}</span>
                      </td>
                      <td className={styles.dateCell}>
                        <span className={styles.relativeDate}>{daysAgo(cred.issuedDate, now)}</span>
                        <span className={styles.absoluteDate}>{cred.issuedDate}</span>
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <div className={styles.pendingActions}>
                          <button
                            className={styles.approveBtn}
                            onClick={() => setConfirmAction({ credentials: [cred], type: 'approve' })}
                          >
                            Approve
                          </button>
                          <button
                            className={styles.rejectBtn}
                            onClick={() => setConfirmAction({ credentials: [cred], type: 'reject' })}
                          >
                            Reject
                          </button>
                        </div>
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
                            {cred.ipfsGatewayUrl && (
                              <a
                                className={styles.viewDocBtn}
                                href={cred.ipfsGatewayUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                              >
                                ↗ View Document
                              </a>
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

      {/* Confirm modal */}
      {confirmAction && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>

            {approveStep === 'submitting' && (
              <>
                <div className={styles.modalIcon}>⏳</div>
                <h2 className={styles.modalHeading}>Anchoring to Cardano…</h2>
                <p className={styles.modalBody}>
                  Submitting verification transaction{confirmAction.credentials.length > 1 ? 's' : ''} to the blockchain. This may take a few seconds.
                </p>
              </>
            )}

            {approveStep === 'done' && (
              <div className={styles.successModal}>
                <div className={styles.successIconWrap}>✓</div>
                <h2 className={styles.modalHeading}>Verified & Anchored</h2>
                <p className={styles.modalBody} style={{ marginBottom: 0 }}>
                  The credential{confirmAction.credentials.length > 1 ? 's have' : ' has'} been permanently recorded on the Cardano Preview testnet.
                </p>
                {lastTxHash && (
                  <>
                    <div className={styles.txRow}>
                      <span className={styles.txLabel}>TX</span>
                      <span className={styles.txValue}>{lastTxHash.slice(0, 20)}…{lastTxHash.slice(-8)}</span>
                    </div>
                    <a
                      className={styles.explorerLink}
                      href={`https://preview.cardanoscan.io/transaction/${lastTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View on Cardanoscan ↗
                    </a>
                  </>
                )}
                <button className={styles.successDoneBtn} onClick={closeModal}>Done</button>
              </div>
            )}

            {approveStep === 'error' && (
              <>
                <div className={styles.modalIcon}>✕</div>
                <h2 className={styles.modalHeading}>Transaction Failed</h2>
                <p className={styles.modalBody}>{approveError}</p>
                <div className={styles.modalActions}>
                  <button className={styles.cancelBtn} onClick={closeModal}>Cancel</button>
                  <button className={styles.confirmApproveBtn} onClick={handleConfirm}>Retry</button>
                </div>
              </>
            )}

            {approveStep === 'idle' && (
              <>
                <div className={styles.modalIcon}>
                  {confirmAction.type === 'approve' ? '✓' : '✕'}
                </div>
                <h2 className={styles.modalHeading}>
                  {confirmAction.type === 'approve' ? 'Approve Credential?' : 'Reject Credential?'}
                  {confirmAction.credentials.length > 1 ? ` (${confirmAction.credentials.length})` : ''}
                </h2>
                <p className={styles.modalBody}>
                  {confirmAction.credentials.length === 1 ? (
                    <>
                      You are about to {confirmAction.type}{' '}
                      <strong>{confirmAction.credentials[0].name}</strong> submitted by{' '}
                      <strong>{confirmAction.credentials[0].ownerName ?? 'this holder'}</strong>.{' '}
                    </>
                  ) : (
                    <>You are about to {confirmAction.type} <strong>{confirmAction.credentials.length} credentials</strong>. </>
                  )}
                  {confirmAction.type === 'approve'
                    ? 'This will submit a transaction to Cardano and permanently record the verification on-chain.'
                    : 'This action cannot be undone.'}
                </p>
                <div className={styles.modalActions}>
                  <button className={styles.cancelBtn} onClick={closeModal}>Cancel</button>
                  <button
                    className={confirmAction.type === 'approve' ? styles.confirmApproveBtn : styles.confirmRevokeBtn}
                    onClick={handleConfirm}
                  >
                    {confirmAction.type === 'approve' ? 'Yes, Approve & Anchor' : 'Yes, Reject'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}