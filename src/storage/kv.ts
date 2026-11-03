// Capa mínima de clave-valor. Implementación real sobre chrome.storage.local y una en memoria para tests.
export interface KV {
  getAll(): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

export const chromeKV: KV = {
  getAll: () => chrome.storage.local.get(null),
  set: (items) => chrome.storage.local.set(items),
  remove: (keys) => (keys.length ? chrome.storage.local.remove(keys) : Promise.resolve()),
};

export class MemoryKV implements KV {
  data: Record<string, unknown> = {};
  async getAll() { return structuredClone(this.data); }
  async set(items: Record<string, unknown>) { Object.assign(this.data, structuredClone(items)); }
  async remove(keys: string[]) { for (const k of keys) delete this.data[k]; }
}
