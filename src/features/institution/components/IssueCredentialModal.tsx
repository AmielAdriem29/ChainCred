import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useAuth } from '../../auth/context/useAuth';
import type { UserProfile } from '../../auth/context/authTypes';
import type { Credential } from '../../../shared/types';
import { uploadToIPFS, pinOnIPFS } from '../../../shared/utils/ipfsStorage';
import styles from './IssueCredentialModal.module.css';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function sha256File(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateId(): string {
  return `cred_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function getHolderAccounts(): UserProfile[] {
  try {
    const raw = localStorage.getItem('chaincred_users');
    if (!raw) return [];
    const users = JSON.parse(raw) as Record<string, UserProfile>;
    return Object.values(users).filter(u => u.accountType === 'holder');
  } catch {
    return [];
  }
}

function writeCredentialToVault(ownerWallet: string, credential: Credential): void {
  const key = `chaincred_vault_${ownerWallet}`;
  try {
    const raw = localStorage.getItem(key);
    const existing: Credential[] = raw ? (JSON.parse(raw) as Credential[]) : [];
    existing.push(credential);
    localStorage.setItem(key, JSON.stringify(existing));
  } catch {
    // skip malformed entries
  }
}

async function submitToChain(credential: Credential, organizationName: string): Promise<string> {
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
    organization: trim64(credential.organization),
    issued_date: trim64(credential.issuedDate),
    sha256: trim64(credential.sha256Hash ?? ''),
    owner: {
      name: trim64(credential.ownerName ?? ''),
      wallet: trim64(credential.ownerWallet ?? ''),
    },
    issued_by: {
      organization: trim64(organizationName),
      issued_at: new Date().toISOString().slice(0, 64),
    },
    ipfs_cid: trim64(credential.ipfsCid ?? ''),
  };

  const address = await wallet.getChangeAddress();
  const tx = new Transaction({ initiator: wallet }).sendLovelace(address, '1500000');
  (tx as unknown as { setMetadata: (label: number, data: unknown) => void })
    .setMetadata(674, metadata);

  const unsigned = await tx.build();
  const signed = await wallet.signTx(unsigned);
  return await wallet.submitTx(signed);
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type Step = 'form' | 'hashing' | 'uploading' | 'submitting' | 'done';

interface Recipient {
  walletAddress: string;
  name: string;
  email: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function IssueCredentialModal({ isOpen, onClose }: Props) {
  const { user } = useAuth();

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // Recipient search
  const [query, setQuery] = useState('');
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  // Derived — no separate state needed
  const suggestions = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return getHolderAccounts()
      .filter(u => u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q))
      .slice(0, 6)
      .map(u => ({ walletAddress: u.walletAddress, name: u.name, email: u.email }));
  }, [query]);

  const showDropdown = suggestions.length > 0;

  // Credential fields
  const [credName, setCredName] = useState('');
  const [issueDate, setIssueDate] = useState(todayStr);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Flow state
  const [step, setStep] = useState<Step>('form');
  const [error, setError] = useState('');
  const [txHash, setTxHash] = useState('');
  const [ipfsCid, setIpfsCid] = useState('');

  // ── Close dropdown on outside click ──────────────────────────────────────

  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDropdown]);

  const selectRecipient = (r: Recipient) => {
    setRecipient(r);
    setQuery('');
  };

  // ── File handling ─────────────────────────────────────────────────────────

  const acceptFile = (f: File) => {
    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(f.type)) {
      setError('Only PDF, PNG, JPG, or WebP files are accepted.');
      return;
    }
    if (f.size > 50 * 1024 * 1024) {
      setError('File must be under 50 MB.');
      return;
    }
    setError('');
    setFile(f);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) acceptFile(f);
  }, []);

  // ── Submit handler (complete) ─────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!recipient) { setError('Select a recipient first.'); return; }
    if (!credName.trim()) { setError('Credential name is required.'); return; }
    if (!issueDate) { setError('Issue date is required.'); return; }
    setError('');

    const orgName = user?.organizationName ?? user?.name ?? '';
    const orgWallet = user?.walletAddress ?? '';

    let sha256Hash = '';
    let cid = '';
    let gatewayUrl = '';

    // Hash if file provided
    if (file) {
      setStep('hashing');
      try {
        sha256Hash = await sha256File(file);
      } catch {
        setError('Failed to hash file.');
        setStep('form');
        return;
      }

      setStep('uploading');
      try {
        const result = await uploadToIPFS(file);
        cid = result.cid;
        gatewayUrl = result.gatewayUrl;
        setIpfsCid(cid);
        pinOnIPFS(cid).catch(err => console.warn('IPFS pin warning:', err));
      } catch {
        setError('Could not upload to IPFS. Check your VITE_BLOCKFROST_IPFS_KEY and try again.');
        setStep('form');
        return;
      }
    }

    const dateStr = new Date(issueDate + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });

    const shortHash = sha256Hash
      ? `sha256:${sha256Hash.slice(0, 4)}…${sha256Hash.slice(-4)}`
      : `direct:${generateId().slice(0, 8)}`;

    const credential: Credential = {
      id: generateId(),
      name: credName.trim(),
      organization: orgName,
      organizationWallet: orgWallet,   // ✅ now uses the issuer's wallet address
      year: new Date(issueDate).getFullYear(),
      logoText: orgName.slice(0, 3).toUpperCase(),
      status: 'verified',
      txHash: shortHash,
      issuedDate: dateStr,
      sha256Hash: sha256Hash || undefined,
      ownerName: recipient.name,
      ownerWallet: recipient.walletAddress,
      ...(file && {
        fileName: file.name,
        fileType: file.type,
      }),
      ...(cid && {
        ipfsCid: cid,
        ipfsGatewayUrl: gatewayUrl,
      }),
    };

    setStep('submitting');
    try {
      const hash = await submitToChain(credential, orgName);
      credential.txHash = hash;
      setTxHash(hash);
    } catch (err) {
      console.error('Chain submission failed:', err);
      setTxHash('');
    }

    writeCredentialToVault(recipient.walletAddress, credential);
    setStep('done');
  };

  // ── Reset & close ─────────────────────────────────────────────────────────

  const handleClose = () => {
    setQuery('');
    setRecipient(null);
    setCredName('');
    setIssueDate(todayStr);
    setFile(null);
    setStep('form');
    setError('');
    setTxHash('');
    setIpfsCid('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className={styles.backdrop} onClick={handleClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>

        <div className={styles.header}>
          <div>
            <div className={styles.title}>Issue Credential</div>
            <div className={styles.subtitle}>Issue a verified credential directly to a registered user</div>
          </div>
          <button className={styles.closeBtn} onClick={handleClose}>✕</button>
        </div>

        {/* ── Form ── */}
        {step === 'form' && (
          <div className={styles.fields}>

            {/* Recipient */}
            <div className={styles.field}>
              <label className={styles.label}>Recipient</label>

              {recipient ? (
                <div className={styles.recipientChip}>
                  <span className={styles.recipientChipName}>{recipient.name}</span>
                  <span className={styles.recipientChipSep}>·</span>
                  <span className={styles.recipientChipEmail}>{recipient.email}</span>
                  <button
                    type="button"
                    className={styles.recipientChipRemove}
                    onClick={() => setRecipient(null)}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className={styles.searchWrap} ref={searchRef}>
                  <input
                    className={styles.input}
                    placeholder="Search by email or name…"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && suggestions.length > 0) {
                        e.preventDefault();
                        selectRecipient(suggestions[0]);
                      }
                    }}
                    autoComplete="off"
                  />
                  {showDropdown && (
                    <div className={styles.dropdown}>
                      {suggestions.map(s => (
                        <button
                          key={s.walletAddress}
                          type="button"
                          className={styles.dropdownItem}
                          onClick={() => selectRecipient(s)}
                        >
                          <span className={styles.dropdownName}>{s.name}</span>
                          <span className={styles.dropdownEmail}>{s.email}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className={styles.divider} />

            {/* Credential name */}
            <div className={styles.field}>
              <label className={styles.label}>Credential name</label>
              <input
                className={styles.input}
                placeholder="e.g. B.Sc. Computer Science"
                value={credName}
                onChange={e => setCredName(e.target.value)}
              />
            </div>

            {/* Issue date */}
            <div className={styles.field}>
              <label className={styles.label}>Issue date</label>
              <input
                className={`${styles.input} ${styles.dateInput}`}
                type="date"
                value={issueDate}
                max={todayStr}
                onChange={e => setIssueDate(e.target.value)}
              />
            </div>

            {/* File (optional) */}
            <div className={styles.field}>
              <label className={styles.label}>
                Supporting document <span className={styles.optional}>(optional)</span>
              </label>
              {file ? (
                <div className={styles.fileChip}>
                  <span className={styles.fileChipName}>{file.name}</span>
                  <span className={styles.fileChipSize}>{(file.size / 1024).toFixed(1)} KB</span>
                  <button
                    type="button"
                    className={styles.fileChipRemove}
                    onClick={() => setFile(null)}
                  >
                    ✕ Remove
                  </button>
                </div>
              ) : (
                <div
                  className={`${styles.dropzone} ${dragOver ? styles.dragOver : ''}`}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                    style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) acceptFile(f); }}
                  />
                  <div className={styles.dropIcon}>⬆</div>
                  <div className={styles.dropLabel}>Drag & drop or click to browse</div>
                  <div className={styles.dropSub}>PDF, PNG, JPG, WebP · up to 50 MB</div>
                </div>
              )}
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.actions}>
              <button className={styles.btnCancel} onClick={handleClose}>Cancel</button>
              <button className={styles.btnPrimary} onClick={handleSubmit}>
                Issue Credential →
              </button>
            </div>
          </div>
        )}

        {/* ── Processing states ── */}
        {(step === 'hashing' || step === 'uploading' || step === 'submitting') && (
          <div className={styles.processing}>
            <div className={styles.spinner} />
            <div className={styles.processingLabel}>
              {step === 'hashing' && 'Computing SHA-256 hash…'}
              {step === 'uploading' && 'Uploading to IPFS…'}
              {step === 'submitting' && 'Submitting to Cardano…'}
            </div>
            <div className={styles.processingSub}>
              {step === 'hashing' && 'This only takes a moment'}
              {step === 'uploading' && 'Storing document on a decentralised network'}
              {step === 'submitting' && 'Recording credential on-chain. This may take a few seconds.'}
            </div>
          </div>
        )}

        {/* ── Done ── */}
        {step === 'done' && (
          <div className={styles.success}>
            <div className={styles.successIconWrap}>✓</div>
            <div className={styles.successTitle}>Credential issued</div>
            <div className={styles.successSub}>
              <strong>{credName}</strong> has been issued to{' '}
              <strong>{recipient?.name}</strong> and is now in their vault.
            </div>

            {txHash && (
              <div className={styles.txRow}>
                <span className={styles.txLabel}>TX</span>
                <a
                  className={styles.txValue}
                  href={`https://preview.cardanoscan.io/transaction/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {txHash.slice(0, 12)}…{txHash.slice(-8)}
                </a>
              </div>
            )}

            {ipfsCid && (
              <div className={styles.txRow}>
                <span className={styles.txLabel}>IPFS</span>
                <a
                  className={styles.txValue}
                  href={`https://ipfs.io/ipfs/${ipfsCid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {ipfsCid.slice(0, 10)}…{ipfsCid.slice(-6)}
                </a>
              </div>
            )}

            <button className={styles.btnPrimary} onClick={handleClose}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}