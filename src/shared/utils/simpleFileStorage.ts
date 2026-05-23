export interface SimpleFileStorage {
  save(key: string, blob: Blob): Promise<void>;
  get(key: string): Promise<Blob | null>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
}

export async function createSimpleFileStorage(
  dbName: string = 'SimpleFileDB'
): Promise<SimpleFileStorage> {
  const storeName = 'files';

  const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  };

  const db = await openDB();

  return {
    async save(key: string, blob: Blob): Promise<void> {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      store.put(blob, key);
      return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    },

    async get(key: string): Promise<Blob | null> {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);
      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    },

    async remove(key: string): Promise<void> {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      store.delete(key);
      return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    },

    async clear(): Promise<void> {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      store.clear();
      return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    },
  };
}