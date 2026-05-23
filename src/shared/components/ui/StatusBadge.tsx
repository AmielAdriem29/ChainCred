import type { CredentialStatus } from '../../types';
import styles from './StatusBadge.module.css';

interface Props {
  status: CredentialStatus | 'active';
}

const LABEL_MAP: Record<string, string> = {
  verified: 'Verified',
  pending: 'Pending',
  revoked: 'Revoked',
  active: 'Active',
};

export function StatusBadge({ status }: Props) {
  const label = status === 'verified' ? 'Active' : LABEL_MAP[status] ?? status;
  const key = status === 'active' ? 'verified' : status;
  return <span className={`${styles.badge} ${styles[key]}`}>{label}</span>;
}