import { useState } from 'react';
import { useWallet, useWalletList } from '@meshsdk/react';
import { useAuth } from '../context/useAuth';
import { resolveAddress } from '../../../shared/utils/walletAddress';
import styles from './WalletReconnectModal.module.css';

const WALLET_KEY = 'chaincred_wallet';

export function WalletReconnectModal() {
  const wallets = useWalletList();
  const { connect } = useWallet();
  const { logout, setWalletDisconnected, login } = useAuth();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  const handleReconnect = async (walletId: string) => {
    setError('');
    setConnecting(true);
    try {
      await connect(walletId);
      localStorage.setItem(WALLET_KEY, walletId);

      setTimeout(async () => {
        try {
          const api = await window.cardano?.[walletId]?.enable();
          if (!api) {
            setError('Wallet extension not found. Please try again.');
            setConnecting(false);
            return;
          }
          const raw = await api.getChangeAddress();
          if (raw) {
            const address = resolveAddress(raw);
            const profile = login(address);
            if (profile) {
              setWalletDisconnected(false);
            } else {
              setError('No account found for this wallet. Please log in again.');
              setConnecting(false);
            }
          }
        } catch {
          setError('Failed to get wallet address. Please try again.');
          setConnecting(false);
        }
      }, 500);
    } catch {
      setError('Failed to reconnect. Please try again.');
      setConnecting(false);
    }
  };

  const handleDismiss = () => {
    logout();
  };

  return (
    <div className={styles.backdrop}>
      <div className={styles.modal}>
        <div className={styles.modalIcon}>⚠</div>
        <h2 className={styles.modalTitle}>Wallet Disconnected</h2>
        <p className={styles.modalBody}>
          Your wallet session has ended. Reconnect your wallet to continue,
          or log out to return to the login screen.
        </p>

        <div className={styles.walletList}>
          {wallets.map(w => (
            <button
              key={w.id}
              className={styles.walletBtn}
              onClick={() => handleReconnect(w.id)}
              disabled={connecting}
            >
              <img src={w.icon} alt={w.name} className={styles.walletIcon} />
              <span>{connecting ? 'Connecting…' : `Reconnect with ${w.name}`}</span>
            </button>
          ))}
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.modalActions}>
          <button className={styles.modalCancelBtn} onClick={handleDismiss}>
            Log out instead
          </button>
        </div>
      </div>
    </div>
  );
}