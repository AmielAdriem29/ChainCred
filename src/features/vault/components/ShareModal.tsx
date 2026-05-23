import { useMemo, useState } from 'react';
import { useCredentials } from '../../credentials/context/useCredentials';
import { createShareUrl, saveShareLink } from '../../../shared/utils/shareLinks';
import styles from './ShareModal.module.css';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onShared?: () => void;
}

export function ShareModal({ isOpen, onClose, onShared }: Props) {
  const { wallet } = useCredentials();
  const [recipientName, setRecipientName] = useState('');
  const [shareToken] = useState(() => crypto.randomUUID());
  const [touched, setTouched] = useState(false);

  const shareUrl = useMemo(() => {
    if (!wallet) return '';
    if (!recipientName.trim()) return '';
    return createShareUrl(wallet, shareToken);
  }, [wallet, shareToken, recipientName]);

  if (!isOpen) return null;

  const recipientBlank = touched && !recipientName.trim();

  const handleConfirm = async () => {
    setTouched(true);
    if (!wallet) return;
    if (!recipientName.trim()) return;

    saveShareLink({
      walletAddress: wallet,
      token: shareToken,
      recipientName: recipientName.trim(),
      createdAt: new Date().toISOString(),
      status: 'active',
    });

    if (shareUrl) {
      await navigator.clipboard.writeText(shareUrl);
    }

    onShared?.();
    onClose();
  };

  const truncatedWallet = wallet
    ? `${wallet.slice(0, 20)}...${wallet.slice(-6)}`
    : null;

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <h3 className={styles.title}>Generate Share Link</h3>

        <div className={styles.field}>
          <label className={styles.label}>Recipient Name</label>
          <input
            className={`${styles.input} ${recipientBlank ? styles.inputError : ''}`}
            value={recipientName}
            onChange={e => setRecipientName(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="e.g. Google HR"
          />
          {recipientBlank && (
            <span className={styles.warning}>Recipient name is required.</span>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Wallet Address</label>
          <div className={styles.walletPill}>
            {truncatedWallet ?? 'Connect wallet to continue'}
          </div>
        </div>

        {!wallet && (
          <div className={styles.warning}>Connect a wallet before generating a share link.</div>
        )}

        <div className={styles.actions}>
          <button className={styles.btnOutline} onClick={onClose}>Cancel</button>
          <button
            className={styles.btnPrimary}
            onClick={handleConfirm}
            disabled={!wallet}
          >
            Generate Link
          </button>
        </div>
      </div>
    </div>
  );
}