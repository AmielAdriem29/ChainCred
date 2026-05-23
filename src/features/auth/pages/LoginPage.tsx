import { useState } from 'react';
import { useWallet, useWalletList } from '@meshsdk/react';
import { useAuth } from '../context/useAuth';
import { resolveAddress } from '../../../shared/utils/walletAddress';
import styles from './LoginPage.module.css';

interface Props {
  onNavigateRegister: () => void;
}

export function LoginPage({ onNavigateRegister }: Props) {
  const wallets = useWalletList();
  const { connect, connected, wallet, disconnect } = useWallet();
  const { login } = useAuth();
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async (walletId: string) => {
    setError('');
    setConnecting(true);
    if (connected) await disconnect();
    try {
      await connect(walletId);
      localStorage.setItem('chaincred_wallet', walletId);
    } catch {
      setError('Failed to connect wallet. Please try again.');
    } finally {
      setConnecting(false);
    }
  };

  const handleLogin = async () => {
    if (!connected || !wallet) return;
    setError('');

    try {
      const used = await wallet.getUsedAddresses();
      const raw = used && used.length > 0
        ? used[0]
        : await wallet.getChangeAddress();

      if (!raw) {
        setError('Could not retrieve wallet address. Try reconnecting.');
        return;
      }

      const address = resolveAddress(raw);

      const profile = login(address);
      if (!profile) {
        setError('No account found for this wallet. Please register first.');
      }
    } catch {
      setError('Could not retrieve wallet address. Try reconnecting.');
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>⬡ <span>ChainCred</span></div>
        <h1 className={styles.heading}>Welcome back</h1>
        <p className={styles.sub}>Connect your Cardano wallet to sign in</p>

        {!connected ? (
          <div className={styles.walletList}>
            {wallets.length === 0 ? (
              <p className={styles.empty}>
                No Cardano wallets detected.{' '}
                <a href="https://namiwallet.io" target="_blank" rel="noreferrer">Install Nami →</a>
              </p>
            ) : (
              wallets.map(w => (
                <button
                  key={w.id}
                  className={styles.walletBtn}
                  onClick={() => handleConnect(w.id)}
                  disabled={connecting}
                >
                  <img src={w.icon} alt={w.name} className={styles.walletIcon} />
                  <span>{connecting ? 'Connecting…' : w.name}</span>
                </button>
              ))
            )}
          </div>
        ) : (
          <div className={styles.connectedState}>
            <div className={styles.connectedBadge}>✓ Wallet Connected</div>
            <button className={styles.btnPrimary} onClick={handleLogin}>
              Sign In with Wallet
            </button>
            <button className={styles.relinkBtn} onClick={() => disconnect()}>
              Use a different wallet
            </button>
          </div>
        )}

        {error && (
          <div className={styles.error}>
            <span className={styles.errorIcon}>⚠</span>
            <span>{error}</span>
            <button className={styles.errorDismiss} onClick={() => setError('')} aria-label="Dismiss error">✕</button>
          </div>
        )}

        <div className={styles.footer}>
          Don't have an account?{' '}
          <button className={styles.linkBtn} onClick={onNavigateRegister}>
            Register here
          </button>
        </div>
      </div>
    </div>
  );
}