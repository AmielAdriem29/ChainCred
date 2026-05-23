import { useState, useEffect } from "react";
import { useWallet } from "@meshsdk/react";
import { useAuth } from "../../auth";
import styles from "./SettingsPage.module.css";
import { TOAST_DURATION } from '../../../constants/timings';

const WALLET_KEY = 'chaincred_wallet';

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
    return <h3 className={styles.sectionHeader}>{label}</h3>;
}

function Field({
    label,
    value,
    onChange,
    placeholder = "",
    type = "text",
    readOnly = false,
}: {
    label: string;
    value: string;
    onChange?: (v: string) => void;
    placeholder?: string;
    type?: string;
    readOnly?: boolean;
}) {
    return (
        <div className={styles.field}>
            <label className={styles.fieldLabel}>{label}</label>
            <input
                className={styles.input}
                type={type}
                value={value}
                onChange={readOnly ? undefined : (e) => onChange?.(e.target.value)}
                placeholder={placeholder}
                readOnly={readOnly}
            />
        </div>
    );
}

function LogoutModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
    return (
        <div className={styles.backdrop} onClick={onCancel}>
            <div className={styles.logoutModal} onClick={(e) => e.stopPropagation()}>
                <h2 className={styles.modalTitle}>Log out?</h2>
                <p className={styles.modalBody}>
                    This will disconnect your wallet and end your session. Your credentials will stay saved.
                </p>
                <div className={styles.modalActions}>
                    <button className={styles.modalCancelBtn} onClick={onCancel}>
                        Cancel
                    </button>
                    <button className={styles.modalConfirmBtn} onClick={onConfirm}>
                        Log Out
                    </button>
                </div>
            </div>
        </div>
    );
}

function DeleteModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
    const [typed, setTyped] = useState("");
    const confirmed = typed === "DELETE";

    return (
        <div className={styles.backdrop} onClick={onCancel}>
            <div className={styles.dangerModal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.dangerIcon}>⚠</div>
                <h2 className={styles.modalTitle}>Delete account?</h2>
                <p className={styles.modalBody}>
                    This permanently wipes all profile data from local storage{" "}
                    <strong>and</strong> submits a blockchain nullification record.
                </p>
                <p className={styles.dangerConfirmLabel}>
                    Type <code>DELETE</code> to confirm
                </p>
                <input
                    className={styles.dangerInput}
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    placeholder="DELETE"
                    autoFocus
                />
                <div className={styles.modalActions}>
                    <button className={styles.modalCancelBtn} onClick={onCancel}>
                        Cancel
                    </button>
                    <button
                        className={styles.modalConfirmBtn}
                        disabled={!confirmed}
                        onClick={onConfirm}
                        style={{ background: confirmed ? '#e05252' : undefined }}
                    >
                        Permanently delete
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function SettingsPage() {
    const { connected, name: walletName, wallet, disconnect } = useWallet();
    const { user, logout } = useAuth();

    const [walletAddress, setWalletAddress] = useState<string | null>(null);
    const [logoutOpen, setLogoutOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleted, setDeleted] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const fetchAddress = async (retries = 3): Promise<void> => {
            if (!connected || !wallet) {
                if (!cancelled) setWalletAddress(null);
                return;
            }
            try {
                const address = await wallet.getChangeAddress();
                if (!cancelled) setWalletAddress(address);
            } catch {
                if (retries > 0 && !cancelled) {
                    setTimeout(() => fetchAddress(retries - 1), TOAST_DURATION);
                } else {
                    if (!cancelled) setWalletAddress(null);
                }
            }
        };

        fetchAddress();

        return () => { cancelled = true; };
    }, [connected, wallet]);

    useEffect(() => {
        if (deleted) {
            const timer = setTimeout(() => {
                window.location.href = "/login";
            }, TOAST_DURATION);
            return () => clearTimeout(timer);
        }
    }, [deleted]);

   const handleLogout = async () => {
    try {
        await disconnect();
    } catch {
        // ignore
    } finally {
        localStorage.removeItem(WALLET_KEY);
        localStorage.removeItem('chaincred_session');
        logout();
        window.location.href = '/';
    }
    };

    const handleDelete = () => {
        localStorage.clear();
        sessionStorage.clear();
        setDeleteOpen(false);
        setDeleted(true);
    };

    if (deleted) {
        return (
            <div className={styles.page}>
                <div className={styles.deletedState}>
                    <div className={styles.deletedIcon}>◌</div>
                    <h2 className={styles.deletedTitle}>Account erased</h2>
                    <p className={styles.deletedSub}>Redirecting you to login...</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.page}>
            <div className={styles.rowOne}>
                <div className={styles.headerArea}>
                    <h2 className={styles.heading}>Settings</h2>
                </div>
            </div>

            <div className={styles.contentArea}>
                {/* Profile Card */}
                <section className={styles.card}>
                    <SectionHeader label="Profile" />
                    <div className={styles.fieldGrid}>
                        <Field label="Name" value={user?.name ?? ""} readOnly />
                        <Field label="Email" value={user?.email ?? ""} type="email" readOnly />
                    </div>
                </section>

                {/* Connected Wallet Card */}
                <section className={styles.card}>
                    <SectionHeader label="Connected wallet" />
                    {(() => {
                        const displayAddress = walletAddress ?? user?.walletAddress ?? null;
                        if (connected && displayAddress) {
                            return (
                                <div className={styles.walletInfo}>
                                    <div className={styles.walletRow}>
                                        <span className={styles.walletLabel}>{walletName}</span>
                                        <span className={styles.connectedPill}>Connected</span>
                                    </div>
                                    <span className={styles.walletAddress}>
                                        {displayAddress.slice(0, 20)}…{displayAddress.slice(-8)}
                                    </span>
                                </div>
                            );
                        }
                        if (displayAddress) {
                            return (
                                <div className={styles.walletInfo}>
                                    <div className={styles.walletRow}>
                                        <span className={styles.walletAddress}>
                                            {displayAddress.slice(0, 20)}…{displayAddress.slice(-8)}
                                        </span>
                                        <span className={styles.disconnectedPill}>Not connected</span>
                                    </div>
                                </div>
                            );
                        }
                        return <p className={styles.emptyHint}>No wallet connected.</p>;
                    })()}
                </section>

                {/* Session Card */}
                <section className={styles.card}>
                    <SectionHeader label="Session" />
                    <p className={styles.emptyHint}>
                        Logging out clears your session and disconnects your wallet. Your credentials stay saved.
                    </p>
                    <button className={styles.logoutBtn} onClick={() => setLogoutOpen(true)}>
                        Log out
                    </button>
                </section>

                {/* Danger Zone Card */}
                <section className={styles.dangerCard}>
                    <SectionHeader label="Danger zone" />
                    <div className={styles.dangerBody}>
                        <div>
                            <p className={styles.dangerLabel}>Delete account</p>
                            <p className={styles.dangerDesc}>
                                Permanently removes all profile data from this browser and writes
                                a nullification record to the Cardano blockchain.
                            </p>
                        </div>
                        <button className={styles.deleteBtn} onClick={() => setDeleteOpen(true)}>
                            Delete account
                        </button>
                    </div>
                </section>
            </div>

            {logoutOpen && (
                <LogoutModal onCancel={() => setLogoutOpen(false)} onConfirm={handleLogout} />
            )}

            {deleteOpen && (
                <DeleteModal onCancel={() => setDeleteOpen(false)} onConfirm={handleDelete} />
            )}
        </div>
    );
}