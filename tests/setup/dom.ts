import { beforeEach, vi } from 'vitest';

function createStorageMock(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear: vi.fn(() => {
      values.clear();
    }),
    getItem: vi.fn((key: string) => {
      const normalizedKey = String(key);
      return values.has(normalizedKey) ? values.get(normalizedKey)! : null;
    }),
    key: vi.fn((index: number) => Array.from(values.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      values.delete(String(key));
    }),
    setItem: vi.fn((key: string, value: string) => {
      values.set(String(key), String(value));
    }),
  } as unknown as Storage;
}

const localStorageMock = createStorageMock();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  configurable: true,
});

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  configurable: true,
});

beforeEach(() => {
  localStorage.clear();
});

Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
  configurable: true,
});

Object.defineProperty(globalThis, 'chrome', {
  value: {
    runtime: {
      id: 'test-runtime',
      lastError: null,
      getURL: vi.fn((path: string) => `chrome-extension://test-runtime/${path}`),
      sendMessage: vi.fn((_message, callback) => callback?.({ ok: true, success: true })),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    storage: {
      local: {
        get: vi.fn((_keys, callback) => {
          const result = {};
          if (callback) {
            callback(result);
            return undefined;
          }
          return Promise.resolve(result);
        }),
        set: vi.fn((_payload, callback) => {
          if (callback) {
            callback();
            return undefined;
          }
          return Promise.resolve();
        }),
        remove: vi.fn((_keys, callback) => {
          if (callback) {
            callback();
            return undefined;
          }
          return Promise.resolve();
        }),
      },
    },
  },
  configurable: true,
});
