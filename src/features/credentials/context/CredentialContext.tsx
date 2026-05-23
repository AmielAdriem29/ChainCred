import { useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { Credential } from '../../../shared/types';
import { useAuth } from '../../auth/context/useAuth';
import { CredentialContext } from './credentialContext';

const VAULT_KEY_PREFIX = 'chaincred_vault_';

function vaultKey(walletAddress: string): string {
  return `${VAULT_KEY_PREFIX}${walletAddress}`;
}

function loadCredentials(walletAddress: string): Credential[] {
  try {
    const raw = localStorage.getItem(vaultKey(walletAddress));
    return raw ? (JSON.parse(raw) as Credential[]) : [];
  } catch {
    return [];
  }
}

function saveCredentials(walletAddress: string, credentials: Credential[]): void {
  try {
    localStorage.setItem(vaultKey(walletAddress), JSON.stringify(credentials));
  } catch {
    console.error('Failed to persist credentials to localStorage.');
  }
}

export function CredentialProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const currentWallet = user?.walletAddress ?? null;
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load credentials when wallet changes
  // Load credentials when wallet changes
/* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (currentWallet) {
      setIsLoading(true);
      const loaded = loadCredentials(currentWallet);
      setCredentials(loaded);
      setIsLoading(false);
    } else {
      setCredentials([]);
      setIsLoading(false);
    }
  }, [currentWallet]);
/* eslint-enable react-hooks/set-state-in-effect */

  // Listen for storage events (cross‑tab sync)
  useEffect(() => {
    if (!currentWallet) return;
    const key = vaultKey(currentWallet);
    const handleStorage = (e: StorageEvent) => {
      if (e.key === key && e.newValue) {
        try {
          setCredentials(JSON.parse(e.newValue) as Credential[]);
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [currentWallet]);

  const persist = useCallback(
    (updater: (prev: Credential[]) => Credential[]) => {
      if (!currentWallet) return;
      setCredentials((prev) => {
        const next = updater(prev);
        saveCredentials(currentWallet, next);
        return next;
      });
    },
    [currentWallet]
  );

  const addCredential = useCallback(
    async (credential: Credential) => {
      persist((prev) => [credential, ...prev]);
    },
    [persist]
  );

  const updateCredential = useCallback(
    async (id: string, updates: Partial<Credential>) => {
      persist((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
    },
    [persist]
  );

  const deleteCredential = useCallback(
    async (id: string) => {
      persist((prev) => prev.filter((c) => c.id !== id));
    },
    [persist]
  );

  return (
    <CredentialContext.Provider
      value={{
        wallet: currentWallet,
        credentials,
        isLoading,
        addCredential,
        updateCredential,
        deleteCredential,
      }}
    >
      {children}
    </CredentialContext.Provider>
  );
}