import { createSimpleStorage } from "../shared/utils/simpleStorage";
import type { SimpleStorage } from "../shared/utils/simpleStorage";

import { createSimpleFileStorage } from "../shared/utils/simpleFileStorage";

// 1. Initialize string storage (localStorage)
const stringStorage: SimpleStorage = createSimpleStorage();

// 2. Fixed key for storing the CURRENT active wallet address
const CURRENT_WALLET_KEY = "credvault_current_wallet";

export function getCurrentWallet(): string | null {
  return stringStorage.get(CURRENT_WALLET_KEY);
}

export function setCurrentWallet(address: string): void {
  stringStorage.set(CURRENT_WALLET_KEY, address);
}

function clearCurrentWallet(): void {
  stringStorage.remove(CURRENT_WALLET_KEY);
}

// 3. Helper to build prefixed keys for a given wallet address
function getWalletKey(walletAddress: string, suffix: string): string {
  return `credvault_${walletAddress}_${suffix}`;
}

// 4. Delete everything associated with a wallet EXCEPT the current wallet pointer
export async function deleteWalletData(walletAddress: string): Promise<void> {
  // Delete all localStorage keys that start with the wallet's prefix
  const prefix = `credvault_${walletAddress}_`;
  Object.keys(localStorage).forEach((key) => {
    if (key.startsWith(prefix)) {
      localStorage.removeItem(key);
    }
  });

  // Delete the wallet's entire IndexedDB database (all files)
  const dbName = `CredentialFiles_${walletAddress}`;
  indexedDB.deleteDatabase(dbName);
}

// 5. Delete entire wallet (including the current wallet pointer)
export async function deleteEntireWallet(walletAddress: string): Promise<void> {
  await deleteWalletData(walletAddress);
  if (getCurrentWallet() === walletAddress) {
    clearCurrentWallet();
  }
}

// 6. Credential metadata (generic type T)
export function saveCredentialsMeta<T = unknown>(
  walletAddress: string,
  metadata: T[],
): void {
  const key = getWalletKey(walletAddress, "creds_meta");
  stringStorage.set(key, JSON.stringify(metadata));
}

export function loadCredentialsMeta<T = unknown>(walletAddress: string): T[] {
  const key = getWalletKey(walletAddress, "creds_meta");
  const raw = stringStorage.get(key);
  return raw ? (JSON.parse(raw) as T[]) : [];
}

// 7. Credential files (blobs stored in IndexedDB)
export async function saveCredentialFile(
  walletAddress: string,
  credentialId: string,
  blob: Blob,
): Promise<void> {
  const walletDbName = `CredentialFiles_${walletAddress}`;
  const walletFileStorage = await createSimpleFileStorage(walletDbName);
  const key = getWalletKey(walletAddress, `file_${credentialId}`);
  await walletFileStorage.save(key, blob);
}

export async function loadCredentialFile(
  walletAddress: string,
  credentialId: string,
): Promise<Blob | null> {
  const walletDbName = `CredentialFiles_${walletAddress}`;
  const walletFileStorage = await createSimpleFileStorage(walletDbName);
  const key = getWalletKey(walletAddress, `file_${credentialId}`);
  return await walletFileStorage.get(key);
}

export async function deleteCredentialFile(
  walletAddress: string,
  credentialId: string,
): Promise<void> {
  const walletDbName = `CredentialFiles_${walletAddress}`;
  const walletFileStorage = await createSimpleFileStorage(walletDbName);
  const key = getWalletKey(walletAddress, `file_${credentialId}`);
  await walletFileStorage.remove(key);
}

// 8. Custom string data
export function saveCustomString(
  walletAddress: string,
  customKey: string,
  value: string,
): void {
  const fullKey = getWalletKey(walletAddress, `custom_${customKey}`);
  stringStorage.set(fullKey, value);
}

export function loadCustomString(
  walletAddress: string,
  customKey: string,
): string | null {
  const fullKey = getWalletKey(walletAddress, `custom_${customKey}`);
  return stringStorage.get(fullKey);
}

export function deleteCustomString(
  walletAddress: string,
  customKey: string,
): void {
  const fullKey = getWalletKey(walletAddress, `custom_${customKey}`);
  stringStorage.remove(fullKey);
}

// 9. Custom file data
export async function saveCustomFile(
  walletAddress: string,
  customId: string,
  blob: Blob,
): Promise<void> {
  const walletDbName = `CredentialFiles_${walletAddress}`;
  const walletFileStorage = await createSimpleFileStorage(walletDbName);
  const key = getWalletKey(walletAddress, `custom_file_${customId}`);
  await walletFileStorage.save(key, blob);
}

export async function loadCustomFile(
  walletAddress: string,
  customId: string,
): Promise<Blob | null> {
  const walletDbName = `CredentialFiles_${walletAddress}`;
  const walletFileStorage = await createSimpleFileStorage(walletDbName);
  const key = getWalletKey(walletAddress, `custom_file_${customId}`);
  return await walletFileStorage.get(key);
}

export async function deleteCustomFile(
  walletAddress: string,
  customId: string,
): Promise<void> {
  const walletDbName = `CredentialFiles_${walletAddress}`;
  const walletFileStorage = await createSimpleFileStorage(walletDbName);
  const key = getWalletKey(walletAddress, `custom_file_${customId}`);
  await walletFileStorage.remove(key);
}
