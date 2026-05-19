import { useState } from 'react';
import { useNavigation } from './shared/hooks/useNavigation';
import { Sidebar } from './shared/components/layout/Sidebar';
import { AuthProvider } from './features/auth/context/AuthProvider';
import { useAuth } from './features/auth/context/useAuth';
import { LoginPage } from './features/auth/pages/LoginPage';
import { RegisterPage } from './features/auth/pages/RegisterPage';
import { CredentialProvider } from './features/credentials/context/CredentialContext.tsx';
import { VaultPage } from './features/vault';
import { SharePage } from './features/share';
import { PublicProfilePage } from './features/public-profile';
import { SettingsPage } from './features/settings';
import { VerifyPage } from './features/verify';
import { WalletReconnectModal } from './features/auth/components/WalletReconnectModal';
import { InstitutionDashboardPage, InstitutionPendingPage } from './features/institution';
import styles from './App.module.css';

type AuthView = 'login' | 'register';

function isVerifyRoute() {
  return window.location.pathname.startsWith('/verify/');
}

function parseProfileRoute() {
  const pathname = window.location.pathname;
  const match = pathname.match(/^\/profile\/([a-zA-Z0-9]+)$/);
  return match ? match[1] : null;
}

function AppContent() {
  const { user, walletDisconnected } = useAuth();
  const isOrganization = user?.accountType === 'organization'; // ← changed
  const { active, navigate } = useNavigation(
    isOrganization ? 'institution-dashboard' : 'vault' // ← changed
  );
  const [authView, setAuthView] = useState<AuthView>('login');
  const shareParams = new URLSearchParams(window.location.search);
  const isShareLink = Boolean(shareParams.get('wallet') && shareParams.get('token'));
  const publicProfileWallet = parseProfileRoute();

  // Public routes — never show reconnect modal
  if (isVerifyRoute()) return <VerifyPage />;
  if (publicProfileWallet) return <PublicProfilePage publicProfileWallet={publicProfileWallet} />;
  if (isShareLink) return <PublicProfilePage />;

  // Not logged in
  if (!user) {
    return authView === 'login'
      ? <LoginPage onNavigateRegister={() => setAuthView('register')} />
      : <RegisterPage onNavigateLogin={() => setAuthView('login')} />;
  }

  // Logged in but wallet disconnected — show modal over the app
  if (walletDisconnected) {
    return <WalletReconnectModal />;
  }

  return (
    <CredentialProvider key={user.walletAddress}>
      <div className={styles.app}>
        <Sidebar active={active} onNavigate={navigate} />
        <main className={styles.content}>
          {/* Holder routes */}
          {active === 'vault'    && <VaultPage />}
          {active === 'share'    && <SharePage />}
          {active === 'public'   && <PublicProfilePage />}
          {active === 'settings' && <SettingsPage />}
          {/* Organization routes */}
          {active === 'institution-dashboard' && <InstitutionDashboardPage />}
          {active === 'institution-pending'   && <InstitutionPendingPage />}
        </main>
      </div>
    </CredentialProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}