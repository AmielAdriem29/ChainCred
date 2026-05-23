import { useState } from 'react';
import { useWallet, useWalletList } from '@meshsdk/react';
import { useAuth } from '../context/useAuth';
import type { UserProfile } from '../context/authTypes';
import { resolveAddress } from '../../../shared/utils/walletAddress';
import styles from './RegisterPage.module.css';
import { WALLET_RETRY_DELAY } from '../../../constants/timings';

type AccountType = 'holder' | 'organization';

interface Props {
  onNavigateLogin: () => void;
}

const ACCOUNT_TYPES: { value: AccountType; label: string; icon: string; description: string }[] = [
  {
    value: 'holder',
    label: 'Individual',
    icon: '👤',
    description: 'Store and share your credentials',
  },
  {
    value: 'organization',
    label: 'Organization',
    icon: '🏛',
    description: 'Issue and verify credentials',
  },
];

export function RegisterPage({ onNavigateLogin }: Props) {
  const wallets = useWalletList();
  const { connect, connected, wallet } = useWallet();
  const { register, isRegistered } = useAuth();

  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('holder');
  const [form, setForm] = useState({
    name: '',
    email: '',
    organizationName: '',
  });

  const handleAccountTypeChange = (type: AccountType) => {
    setAccountType(type);
    if (type === 'holder') {
      setForm(f => ({ ...f, organizationName: '' }));
    }
  };

  const handleConnect = async (walletId: string) => {
    setError('');
    setConnecting(true);
    try {
      await connect(walletId);
    } catch {
      setError('Failed to connect wallet.');
    } finally {
      setConnecting(false);
    }
  };

  const handleRegister = async () => {
    if (!connected || !wallet) return;

    if (!form.name || !form.email) {
      setError('Please fill in all fields.');
      return;
    }

    if (accountType === 'organization' && !form.organizationName) {
      setError('Please enter your organization name.');
      return;
    }

    setError('');

    let raw: string | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        raw = await wallet.getChangeAddress();
        if (raw) break;
      } catch {
        if (attempt < 2) {
          await new Promise(res => setTimeout(res, WALLET_RETRY_DELAY));
        }
      }
    }

    if (!raw) {
      setError('Could not retrieve wallet address. Try reconnecting.');
      return;
    }

    const address = resolveAddress(raw);

    if (isRegistered(address)) {
      setError('This wallet is already registered. Please sign in.');
      return;
    }

    const profile: UserProfile = {
      walletAddress: address,
      name: form.name,
      email: form.email,
      registeredAt: new Date().toISOString(),
      accountType,
      ...(accountType === 'organization' && form.organizationName
        ? { organizationName: form.organizationName }
        : {}),
    };

    register(profile);
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>⬡ <span>ChainCred</span></div>
        <h1 className={styles.heading}>Create account</h1>
        <p className={styles.sub}>Register using your Cardano wallet as your identity</p>

        {/* Step 1 — Account Type */}
        <p className={styles.stepLabel}>Step 1 — Choose account type</p>
        <div className={styles.accountTypeGrid}>
          {ACCOUNT_TYPES.map(type => (
            <button
              key={type.value}
              className={`${styles.accountTypeBtn} ${accountType === type.value ? styles.accountTypeBtnActive : ''}`}
              onClick={() => handleAccountTypeChange(type.value)}
            >
              <span className={styles.accountTypeIcon}>{type.icon}</span>
              <span className={styles.accountTypeLabel}>{type.label}</span>
              <span className={styles.accountTypeDesc}>{type.description}</span>
            </button>
          ))}
        </div>

        {/* Step 2 — Connect Wallet */}
        <p className={styles.stepLabel}>Step 2 — Connect your wallet</p>

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
                  <span>{w.name}</span>
                </button>
              ))
            )}
          </div>
        ) : (
          <div className={styles.connectedBadge}>✓ Wallet Connected</div>
        )}

        {/* Step 3 — Profile */}
        {connected && (
          <>
            <p className={styles.stepLabel}>Step 3 — Fill in your profile</p>
            <div className={styles.fields}>
              <div className={styles.field}>
                <label className={styles.label}>
                  {accountType === 'organization' ? 'Contact Person Name' : 'Full Name'}
                </label>
                <input
                  className={styles.input}
                  placeholder={accountType === 'organization' ? 'Jane Smith' : 'Juan dela Cruz'}
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Email</label>
                <input
                  className={styles.input}
                  type="email"
                  placeholder={accountType === 'organization' ? 'admin@organization.com' : 'juan@example.com'}
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                />
              </div>

              {accountType === 'organization' && (
                <div className={styles.field}>
                  <label className={styles.label}>Organization Name</label>
                  <input
                    className={styles.input}
                    placeholder="Eg., Cebu Institute of Technology – University"
                    value={form.organizationName}
                    onChange={e => setForm(f => ({ ...f, organizationName: e.target.value }))}
                  />
                </div>
              )}
            </div>

            <button className={styles.btnPrimary} onClick={handleRegister}>
              Create Account
            </button>
          </>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.footer}>
          Already have an account?{' '}
          <button className={styles.linkBtn} onClick={onNavigateLogin}>
            Sign in
          </button>
        </div>
      </div>
    </div>
  );
}