import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installDrive115V2Proxy } from '../../src/features/drive115/v2/backgroundProxy';
import { getChromeStorageSnapshot, setChromeStorage } from '../setup/chrome';

const COOKIE_STORAGE_KEY = 'drive115:legacyCookieJar:v1';

function installProxyForTest(): (message: any) => Promise<any> {
  (globalThis as any).__drive115_v2_proxy_flag = false;
  installDrive115V2Proxy();
  const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls.at(-1)?.[0];
  if (!listener) throw new Error('proxy listener not registered');

  return (message: any) => new Promise((resolve) => {
    listener(message, {} as chrome.runtime.MessageSender, resolve);
  });
}

describe('drive115 legacy cookie proxy', () => {
  beforeEach(() => {
    (chrome as any).cookies = {
      getAll: vi.fn((_details: chrome.cookies.GetAllDetails, callback: (cookies: chrome.cookies.Cookie[]) => void) => {
        callback([]);
      }),
      set: vi.fn((details: chrome.cookies.SetDetails, callback: (cookie?: chrome.cookies.Cookie) => void) => {
        callback({
          name: details.name,
          value: details.value || '',
          domain: details.domain || '.115.com',
          hostOnly: false,
          path: details.path || '/',
          secure: details.secure !== false,
          httpOnly: details.httpOnly === true,
          session: false,
          sameSite: details.sameSite || 'lax',
          storeId: '0',
        } as chrome.cookies.Cookie);
      }),
    };

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ state: true, data: [] }),
    })));
  });

  it('restores saved 115 web cookies before legacy search requests', async () => {
    setChromeStorage({
      [COOKIE_STORAGE_KEY]: {
        updatedAt: Date.now(),
        cookies: [
          { name: 'UID', value: 'uid-value', storedAt: Date.now() },
          { name: 'CID', value: 'cid-value', storedAt: Date.now() },
          { name: 'SEID', value: 'seid-value', storedAt: Date.now(), httpOnly: true },
          { name: 'KID', value: 'kid-value', storedAt: Date.now() },
        ],
      },
    });
    const sendMessage = installProxyForTest();

    const response = await sendMessage({
      type: 'drive115.search_files_legacy',
      payload: { searchValue: 'ABC-001', offset: 0, limit: 30 },
    });

    expect(response.success).toBe(true);
    expect(response.cookieState).toMatchObject({ source: 'stored', count: 4 });
    expect(chrome.cookies.set).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'SEID',
        value: 'seid-value',
        domain: '.115.com',
        httpOnly: true,
        secure: true,
        sameSite: 'no_restriction',
      }),
      expect.any(Function),
    );
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('https://webapi.115.com/files/search?'),
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('stores captured 115 cookies in a background-fetch compatible shape', async () => {
    vi.mocked(chrome.cookies.getAll).mockImplementation((details: chrome.cookies.GetAllDetails, callback: (cookies: chrome.cookies.Cookie[]) => void) => {
      if (details.domain === '115.com') {
        callback([
          {
            name: 'UID',
            value: 'uid-current',
            domain: '115.com',
            hostOnly: true,
            path: '/',
            secure: false,
            httpOnly: false,
            session: true,
            sameSite: 'lax',
            storeId: '0',
          },
          {
            name: 'SEID',
            value: 'seid-current',
            domain: '.115.com',
            hostOnly: false,
            path: '/',
            secure: true,
            httpOnly: true,
            session: false,
            sameSite: 'lax',
            storeId: '0',
          },
        ] as chrome.cookies.Cookie[]);
        return;
      }
      callback([]);
    });
    const sendMessage = installProxyForTest();

    const response = await sendMessage({ type: 'drive115.capture_legacy_cookies' });
    const stored = getChromeStorageSnapshot()[COOKIE_STORAGE_KEY];

    expect(response).toMatchObject({ success: true, count: 2, names: ['UID', 'SEID'] });
    expect(stored.cookies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'UID',
          value: 'uid-current',
          domain: '.115.com',
          path: '/',
          secure: true,
          sameSite: 'no_restriction',
        }),
      ]),
    );
  });

  it('retries legacy search once after a login response', async () => {
    setChromeStorage({
      [COOKIE_STORAGE_KEY]: {
        updatedAt: Date.now(),
        cookies: [
          { name: 'UID', value: 'uid-value', storedAt: Date.now() },
          { name: 'CID', value: 'cid-value', storedAt: Date.now() },
          { name: 'SEID', value: 'seid-value', storedAt: Date.now() },
          { name: 'KID', value: 'kid-value', storedAt: Date.now() },
        ],
      },
    });
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ state: false, message: '请登录', data: null }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ state: true, data: [{ n: 'ABC-001.mp4', pc: 'pick' }], count: 1 }),
      } as Response);
    const sendMessage = installProxyForTest();

    const response = await sendMessage({
      type: 'drive115.search_files_legacy',
      payload: { searchValue: 'ABC-001', offset: 0, limit: 30 },
    });

    expect(response.success).toBe(true);
    expect(response.count).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(response.cookieState.retry).toMatchObject({ source: 'stored', count: 4 });
  });
});
