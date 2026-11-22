import { createId, normalizeScene } from './gifts';
import type { TreeScene } from './gifts';

/** Tiny IndexedDB wrapper: a key/value store for the scene and settings, and a blob store for photos and music. Falls back to memory. */
type StoreName = 'kv' | 'blobs';
const memory: Record<StoreName, Map<string, unknown>> = { kv: new Map(), blobs: new Map() };
let database: Promise<IDBDatabase | null> | undefined;

function open(): Promise<IDBDatabase | null> {
  database ??= new Promise(resolve => {
    try {
      const request = indexedDB.open('snowlit-tree', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('kv');
        request.result.createObjectStore('blobs');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return database;
}

async function run<T>(store: StoreName, mode: IDBTransactionMode, action: (objects: IDBObjectStore) => IDBRequest, fallback: () => T): Promise<T> {
  const db = await open();
  if (!db) return fallback();
  return new Promise(resolve => {
    try {
      const request = action(db.transaction(store, mode).objectStore(store));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => resolve(fallback());
    } catch {
      resolve(fallback());
    }
  });
}

const read = <T>(store: StoreName, key: string) =>
  run<T | undefined>(store, 'readonly', objects => objects.get(key), () => memory[store].get(key) as T | undefined);
const write = (store: StoreName, key: string, value: unknown) =>
  run<unknown>(store, 'readwrite', objects => objects.put(value, key), () => memory[store].set(key, value));
const remove = (store: StoreName, key: string) =>
  run<unknown>(store, 'readwrite', objects => objects.delete(key), () => memory[store].delete(key));
const keys = (store: StoreName) =>
  run<IDBValidKey[]>(store, 'readonly', objects => objects.getAllKeys(), () => [...memory[store].keys()]);

export async function loadScene(): Promise<TreeScene | null> {
  return normalizeScene(await read('kv', 'scene'));
}

let pending: ReturnType<typeof setTimeout> | undefined;
export function saveScene(scene: TreeScene, immediate = false): Promise<void> {
  clearTimeout(pending);
  const snapshot = structuredClone(scene);
  if (immediate) return write('kv', 'scene', snapshot).then(() => {});
  return new Promise(resolve => {
    pending = setTimeout(() => { void write('kv', 'scene', snapshot).then(() => resolve()); }, 400);
  });
}

export async function putBlob(blob: Blob, key = createId()): Promise<string> {
  await write('blobs', key, blob);
  return key;
}

export const getBlob = (key: string) => read<Blob>('blobs', key);
export const deleteBlob = (key: string) => remove('blobs', key);

/** Deletes stored photos no gift refers to any more (the uploaded music track is kept). */
export async function collectBlobs(scene: TreeScene): Promise<void> {
  const used = new Set(scene.gifts.flatMap(gift => gift.image.kind === 'upload' ? [gift.image.blobKey] : []));
  used.add(MUSIC_KEY);
  for (const key of await keys('blobs')) if (typeof key === 'string' && !used.has(key)) await remove('blobs', key);
}

export const MUSIC_KEY = 'music';

const urls = new Map<string, string>();
/** Object URL for a stored blob, cached so repeated lookups reuse one URL. */
export async function blobUrl(key: string): Promise<string | undefined> {
  const cached = urls.get(key);
  if (cached) return cached;
  const blob = await getBlob(key);
  if (!blob) return undefined;
  const url = URL.createObjectURL(blob);
  urls.set(key, url);
  return url;
}

export function forgetUrl(key: string): void {
  const url = urls.get(key);
  if (url) URL.revokeObjectURL(url);
  urls.delete(key);
}

export function readSetting<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(`snowlit:${key}`);
    return value === null ? fallback : JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function writeSetting(key: string, value: unknown): void {
  try {
    localStorage.setItem(`snowlit:${key}`, JSON.stringify(value));
  } catch { /* storage unavailable: setting lasts for this visit only */ }
}
