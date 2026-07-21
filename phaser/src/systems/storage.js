// systems/storage.js — persistence port. Systems never touch localStorage
// directly; they receive this interface. Unity port: ISaveStore backed by
// PlayerPrefs or a JSON file — only this adapter changes.

export function createStorage(backend, prefix = 'awp_') {
  return {
    get(key) {
      try {
        const raw = backend.getItem(prefix + key);
        return raw ? JSON.parse(raw) : null;
      } catch { return null; }
    },
    set(key, value) {
      try { backend.setItem(prefix + key, JSON.stringify(value)); } catch { /* quota/private mode */ }
    },
  };
}

export function memoryBackend() {           // for tests / headless sims
  const m = new Map();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
}
