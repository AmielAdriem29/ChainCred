import { useState, useEffect } from 'react';
import { useAuth } from '../../auth/context/useAuth';
import type { Credential } from '../../../shared/types';
import styles from './InstitutionPages.module.css';

const VAULT_KEY_PREFIX = 'chaincred_vault_';

function getAllHolderCredentials(): Credential[] {
  const all: Credential[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(VAULT_KEY_PREFIX)) continue;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Credential[];
      if (Array.isArray(parsed)) all.push(...parsed);
    } catch {
      // skip malformed entries
    }
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
  } catch {
    // skip malformed entries
  }
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
    key: {
      type: 'mnemonic',
      words: mnemonic.trim().split(' '),
    },
  });

  const trim64 = (s: string) => s.slice(0, 64);

  const metadata = {
    credential_id: trim64(credential.id),
    credential_name: trim64(credential.name),
    institution: trim64(credential.institution),
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
  const hash = await wallet.submitTx(signedTx);

  return hash;
}

type ConfirmAction = { credential: Credential; type: 'approve' | 'reject' } | null;
type ApproveStep = 'idle' | 'submitting' | 'done' | 'error';

export function InstitutionPendingPage() {
  const { user } = useAuth();
  const walletAddress = user?.walletAddress ?? null;
  const [pending, setPending] = useState<Credential[]>([]);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [approveStep, setApproveStep] = useState<ApproveStep>('idle');
  const [approveError, setApproveError] = useState('');
  const [lastTxHash, setLastTxHash] = useState('');

  useEffect(() => {
    if (!walletAddress) return;

    const read = () => {
      void Promise.resolve().then(() => {
        const all = getAllHolderCredentials();
        setPending(
          all.filter(c => c.institutionWallet === walletAddress && c.status === 'pending')
        );
      });
    };

    read();
    const interval = setInterval(read, 3000);
    return () => clearInterval(interval);
  }, [walletAddress]);

  const reloadPending = () => {
    const all = getAllHolderCredentials();
    setPending(
      all.filter(c => c.institutionWallet === walletAddress && c.status === 'pending')
    );
  };

  const handleConfirm = async () => {
    if (!confirmAction || !walletAddress) return;
    const { credential, type } = confirmAction;
    if (!credential.ownerWallet) return;

    if (type === 'reject') {
      updateCredentialInStorage(credential.ownerWallet, credential.id, { status: 'rejected' });
      setConfirmAction(null);
      reloadPending();
      return;
    }

    // Approve: submit to blockchain first
    setApproveStep('submitting');
    setApproveError('');

    try {
      const hash = await submitVerificationToChain(credential, user?.name ?? walletAddress);

      updateCredentialInStorage(credential.ownerWallet, credential.id, {
        status: 'verified',
        txHash: hash,
        extra: undefined,
      });

      setLastTxHash(hash);
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
        <div className={styles.topbar}>
          <h1 className={styles.heading}>Pending Queue</h1>
          <span className={styles.sub}>{user?.name}</span>
        </div>

        <p className={styles.sectionTitle}>Awaiting Review</p>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Credential Name</th>
                <th>Credential Holder</th>
                <th>Submitted</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {pending.length === 0 ? (
                <tr>
                  <td colSpan={4} className={styles.emptyCell}>
                    No pending credentials. When holders submit credentials to your institution, they will appear here.
                  </td>
                </tr>
              ) : (
                pending.map(cred => (
                  <tr key={cred.id}>
                    <td>{cred.name}</td>
                    <td>
                      <span className={styles.holderName}>{cred.ownerName ?? '—'}</span>
                      <span className={styles.holderWallet}>{cred.ownerWallet ?? '—'}</span>
                    </td>
                    <td>{cred.issuedDate}</td>
                    <td>
                      <div className={styles.pendingActions}>
                        <button
                          className={styles.approveBtn}
                          onClick={() => setConfirmAction({ credential: cred, type: 'approve' })}
                        >
                          Approve
                        </button>
                        <button
                          className={styles.rejectBtn}
                          onClick={() => setConfirmAction({ credential: cred, type: 'reject' })}
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {confirmAction && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>

            {/* ── Submitting to chain ── */}
            {approveStep === 'submitting' && (
              <>
                <div className={styles.modalIcon}>⏳</div>
                <h2 className={styles.modalHeading}>Anchoring to Cardano…</h2>
                <p className={styles.modalBody}>
                  Submitting verification transaction to the blockchain. This may take a few seconds.
                </p>
              </>
            )}

            {/* ── Success ── */}
            {approveStep === 'done' && (
              <>
                <div className={styles.modalIcon}>✓</div>
                <h2 className={styles.modalHeading}>Verified & Anchored</h2>
                <p className={styles.modalBody}>
                  The credential has been verified and permanently recorded on the Cardano Preview testnet.
                </p>
                <div className={styles.txRow}>
                  <span className={styles.txLabel}>TX</span>
                  <span className={styles.txValue}>
                    {lastTxHash.slice(0, 16)}…{lastTxHash.slice(-8)}
                  </span>
                </div>
                <a
                  className={styles.explorerLink}
                  href={`https://preview.cardanoscan.io/transaction/${lastTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View on Cardanoscan ↗
                </a>
                <div className={styles.modalActions}>
                  <button className={styles.confirmApproveBtn} onClick={closeModal}>Done</button>
                </div>
              </>
            )}

            {/* ── Error ── */}
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

            {/* ── Confirm prompt ── */}
            {approveStep === 'idle' && (
              <>
                <div className={styles.modalIcon}>
                  {confirmAction.type === 'approve' ? '✓' : '✕'}
                </div>
                <h2 className={styles.modalHeading}>
                  {confirmAction.type === 'approve' ? 'Approve Credential?' : 'Reject Credential?'}
                </h2>
                <p className={styles.modalBody}>
                  You are about to <strong>{confirmAction.type}</strong>{' '}
                  <strong>{confirmAction.credential.name}</strong> submitted by{' '}
                  <strong>{confirmAction.credential.ownerName ?? 'this holder'}</strong>.{' '}
                  {confirmAction.type === 'approve'
                    ? 'This will submit a transaction to Cardano and permanently record the verification on-chain.'
                    : 'This action cannot be undone.'}
                </p>
                <div className={styles.modalActions}>
                  <button className={styles.cancelBtn} onClick={closeModal}>
                    Cancel
                  </button>
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