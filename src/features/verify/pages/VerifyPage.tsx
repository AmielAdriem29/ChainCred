import { useState, useRef } from 'react';
import { decodeVerifyToken } from '../../../shared/utils/verifyToken';
import type { VerifyTokenPayload } from '../../../shared/utils/verifyToken';
import type { Credential } from '../../../shared/types';
import styles from './VerifyPage.module.css';

const VAULT_KEY_PREFIX = 'chaincred_vault_';

function updateCredentialInStorage(
  ownerWallet: string,
  credentialId: string,
  updates: Partial<Credential>,
): void {
  if (!ownerWallet) {
    console.warn('updateCredentialInStorage: ownerWallet is empty, cannot update credential', credentialId);
    return;
  }
  try {
    const key = `${VAULT_KEY_PREFIX}${ownerWallet}`;
    const raw = localStorage.getItem(key);
    if (!raw) {
      console.warn('updateCredentialInStorage: no vault found for wallet', ownerWallet);
      return;
    }
    const credentials = JSON.parse(raw) as Credential[];
    const updated = credentials.map(c =>
      c.id === credentialId ? { ...c, ...updates } : c,
    );
    localStorage.setItem(key, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to update credential in storage:', err);
  }
}

function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [isEmpty, setIsEmpty] = useState(true);

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    drawing.current = true;
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const pos = getPos(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    setIsEmpty(false);
    onChange(canvas.toDataURL());
  };

  const endDraw = () => { drawing.current = false; };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
    onChange(null);
  };

  return (
    <div className={styles.sigPadWrapper}>
      <canvas
        ref={canvasRef}
        width={600}
        height={180}
        className={styles.sigCanvas}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
      />
      {isEmpty && (
        <div className={styles.sigPlaceholder}>Draw your signature here</div>
      )}
      <button type="button" className={styles.clearBtn} onClick={clear}>Clear</button>
    </div>
  );
}

type Step = 'form' | 'submitting' | 'success' | 'error' | 'invalid';

export function VerifyPage() {
  const [payload] = useState<VerifyTokenPayload | null>(() => {
    const token = window.location.pathname.split('/verify/')[1] ?? '';
    return decodeVerifyToken(token);
  });
  const [step, setStep] = useState<Step>(() => {
    const token = window.location.pathname.split('/verify/')[1] ?? '';
    return decodeVerifyToken(token) ? 'form' : 'invalid';
  });

  const [signeeName, setSigneeName] = useState('');
  const [signeePosition, setSigneePosition] = useState('');
  const [signeeInstitution, setSigneeInstitution] = useState('');
  const [typedName, setTypedName] = useState('');
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [txHash, setTxHash] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const canSubmit =
    signeeName.trim() &&
    signeePosition.trim() &&
    signeeInstitution.trim() &&
    typedName.trim() &&
    signatureDataUrl !== null &&
    typedName.trim().toLowerCase() === signeeName.trim().toLowerCase();

  async function sha256String(str: string): Promise<string> {
    const buffer = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  const handleSubmit = async () => {
    if (!payload || !canSubmit) return;
    setStep('submitting');
    setErrorMsg('');

    try {
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

      const sigHash = await sha256String(signatureDataUrl ?? '');

      const trim64 = (s: string) => s.slice(0, 64);

      const metadata = {
        credential_id: trim64(payload.credentialId),
        credential_name: trim64(payload.credentialName),
        institution: trim64(payload.institution),
        issued_date: trim64(payload.issuedDate),
        sha256: trim64(payload.sha256Hash),
        owner: {
          name: trim64(payload.ownerName),
          wallet: trim64(payload.ownerWallet),
        },
        verified_by: {
          name: trim64(signeeName.trim()),
          position: trim64(signeePosition.trim()),
          institution: trim64(signeeInstitution.trim()),
          typed_name: trim64(typedName.trim()),
          signed_at: new Date().toISOString(),
        },
        esignature_sha256: sigHash,
      };

      const address = await wallet.getChangeAddress();

      const tx = new Transaction({ initiator: wallet })
        .sendLovelace(address, '1000000')
        .setMetadata(674, metadata);

      const unsignedTx = await tx.build();
      const signedTx = await wallet.signTx(unsignedTx);
      const hash = await wallet.submitTx(signedTx);

      window.history.replaceState(
        {},
        '',
        `${window.location.pathname}?tx=${hash}&cred=${payload.credentialId}`
      );

      if (payload.ownerWallet) {
        updateCredentialInStorage(payload.ownerWallet, payload.credentialId, {
          status: 'verified',
          txHash: hash,
        });
      }

      setTxHash(hash);
      setStep('success');
    } catch (err) {
      console.error(err);
      setErrorMsg(err instanceof Error ? err.message : 'Transaction failed. Please try again.');
      setStep('error');
    }
  };

  if (step === 'invalid') {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.invalidBox}>
            <div className={styles.invalidIcon}>✕</div>
            <div className={styles.invalidTitle}>Invalid verification link</div>
            <div className={styles.invalidSub}>This link is malformed or has been tampered with. Please ask the credential owner to generate a new one.</div>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.successBox}>
            <div className={styles.successIcon}>✓</div>
            <div className={styles.successTitle}>Verification submitted</div>
            <div className={styles.successSub}>
              Your confirmation has been anchored to the Cardano Preview testnet. The credential owner will be notified.
            </div>
            <div className={styles.txRow}>
              <span className={styles.txLabel}>TX</span>
              <span className={styles.txValue}>{txHash}</span>
            </div>
            <a
              className={styles.explorerLink}
              href={`https://preview.cardanoscan.io/transaction/${txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              View on Cardanoscan →
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (!payload) return null;

  const ownerWalletShort = payload.ownerWallet
    ? `${payload.ownerWallet.slice(0, 8)}…${payload.ownerWallet.slice(-6)}`
    : '—';

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <div className={styles.brand}>⬡ ChainCred</div>
        <div className={styles.topbarLabel}>Credential Verification Request</div>
      </div>

      <div className={styles.container}>
        <div className={styles.layout}>
          <div className={styles.infoPanel}>
            <div className={styles.panelTitle}>Credential Details</div>

            <div className={styles.credCard}>
              <div className={styles.credLogo}>
                {payload.institution.slice(0, 3).toUpperCase()}
              </div>
              <div className={styles.credName}>{payload.credentialName}</div>
              <div className={styles.credInst}>{payload.institution}</div>
              <div className={styles.credDate}>Issued {payload.issuedDate}</div>

              <div className={styles.hashRow}>
                <span className={styles.hashLabel}>SHA-256</span>
                <span className={styles.hashValue}>
                  {payload.sha256Hash
                    ? `${payload.sha256Hash.slice(0, 12)}…${payload.sha256Hash.slice(-8)}`
                    : '—'}
                </span>
              </div>
            </div>

            <div className={styles.panelTitle} style={{ marginTop: 28 }}>Submitted by</div>
            <div className={styles.ownerCard}>
              <div className={styles.ownerAvatar}>
                {payload.ownerName ? payload.ownerName[0].toUpperCase() : '?'}
              </div>
              <div>
                <div className={styles.ownerName}>{payload.ownerName || 'Unknown'}</div>
                <div className={styles.ownerWallet}>{ownerWalletShort}</div>
              </div>
            </div>

            <div className={styles.notice}>
              <span className={styles.noticeIcon}>ℹ</span>
              <span>By submitting, your confirmation will be permanently recorded on the Cardano blockchain. This action cannot be undone.</span>
            </div>
          </div>

          <div className={styles.formPanel}>
            <div className={styles.panelTitle}>Your Details</div>

            {step === 'error' && (
              <div className={styles.errorBox}>{errorMsg}</div>
            )}

            <div className={styles.fields}>
              <div className={styles.field}>
                <label className={styles.label}>Full name</label>
                <input
                  className={styles.input}
                  placeholder="e.g. Dr. Maria Santos"
                  value={signeeName}
                  onChange={e => setSigneeName(e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Position / Title</label>
                <input
                  className={styles.input}
                  placeholder="e.g. University Registrar"
                  value={signeePosition}
                  onChange={e => setSigneePosition(e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Institution / Company</label>
                <input
                  className={styles.input}
                  placeholder="e.g. University of Cebu"
                  value={signeeInstitution}
                  onChange={e => setSigneeInstitution(e.target.value)}
                />
              </div>
            </div>

            <div className={styles.panelTitle} style={{ marginTop: 28 }}>Signature</div>

            <div className={styles.field}>
              <label className={styles.label}>Draw your signature</label>
              <SignaturePad onChange={setSignatureDataUrl} />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Type your full name to confirm</label>
              <input
                className={styles.input}
                placeholder="Must match your full name above"
                value={typedName}
                onChange={e => setTypedName(e.target.value)}
              />
              {typedName && signeeName && typedName.trim().toLowerCase() !== signeeName.trim().toLowerCase() && (
                <div className={styles.mismatch}>Name does not match</div>
              )}
            </div>

            <button
              className={styles.submitBtn}
              onClick={handleSubmit}
              disabled={!canSubmit || step === 'submitting'}
            >
              {step === 'submitting' ? (
                <span className={styles.submittingInner}>
                  <span className={styles.spinner} />
                  Submitting to Cardano…
                </span>
              ) : (
                'Confirm & Sign on Cardano'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}