export interface SimpleStorage {
  set(key: string, value: string): void;
  get(key: string): string | null;
  remove(key: string): void;
  clear(): void;
}

export function createSimpleStorage(): SimpleStorage {
  return {
    set(key: string, value: string): void {
      localStorage.setItem(key, value);
    },
    get(key: string): string | null {
      return localStorage.getItem(key);
    },
    remove(key: string): void {
      localStorage.removeItem(key);
    },
    clear(): void {
      localStorage.clear();
    },
  };
}