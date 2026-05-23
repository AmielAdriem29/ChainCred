import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useCredentials } from '../../credentials';
import { useAuth } from '../../auth';
import { saveCredentialFile } from '../../../utils/storage';
import { uploadToIPFS, pinOnIPFS } from '../../../shared/utils/ipfsStorage';
import type { Credential } from '../../../shared';
import type { UserProfile } from '../../auth/context/authTypes';
import styles from './IssuanceModal.module.css';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type Step = 'form' | 'hashing' | 'uploading' | 'done';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

async function sha256File(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateId(): string {
  return `cred_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function getOrgWalletByName(orgName: string): string {
  try {
    const raw = localStorage.getItem('chaincred_users');
    if (!raw) return '';
    const users = JSON.parse(raw) as Record<string, UserProfile>;
    const match = Object.values(users).find(
      u =>
        u.accountType === 'organization' &&
        u.organizationName?.toLowerCase() === orgName.trim().toLowerCase()
    );
    return match?.walletAddress ?? '';
  } catch {
    return '';
  }
}

function getOrgAccounts(): UserProfile[] {
  try {
    const raw = localStorage.getItem('chaincred_users');
    if (!raw) return [];
    const users = JSON.parse(raw) as Record<string, UserProfile>;
    return Object.values(users).filter(u => u.accountType === 'organization');
  } catch {
    return [];
  }
}

// Date picker component (unchanged)
function DatePickerPopover({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const today = new Date();
  const parsed = value ? new Date(value + 'T00:00:00') : null;
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(parsed?.getMonth() ?? today.getMonth());
  const [year, setYear] = useState(parsed?.getFullYear() ?? today.getFullYear());
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

  const currentYear = today.getFullYear();
  const years = Array.from({ length: 30 }, (_, i) => currentYear - i);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: firstDay + daysInMonth }, (_, i) =>
    i < firstDay ? null : i - firstDay + 1
  );

  const selectedDay = parsed && parsed.getMonth() === month && parsed.getFullYear() === year
    ? parsed.getDate() : null;

  const isFuture = (d: number) => new Date(year, month, d) > today;
  const isToday = (d: number) => d === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const select = (d: number) => {
    if (isFuture(d)) return;
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    onChange(`${year}-${mm}-${dd}`);
    setOpen(false);
  };

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };

  const nextMonth = () => {
    const next = new Date(year, month + 1, 1);
    if (next > today) return;
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const handleOpen = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPopoverStyle({
        position: 'fixed',
        bottom: window.innerHeight - rect.top + 6,
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
      });
    }
    setOpen(o => !o);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const displayValue = parsed
    ? parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '';

  return (
    <div className={styles.dateContainer} ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.dateInput} ${open ? styles.dateInputOpen : ''}`}
        onClick={handleOpen}
      >
        <span className={displayValue ? styles.dateValue : styles.datePlaceholder}>
          {displayValue || 'Select a date'}
        </span>
        <span className={styles.dateChevron}>▾</span>
      </button>

      {open && (
        <div className={styles.popover} style={popoverStyle}>
          <div className={styles.dateNav}>
            <button type="button" className={styles.dateNavBtn} onClick={prevMonth}>‹</button>
            <div className={styles.dateNavCenter}>
              <select className={styles.dateSelect} value={month} onChange={e => setMonth(+e.target.value)}>
                {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
              </select>
              <select className={styles.dateSelect} value={year} onChange={e => setYear(+e.target.value)}>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <button type="button" className={styles.dateNavBtn} onClick={nextMonth}>›</button>
          </div>

          <div className={styles.dateGrid}>
            {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
              <div key={d} className={styles.dateWeekday}>{d}</div>
            ))}
            {cells.map((d, i) => (
              <button
                key={i}
                type="button"
                className={`${styles.dateCell}
                  ${d && selectedDay === d ? styles.dateCellSelected : ''}
                  ${d && isToday(d) ? styles.dateCellToday : ''}
                  ${d && isFuture(d) ? styles.dateCellDisabled : ''}`}
                onClick={() => d && select(d)}
                disabled={!d || isFuture(d)}
              >
                {d ?? ''}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FilePreview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const isImage = file.type.startsWith('image/');
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!isImage) return;
    const reader = new FileReader();
    reader.onload = e => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }, [file, isImage]);

  return (
    <div className={styles.filePreview}>
      {isImage && preview
        ? <img src={preview} alt="Preview" className={styles.imagePreview} />
        : (
          <div className={styles.pdfPreview}>
            <div className={styles.pdfIcon}>PDF</div>
            <div className={styles.pdfName}>{file.name}</div>
          </div>
        )
      }
      <div className={styles.filePreviewFooter}>
        <span className={styles.filePreviewName}>{file.name}</span>
        <span className={styles.filePreviewSize}>{(file.size / 1024).toFixed(1)} KB</span>
        <button type="button" className={styles.removeFileBtn} onClick={onRemove}>✕ Remove</button>
      </div>
    </div>
  );
}

export function IssuanceModal({ isOpen, onClose }: Props) {
  const { addCredential } = useCredentials();
  const { user } = useAuth();

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const [step, setStep] = useState<Step>('form');
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [organization, setOrganization] = useState('');
  const [issueDate, setIssueDate] = useState(todayStr);
  const [hash, setHash] = useState('');
  const [ipfsCid, setIpfsCid] = useState('');
  const [error, setError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const orgSearchRef = useRef<HTMLDivElement>(null);
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(true);

  const orgSuggestions = useMemo(() => {
    if (!organization.trim()) return [];
    const q = organization.toLowerCase();
    return getOrgAccounts()
      .filter(u => u.organizationName?.toLowerCase().includes(q))
      .slice(0, 6);
  }, [organization]);

  const showOrgDropdown = orgDropdownOpen && orgSuggestions.length > 0;

  const acceptFile = (f: File) => {
    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(f.type)) { setError('Only PDF, PNG, JPG, or WebP files are accepted.'); return; }
    if (f.size > 50 * 1024 * 1024) { setError('File must be under 50 MB.'); return; }
    setError('');
    setFile(f);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) acceptFile(f);
  }, []);

  useEffect(() => {
    if (!showOrgDropdown) return;
    const handler = (e: MouseEvent) => {
      if (orgSearchRef.current && !orgSearchRef.current.contains(e.target as Node)) {
        setOrgDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showOrgDropdown]);

  const handleSubmit = async () => {
    if (!file || !name.trim() || !organization.trim() || !issueDate) {
      setError('Please fill in all fields and upload a document.');
      return;
    }
    setError('');
    setStep('hashing');
    try {
      const fullHash = await sha256File(file);
      const shortHash = `${fullHash.slice(0, 4)}…${fullHash.slice(-4)}`;
      setHash(fullHash);

      setStep('uploading');
      let cid = '';
      let gatewayUrl = '';
      try {
        const ipfsResult = await uploadToIPFS(file);
        cid = ipfsResult.cid;
        gatewayUrl = ipfsResult.gatewayUrl;
        setIpfsCid(cid);
        pinOnIPFS(cid).catch(err => console.warn('IPFS pin warning:', err));
      } catch (ipfsErr) {
        console.error('IPFS upload failed:', ipfsErr);
        setError('Could not upload to IPFS. Check your VITE_BLOCKFROST_IPFS_KEY and try again.');
        setStep('form');
        return;
      }

      const logoText = organization.trim().slice(0, 3).toUpperCase();
      const dateStr = new Date(issueDate + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });

      const newCredential: Credential = {
        id: generateId(),
        name: name.trim(),
        organization: organization.trim(),
        organizationWallet: getOrgWalletByName(organization),
        year: new Date(issueDate).getFullYear(),
        logoText,
        status: 'pending',
        txHash: `sha256:${shortHash}`,
        issuedDate: dateStr,
        extra: 'Awaiting verification',
        sha256Hash: fullHash,
        ownerName: user?.name ?? '',
        ownerWallet: user?.walletAddress ?? '',
        fileKey: `file_${generateId()}`,
        fileName: file.name,
        fileType: file.type,
        ipfsCid: cid,
        ipfsGatewayUrl: gatewayUrl,
      };

      await addCredential(newCredential);

      if (user) {
        try {
          await saveCredentialFile(user.walletAddress, newCredential.id, file);
        } catch (err) {
          console.error('Failed to save credential file to IndexedDB:', err);
        }
      }

      setStep('done');
    } catch {
      setError('Failed to process file. Please try again.');
      setStep('form');
    }
  };

  const handleClose = () => {
    setStep('form');
    setFile(null);
    setName('');
    setOrganization('');
    setOrgDropdownOpen(true);
    setIssueDate(todayStr);
    setHash('');
    setIpfsCid('');
    setError('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className={styles.backdrop} onClick={handleClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>

        <div className={styles.header}>
          <div>
            <div className={styles.title}>Add Credential</div>
            <div className={styles.subtitle}>Upload a document to add to your vault</div>
          </div>
          <button className={styles.closeBtn} onClick={handleClose}>✕</button>
        </div>

        {step === 'form' && (
          <>
            <div className={styles.fields}>
              <div className={styles.field}>
                <label className={styles.label}>Credential name</label>
                <input
                  className={styles.input}
                  placeholder="e.g. B.Sc. Computer Science"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Organization</label>
                <div className={styles.searchWrap} ref={orgSearchRef}>
                  <input
                    className={styles.input}
                    placeholder="e.g. University of Cambridge, Google, etc."
                    value={organization}
                    onChange={e => { setOrganization(e.target.value); setOrgDropdownOpen(true); }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && orgSuggestions.length > 0) {
                        e.preventDefault();
                        setOrganization(orgSuggestions[0].organizationName ?? orgSuggestions[0].name);
                        setOrgDropdownOpen(false);
                      }
                    }}
                    autoComplete="off"
                  />
                  {showOrgDropdown && (
                    <div className={styles.dropdown}>
                      {orgSuggestions.map(u => (
                        <button
                          key={u.walletAddress}
                          type="button"
                          className={styles.dropdownItem}
                          onClick={() => { setOrganization(u.organizationName ?? u.name); setOrgDropdownOpen(false); }}
                        >
                          <span className={styles.dropdownName}>{u.organizationName ?? u.name}</span>
                          <span className={styles.dropdownEmail}>{u.email}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Document</label>
              {file ? (
                <FilePreview file={file} onRemove={() => setFile(null)} />
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

            <div className={styles.field}>
              <label className={styles.label}>Issue date</label>
              <DatePickerPopover value={issueDate} onChange={setIssueDate} />
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.actions}>
              <button className={styles.btnCancel} onClick={handleClose}>Cancel</button>
              <button className={styles.btnPrimary} onClick={handleSubmit}>Add to Vault →</button>
            </div>
          </>
        )}

        {step === 'hashing' && (
          <div className={styles.processing}>
            <div className={styles.spinner} />
            <div className={styles.processingLabel}>Computing SHA-256 hash…</div>
            <div className={styles.processingSub}>This only takes a moment</div>
          </div>
        )}

        {step === 'uploading' && (
          <div className={styles.processing}>
            <div className={styles.spinner} />
            <div className={styles.processingLabel}>Uploading to IPFS…</div>
            <div className={styles.processingSub}>Storing your document on a decentralised network</div>
          </div>
        )}

        {step === 'done' && (
          <div className={styles.success}>
            <div className={styles.successIcon}>✓</div>
            <div className={styles.successTitle}>Credential added</div>
            <div className={styles.successSub}>
              Added to your vault with <span className={styles.pendingBadge}>Pending</span> status. An admin will review and anchor it to Cardano.
            </div>
            <div className={styles.hashRow}>
              <span className={styles.hashLabel}>SHA-256</span>
              <span className={styles.hashValue}>{hash.slice(0, 16)}…{hash.slice(-16)}</span>
            </div>
            {ipfsCid && (
              <div className={styles.hashRow}>
                <span className={styles.hashLabel}>IPFS CID</span>
                <a
                  className={styles.hashValue}
                  href={`https://ipfs.io/ipfs/${ipfsCid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="View on IPFS gateway"
                >
                  {ipfsCid.slice(0, 10)}…{ipfsCid.slice(-6)}
                </a>
              </div>
            )}
            <button className={styles.btnPrimary} onClick={handleClose}>Back to vault</button>
          </div>
        )}
      </div>
    </div>
  );
}