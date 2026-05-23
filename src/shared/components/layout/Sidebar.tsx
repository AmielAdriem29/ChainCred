import { useAuth } from '../../../features/auth/context/useAuth';
import type { NavSection } from '../../types';
import styles from './Sidebar.module.css';

interface NavItemDef {
  id: NavSection;
  label: string;
  icon: React.ReactNode;
}

const HOLDER_NAV: NavItemDef[] = [
  {
    id: 'vault',
    label: 'Credential Vault',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="2" width="5" height="5" rx="1" />
        <rect x="9" y="2" width="5" height="5" rx="1" />
        <rect x="2" y="9" width="5" height="5" rx="1" />
        <rect x="9" y="9" width="5" height="5" rx="1" />
      </svg>
    ),
  },
  {
    id: 'share',
    label: 'Share Center',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="4" r="2" />
        <circle cx="4" cy="8" r="2" />
        <circle cx="12" cy="12" r="2" />
        <path d="M6 7l4-2M6 9l4 2" />
      </svg>
    ),
  },
  {
    id: 'public',
    label: 'Public Profile',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="6" r="2.5" />
        <path d="M3 13c0-2.5 2.2-4 5-4s5 1.5 5 4" />
      </svg>
    ),
  },
];

const INSTITUTION_NAV: NavItemDef[] = [
  {
    id: 'institution-dashboard',
    label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1" y="1" width="6" height="6" rx="1" />
        <rect x="9" y="1" width="6" height="6" rx="1" />
        <rect x="1" y="9" width="6" height="6" rx="1" />
        <rect x="9" y="9" width="6" height="6" rx="1" />
      </svg>
    ),
  },
  {
    id: 'institution-pending',
    label: 'Pending Queue',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="8" r="6" />
        <path d="M8 4v4l3 2" />
      </svg>
    ),
  },
];

const SETTINGS_ITEM: NavItemDef = {
  id: 'settings',
  label: 'Settings',
  icon: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" />
    </svg>
  ),
};

interface Props {
  active: NavSection;
  onNavigate: (section: NavSection) => void;
}

function NavItem({
  item,
  isActive,
  onNavigate,
}: {
  item: NavItemDef;
  isActive: boolean;
  onNavigate: (s: NavSection) => void;
}) {
  return (
    <button
      className={`${styles.navItem} ${isActive ? styles.active : ''}`}
      onClick={() => onNavigate(item.id)}
    >
      <span className={styles.navIcon}>{item.icon}</span>
      {item.label}
    </button>
  );
}

export function Sidebar({ active, onNavigate }: Props) {
  const { user } = useAuth();
  const isOrganization = user?.accountType === 'organization';
  const navItems = isOrganization ? INSTITUTION_NAV : HOLDER_NAV;

  const displayName = isOrganization
    ? (user?.organizationName || user?.name || 'Organization')
    : (user?.name || user?.email?.split('@')[0] || 'User');

  const initial = displayName.charAt(0).toUpperCase();

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        ⬡ <span>ChainCred</span>
      </div>

      <nav className={styles.nav}>
        {navItems.map(item => (
          <NavItem
            key={item.id}
            item={item}
            isActive={active === item.id}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className={styles.bottomNav}>
        <div className={styles.userInfo}>
          <div className={styles.userAvatar}>
            <span>{initial}</span>
          </div>
          <div className={styles.userDetails}>
            <span className={styles.userName}>{displayName}</span>
            <span className={styles.userType}>{isOrganization ? 'Organization' : 'Holder'}</span>
          </div>
        </div>
        <NavItem
          item={SETTINGS_ITEM}
          isActive={active === 'settings'}
          onNavigate={onNavigate}
        />
      </div>
    </aside>
  );
}