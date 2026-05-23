import { useState } from 'react';
import { useWallet, useWalletList } from '@meshsdk/react';
import type { Credential } from '../../../shared';
import { StatusBadge } from '../../../shared';
import { useCredentials } from '../../credentials';
import { useAuth } from '../../auth';
import { previewCredentialFile } from '../../../shared/utils/filePreview';
import styles from './CredentialCard.module.css';
import { resolveAddress } from '../../../shared/utils/walletAddress';

interface Props {
  credential: Credential;
}

// ── Delete Confirmation Modal ─────────────────────────────────────────────────
type DeleteStep = 'confirm' | 'wallet' | 'deleting';

function DeleteModal({
  credential,
  onCancel,
  onDeleted,
}: {
  credential: Credential;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const { user } = useAuth();
  const { deleteCredential } = useCredentials();
  const wallets = useWalletList();
  const { connect, connected, wallet } = useWallet();

  const [step, setStep] = useState<DeleteStep>('confirm');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  const handleConnect = async (walletId: string) => {
    setError('');
    setConnecting(true);
    try {
      await connect(walletId);
    } catch {
      setError('Failed to connect wallet. Please try again.');
    } finally {
      setConnecting(false);
    }
  };

  const handleWalletConfirm = async () => {
    if (!connected || !wallet) {
      setError('Please connect your wallet first.');
      return;
    }
    setError('');
    try {
      const raw = await wallet.getChangeAddress();
      const rawStr = Array.isArray(raw) ? raw[0] : raw;
      const resolved = resolveAddress(rawStr);

      if (resolved !== user?.walletAddress) {
        setError('Wrong wallet. Please connect the wallet associated with this account.');
        return;
      }
      setStep('deleting');
      await deleteCredential(credential.id);
      onDeleted();
    } catch {
      setError('Could not verify wallet. Make sure it is unlocked and try again.');
      setStep('wallet');
    }
  };

  return (
    <div className={styles.deleteModalBackdrop}>
      <div className={styles.deleteModal} onClick={e => e.stopPropagation()}>
        {step === 'confirm' && (
          <>
            <div className={styles.deleteModalIcon}>⚠</div>
            <div className={styles.deleteModalTitle}>Delete credential?</div>
            <div className={styles.deleteModalCred}>"{credential.name}"</div>
            <div className={styles.deleteModalSub}>
              This permanently removes the credential from your vault.
              On-chain records are unaffected, but you won't be able to
              recover it without re-adding it manually.
            </div>
            {credential.status === 'verified' && (
              <div className={styles.deleteModalWarning}>
                This credential is verified and visible on your public profile.
                Deleting it will remove it from recruiter view.
              </div>
            )}
            <div className={styles.deleteModalActions}>
              <button className={styles.deleteCancelBtn} onClick={onCancel}>Cancel</button>
              <button className={styles.deleteNextBtn} onClick={() => setStep('wallet')}>
                Continue →
              </button>
            </div>
          </>
        )}

        {(step === 'wallet' || step === 'deleting') && (
          <>
            <div className={styles.deleteModalIcon}>🔐</div>
            <div className={styles.deleteModalTitle}>Confirm with your wallet</div>
            <div className={styles.deleteModalSub}>
              Connect your registered wallet to confirm you authorise this deletion.
            </div>

            {error && <div className={styles.deleteModalError}>{error}</div>}

            {!connected ? (
              <div className={styles.walletList}>
                {wallets.length === 0 ? (
                  <p className={styles.noWallets}>No Cardano wallets detected.</p>
                ) : (
                  wallets.map(w => (
                    <button
                      key={w.id}
                      className={styles.walletBtn}
                      onClick={() => handleConnect(w.id)}
                      disabled={connecting}
                    >
                      <img src={w.icon} alt={w.name} className={styles.walletIcon} />
                      <span>{w.name}</span>
                    </button>
                  ))
                )}
              </div>
            ) : (
              <div className={styles.walletConnectedBadge}>✓ Wallet connected</div>
            )}

            <div className={styles.deleteModalActions}>
              <button
                className={styles.deleteCancelBtn}
                onClick={onCancel}
                disabled={step === 'deleting'}
              >
                Cancel
              </button>
              <button
                className={styles.deleteConfirmBtn}
                onClick={handleWalletConfirm}
                disabled={!connected || step === 'deleting'}
              >
                {step === 'deleting' ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Credential Card ──────────────────────────────────────────────────────────
export function CredentialCard({ credential }: Props) {
  const { updateCredential } = useCredentials();
  const { user } = useAuth();
  const { id, name, institution, year, logoText, logoColor, logoTextColor, status, txHash, blockNumber, issuedDate, fileKey, fileName, fileType, ipfsGatewayUrl } = credential;

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(name);
  const [editInstitution, setEditInstitution] = useState(institution);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [hashCopied, setHashCopied] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  const handleSave = async () => {
    await updateCredential(id, { name: editName.trim(), institution: editInstitution.trim() });
    setEditing(false);
  };

  const handleViewDocument = async () => {
    if (ipfsGatewayUrl) {
      window.open(ipfsGatewayUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    if (!fileKey || !fileName || !fileType || !user) return;
    setPreviewLoading(true);
    try {
      await previewCredentialFile(user.walletAddress, id, fileName, fileType);
    } catch (error) {
      console.error('Failed to preview document:', error);
    } finally {
      setPreviewLoading(false);
    }
  };

  const isSha256 = txHash && txHash.startsWith('sha256:');
  const isFullHash = txHash && !isSha256 && txHash.length > 20;
  const displayHash = isFullHash ? `${txHash.slice(0, 10)}…${txHash.slice(-4)}` : txHash;

  const handleHashCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isFullHash) return;
    navigator.clipboard.writeText(txHash);
    setHashCopied(true);
    setTimeout(() => setHashCopied(false), 2000);
  };

  const getDateLabel = () => {
    if (isSha256) return 'Uploaded at ';
    if (status === 'verified') return 'Verified at ';
    return '';
  };

  if (editing) {
    return (
      <div className={styles.card}>
        <div className={styles.mainColumn}>
          <div className={styles.detailsHeader}>
            <div className={styles.details} style={{ gap: '8px' }}>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', color: 'rgba(255, 255, 255, 0.7)' }}>
                Edit credential
              </span>
              <input
                className={styles.editInput}
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder="Credential name"
              />
              <input
                className={styles.editInput}
                value={editInstitution}
                onChange={e => setEditInstitution(e.target.value)}
                placeholder="Institution"
              />
            </div>
            <StatusBadge status={status} />
          </div>
          <div className={styles.cardActions} style={{ marginTop: '16px' }}>
            <button className={styles.actionBtn} onClick={() => setEditing(false)}>Cancel</button>
            <button className={styles.btnSave} onClick={handleSave}>Save changes</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {showDeleted && (
        <div className={styles.toast}>✓ Credential deleted successfully</div>
      )}

      {showDeleteModal && (
        <DeleteModal
          credential={credential}
          onCancel={() => setShowDeleteModal(false)}
          onDeleted={() => {
            setShowDeleteModal(false);
            setShowDeleted(true);
            setTimeout(() => setShowDeleted(false), 3000);
          }}
        />
      )}

      <div className={styles.card}>
        {/* Left Side: Standalone Logo Div */}
        <div className={styles.logo} style={{ background: logoColor, color: logoTextColor }}>
          {logoText}
        </div>

        {/* Right Side: Primary Flex Column (Information block + action buttons underneath) */}
        <div className={styles.mainColumn}>
          
          {/* Top of Right Column: Details & Status Badge Row */}
          <div className={styles.detailsHeader}>
            <div className={styles.details}>
              <div className={styles.name} title={name}>{name}</div>
              <div className={styles.inst} title={institution}>{institution} · {year}</div>
              <div className={styles.date}>
                {getDateLabel()}
                {blockNumber ? `Block #${blockNumber}` : issuedDate}
              </div>
              {txHash && (
                <div style={{ marginTop: '6px' }}>
                  <button 
                    className={`${styles.hash} ${isFullHash ? styles.hashClickable : ''}`} 
                    onClick={handleHashCopy}
                    disabled={!isFullHash}
                  >
                    <span>{displayHash}</span>
                    {isFullHash && (
                      <span className={styles.hashCopyHint}>{hashCopied ? ' ✓' : ' 📋'}</span>
                    )}
                  </button>
                </div>
              )}
            </div>
            <StatusBadge status={status} />
          </div>

          {/* Bottom of Right Column: Action Buttons Row */}
          <div className={styles.cardActions}>
            {status === 'pending' && (
              <button className={styles.actionBtn} onClick={() => setEditing(true)}>Edit</button>
            )}
            {status === 'verified' && (ipfsGatewayUrl || (fileKey && fileName && fileType)) && (
              <button className={styles.actionBtn} onClick={handleViewDocument} disabled={previewLoading}>
                {previewLoading ? '...' : '📄 View'}
              </button>
            )}
            {isFullHash && (
              <a
                className={`${styles.actionBtn} ${styles.actionBtnChain}`}
                href={`https://preview.cardanoscan.io/transaction/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Scan ↗
              </a>
            )}
            <button
              className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
              onClick={() => setShowDeleteModal(true)}
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </>
  );
}