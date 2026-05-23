import { useState, useMemo, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { AuthContext } from './authContext';
import type { UserProfile } from './authTypes';
import { WALLET_CHECK_DELAY } from '../../../constants/timings';

const STORAGE_KEY = 'chaincred_users';
const SESSION_KEY = 'chaincred_session';
const WALLET_KEY = 'chaincred_wallet';

function getUsers(): Record<string, UserProfile> {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(() => {
    try {
      const session = sessionStorage.getItem(SESSION_KEY);
      localStorage.removeItem(SESSION_KEY);
      return session ? JSON.parse(session) : null;
    } catch {
      return null;
    }
  });

  const [walletDisconnected, setWalletDisconnected] = useState(false);
  const skipNextCheck = useRef(false);

  useEffect(() => {
    if (!user) return;

    if (skipNextCheck.current) {
      skipNextCheck.current = false;
      return;
    }

    let cancelled = false;

    const checkWalletConnection = async () => {
      const walletId = localStorage.getItem(WALLET_KEY);

      if (!walletId) {
        if (!cancelled) setWalletDisconnected(true);
        return;
      }

      const raw = (window as unknown as { cardano?: Record<string, { isEnabled: () => Promise<boolean> }> }).cardano;
      const walletApi = raw?.[walletId];

      if (!walletApi) {
        if (!cancelled) setWalletDisconnected(true);
        return;
      }

      try {
        const enabled = await walletApi.isEnabled();
        if (!cancelled && !enabled) {
          setWalletDisconnected(true);
        }
      } catch {
        if (!cancelled) setWalletDisconnected(true);
      }
    };

    const timer = setTimeout(checkWalletConnection, WALLET_CHECK_DELAY);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [user]);

  const value = useMemo(() => {
    const isRegistered = (address: string) => {
      return Object.prototype.hasOwnProperty.call(getUsers(), address);
    };

    const login = (address: string): UserProfile | null => {
      const profile = getUsers()[address] || null;
      if (profile) {
        skipNextCheck.current = true;
        setUser(profile);
        setWalletDisconnected(false);
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(profile));
      }
      return profile;
    };

    const register = (profile: UserProfile) => {
      const users = getUsers();
      users[profile.walletAddress] = profile;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
      skipNextCheck.current = true;
      setUser(profile);
      setWalletDisconnected(false);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(profile));
    };

    const logout = () => {
      setUser(null);
      setWalletDisconnected(false);
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(WALLET_KEY);
    };

    return {
      user,
      login,
      register,
      logout,
      isRegistered,
      walletDisconnected,
      setWalletDisconnected,
    };
  }, [user, walletDisconnected]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}