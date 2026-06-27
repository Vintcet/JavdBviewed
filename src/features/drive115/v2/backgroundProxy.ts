// src/features/drive115/v2/backgroundProxy.ts
// 抽离 115 v2 后台代理（解决内容脚本 CORS）

function logDrive115Proxy(message: string, data?: any): void {
  try {
    if (data !== undefined) console.info(`[115Proxy] ${message}`, data);
    else console.info(`[115Proxy] ${message}`);
  } catch {}
}

const DRIVE115_LEGACY_COOKIE_STORAGE_KEY = 'drive115:legacyCookieJar:v1';
const DRIVE115_LEGACY_COOKIE_NAMES = new Set(['UID', 'CID', 'SEID', 'KID']);
const DRIVE115_LEGACY_COOKIE_NAME_ORDER = ['UID', 'CID', 'SEID', 'KID'];
const DRIVE115_LEGACY_COOKIE_PERSIST_SECONDS = 30 * 24 * 60 * 60;
const DRIVE115_LEGACY_COOKIE_DOMAIN = '.115.com';
const DRIVE115_LEGACY_COOKIE_PATH = '/';
const DRIVE115_LEGACY_COOKIE_URL = 'https://115.com/';
const DRIVE115_LEGACY_SEARCH_MAX_ACTIVE = 2;
const DRIVE115_LEGACY_SEARCH_START_INTERVAL_MS = 100;

let activeDrive115LegacySearches = 0;
let nextDrive115LegacySearchAt = 0;
const drive115LegacySearchQueue: Array<() => void> = [];

interface StoredDrive115LegacyCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: string;
  expirationDate?: number;
  storedAt: number;
}

interface StoredDrive115LegacyCookieJar {
  updatedAt: number;
  cookies: StoredDrive115LegacyCookie[];
}

function canUseDrive115CookieApi(): boolean {
  return typeof chrome !== 'undefined'
    && !!chrome.cookies?.getAll
    && !!chrome.cookies?.set
    && !!chrome.storage?.local;
}

function storageGet<T>(key: string): Promise<T | undefined> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(key, (result) => {
        resolve(result?.[key] as T | undefined);
      });
    } catch {
      resolve(undefined);
    }
  });
}

function storageSet(key: string, value: any): Promise<void> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set({ [key]: value }, () => resolve());
    } catch {
      resolve();
    }
  });
}

function getCookies(details: chrome.cookies.GetAllDetails): Promise<chrome.cookies.Cookie[]> {
  return new Promise((resolve) => {
    try {
      chrome.cookies.getAll(details, (cookies) => resolve(Array.isArray(cookies) ? cookies : []));
    } catch {
      resolve([]);
    }
  });
}

function setCookie(details: chrome.cookies.SetDetails): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      chrome.cookies.set(details, (cookie) => resolve(!!cookie));
    } catch {
      resolve(false);
    }
  });
}

function normalizeDrive115Cookie(cookie: chrome.cookies.Cookie): StoredDrive115LegacyCookie | null {
  if (!DRIVE115_LEGACY_COOKIE_NAMES.has(cookie.name) || !cookie.value) return null;
  return {
    name: cookie.name,
    value: cookie.value,
    domain: DRIVE115_LEGACY_COOKIE_DOMAIN,
    path: DRIVE115_LEGACY_COOKIE_PATH,
    secure: true,
    httpOnly: cookie.httpOnly === true,
    sameSite: 'no_restriction',
    expirationDate: typeof cookie.expirationDate === 'number' ? cookie.expirationDate : undefined,
    storedAt: Date.now(),
  };
}

function buildCookieSetDetails(cookie: StoredDrive115LegacyCookie): chrome.cookies.SetDetails {
  const nowSec = Math.floor(Date.now() / 1000);
  const persistedExpiry = nowSec + DRIVE115_LEGACY_COOKIE_PERSIST_SECONDS;
  const expirationDate = Math.max(Number(cookie.expirationDate || 0), persistedExpiry);
  const details: chrome.cookies.SetDetails = {
    url: DRIVE115_LEGACY_COOKIE_URL,
    name: cookie.name,
    value: cookie.value,
    domain: DRIVE115_LEGACY_COOKIE_DOMAIN,
    path: DRIVE115_LEGACY_COOKIE_PATH,
    secure: true,
    httpOnly: cookie.httpOnly === true,
    // Extension background fetches are cross-site to 115; SameSite=Lax cookies may be withheld.
    sameSite: 'no_restriction',
    expirationDate,
  };

  return details;
}

function getDrive115CookieScore(cookie: chrome.cookies.Cookie): number {
  let score = 0;
  if (cookie.domain === DRIVE115_LEGACY_COOKIE_DOMAIN) score += 40;
  else if (cookie.domain?.endsWith('.115.com')) score += 20;
  else if (cookie.domain === '115.com') score += 10;
  if (!cookie.session) score += 5;
  if (typeof cookie.expirationDate === 'number') score += Math.min(4, Math.max(0, Math.floor((cookie.expirationDate - Date.now() / 1000) / 86400)));
  if (cookie.secure) score += 1;
  return score;
}

function selectDrive115LegacyCookies(cookies: chrome.cookies.Cookie[]): StoredDrive115LegacyCookie[] {
  const bestByName = new Map<string, chrome.cookies.Cookie>();
  for (const cookie of cookies) {
    if (!DRIVE115_LEGACY_COOKIE_NAMES.has(cookie.name) || !cookie.value) continue;
    const current = bestByName.get(cookie.name);
    if (!current || getDrive115CookieScore(cookie) > getDrive115CookieScore(current)) {
      bestByName.set(cookie.name, cookie);
    }
  }

  return DRIVE115_LEGACY_COOKIE_NAME_ORDER
    .map((name) => bestByName.get(name))
    .filter((cookie): cookie is chrome.cookies.Cookie => !!cookie)
    .map(normalizeDrive115Cookie)
    .filter((cookie): cookie is StoredDrive115LegacyCookie => !!cookie);
}

async function persistDrive115LegacyCookies(cookies: StoredDrive115LegacyCookie[]): Promise<number> {
  if (!canUseDrive115CookieApi()) return 0;
  let count = 0;
  for (const cookie of cookies) {
    if (await setCookie(buildCookieSetDetails(cookie))) {
      count += 1;
    }
  }
  return count;
}

async function readStoredDrive115LegacyCookies(): Promise<StoredDrive115LegacyCookie[]> {
  const jar = await storageGet<StoredDrive115LegacyCookieJar>(DRIVE115_LEGACY_COOKIE_STORAGE_KEY);
  return Array.isArray(jar?.cookies) ? jar.cookies.filter(cookie => DRIVE115_LEGACY_COOKIE_NAMES.has(cookie.name) && !!cookie.value) : [];
}

async function captureDrive115LegacyCookies(): Promise<{ supported: boolean; count: number; names: string[] }> {
  if (!canUseDrive115CookieApi()) {
    return { supported: false, count: 0, names: [] };
  }

  const found = [
    ...(await getCookies({ domain: '115.com' })),
    ...(await getCookies({ url: DRIVE115_LEGACY_COOKIE_URL })),
    ...(await getCookies({ url: 'https://webapi.115.com/' })),
  ];
  const cookies = selectDrive115LegacyCookies(found);

  if (cookies.length === 0) {
    return { supported: true, count: 0, names: [] };
  }

  const jar: StoredDrive115LegacyCookieJar = {
    updatedAt: Date.now(),
    cookies,
  };
  await storageSet(DRIVE115_LEGACY_COOKIE_STORAGE_KEY, jar);
  await persistDrive115LegacyCookies(cookies);
  logDrive115Proxy('legacy cookies captured', { count: cookies.length, names: cookies.map(cookie => cookie.name) });
  return { supported: true, count: cookies.length, names: cookies.map(cookie => cookie.name) };
}

async function restoreDrive115LegacyCookies(): Promise<{ supported: boolean; count: number; names: string[] }> {
  if (!canUseDrive115CookieApi()) {
    return { supported: false, count: 0, names: [] };
  }

  const cookies = await readStoredDrive115LegacyCookies();
  const count = await persistDrive115LegacyCookies(cookies);
  logDrive115Proxy('legacy cookies restored', { count, names: cookies.map(cookie => cookie.name) });
  return { supported: true, count, names: cookies.map(cookie => cookie.name) };
}

async function ensureDrive115LegacyCookies(): Promise<{ supported: boolean; count: number; names: string[]; source: 'stored' | 'current' | 'none' }> {
  const restored = await restoreDrive115LegacyCookies();
  if (restored.count > 0) {
    return { ...restored, source: 'stored' };
  }

  const captured = await captureDrive115LegacyCookies();
  if (captured.count > 0) {
    return { ...captured, source: 'current' };
  }

  return { ...captured, source: 'none' };
}

function scheduleDrive115LegacySearch<T>(task: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      activeDrive115LegacySearches += 1;
      const now = Date.now();
      const scheduledStartAt = Math.max(now, nextDrive115LegacySearchAt);
      nextDrive115LegacySearchAt = scheduledStartAt + DRIVE115_LEGACY_SEARCH_START_INTERVAL_MS;
      const waitMs = Math.max(0, scheduledStartAt - now);

      const start = () => {
        Promise.resolve()
          .then(task)
          .then(resolve, reject)
          .finally(() => {
            activeDrive115LegacySearches = Math.max(0, activeDrive115LegacySearches - 1);
            const next = drive115LegacySearchQueue.shift();
            if (next) next();
          });
      };

      if (waitMs > 0) setTimeout(start, waitMs);
      else start();
    };

    if (activeDrive115LegacySearches < DRIVE115_LEGACY_SEARCH_MAX_ACTIVE) {
      run();
    } else {
      drive115LegacySearchQueue.push(run);
      logDrive115Proxy('legacy search queued', {
        active: activeDrive115LegacySearches,
        queued: drive115LegacySearchQueue.length,
      });
    }
  });
}

export function installDrive115V2Proxy(): void {
  try {
    // 避免重复注册
    // @ts-ignore
    const __drive115_v2_proxy_flag = (globalThis as any).__drive115_v2_proxy_flag;
    if (!__drive115_v2_proxy_flag && typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      // @ts-ignore
      (globalThis as any).__drive115_v2_proxy_flag = true;
      chrome.runtime.onMessage.addListener((message: any, _sender, sendResponse): boolean | void => {
        if (!message || typeof message !== 'object') return false;
        if (message.type === 'drive115.add_task_urls_v2') {
          const payload = message.payload || {};
          const accessToken = String(payload.accessToken || '').trim();
          const urls = String(payload.urls || '');
          const wp_path_id = payload.wp_path_id;
          const base = String(payload.baseUrl || 'https://proapi.115.com').replace(/\/$/, '');
          const correlationId = String(payload.correlationId || '').trim();
          const taskId = String(payload.taskId || '').trim();
          if (!accessToken || !urls) {
            sendResponse({ success: false, message: '缺少 accessToken 或 urls' });
            return false;
          }

          const fd = new FormData();
          fd.set('urls', urls);
          if (wp_path_id !== undefined) fd.set('wp_path_id', String(wp_path_id));

          const fetchStartedAt = Date.now();
          const slowWarnMs = 10000;
          const slowWarnTimer = setTimeout(() => {
            logDrive115Proxy('add_task_urls still pending', {
              taskId,
              correlationId,
              waitedMs: Date.now() - fetchStartedAt,
              wp_path_id: wp_path_id ?? 'root',
            });
          }, slowWarnMs);

          logDrive115Proxy('add_task_urls fetch start', {
            taskId,
            correlationId,
            wp_path_id: wp_path_id ?? 'root',
            startedAt: fetchStartedAt,
          });

          fetch(`${base}/open/offline/add_task_urls`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/json'
            },
            body: fd,
          })
            .then(async (res) => {
              clearTimeout(slowWarnTimer);
              const raw = await res.json().catch(() => ({} as any));
              const ok = typeof raw.state === 'boolean' ? raw.state : res.ok;
              const data = (raw && (raw.data || raw.result)) || undefined;
              logDrive115Proxy('add_task_urls fetch done', {
                taskId,
                correlationId,
                ok,
                status: res.status,
                durationMs: Date.now() - fetchStartedAt,
              });
              sendResponse({ success: ok, message: raw?.message || raw?.error, raw, data });
            })
            .catch((err) => {
              clearTimeout(slowWarnTimer);
              logDrive115Proxy('add_task_urls fetch error', {
                taskId,
                correlationId,
                durationMs: Date.now() - fetchStartedAt,
                error: err?.message || String(err),
              });
              sendResponse({ success: false, message: err?.message || '后台请求失败' });
            });
          return true; // 异步响应
        } else if (message.type === 'drive115.refresh_token_v2') {
          try {
            const rt = String(message?.payload?.refreshToken || '').trim();
            const refreshBase = 'https://passportapi.115.com';
            if (!rt) {
              sendResponse({ success: false, message: '缺少 refresh_token' });
              return false;
            }
            const fd = new URLSearchParams();
            fd.set('refresh_token', rt);
            fetch(`${refreshBase}/open/refreshToken`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
              body: fd.toString(),
            })
              .then(async (res) => {
                const raw = await res.json().catch(() => ({} as any));
                const ok = typeof raw.state === 'boolean' ? raw.state : res.ok;
                sendResponse({ success: ok, raw });
              })
              .catch((err) => {
                sendResponse({ success: false, message: err?.message || '后台刷新请求失败' });
              });
            return true; // 异步响应
          } catch (e: any) {
            sendResponse({ success: false, message: e?.message || '后台刷新异常' });
            return false;
          }
        } else if (message.type === 'drive115.auth_device_code_v2') {
          try {
            const clientId = String(message?.payload?.clientId || '').trim();
            const codeChallenge = String(message?.payload?.codeChallenge || '').trim();
            const codeChallengeMethod = String(message?.payload?.codeChallengeMethod || 'sha256').trim() || 'sha256';
            if (!clientId || !codeChallenge) {
              sendResponse({ success: false, message: '缺少 client_id 或 code_challenge' });
              return false;
            }
            const fd = new URLSearchParams();
            fd.set('client_id', clientId);
            fd.set('code_challenge', codeChallenge);
            fd.set('code_challenge_method', codeChallengeMethod);
            fetch('https://passportapi.115.com/open/authDeviceCode', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
              body: fd.toString(),
            })
              .then(async (res) => {
                const raw = await res.json().catch(() => ({} as any));
                const ok = !!(raw?.data?.uid) || (typeof raw?.state === 'boolean' ? raw.state : res.ok);
                sendResponse({ success: ok, message: raw?.message || raw?.error, raw });
              })
              .catch((err) => {
                sendResponse({ success: false, message: err?.message || '后台获取扫码信息失败' });
              });
            return true;
          } catch (e: any) {
            sendResponse({ success: false, message: e?.message || '后台获取扫码信息异常' });
            return false;
          }
        } else if (message.type === 'drive115.poll_auth_status_v2') {
          try {
            const uid = String(message?.payload?.uid || '').trim();
            const time = String(message?.payload?.time || '').trim();
            const sign = String(message?.payload?.sign || '').trim();
            if (!uid || !time || !sign) {
              sendResponse({ success: false, message: '缺少 uid、time 或 sign' });
              return false;
            }
            const url = new URL('https://qrcodeapi.115.com/get/status/');
            url.searchParams.set('uid', uid);
            url.searchParams.set('time', time);
            url.searchParams.set('sign', sign);
            fetch(url.toString(), {
              method: 'GET',
              headers: { 'Accept': 'application/json' },
            })
              .then(async (res) => {
                const raw = await res.json().catch(() => ({} as any));
                const ok = raw?.state !== undefined || (typeof raw?.code === 'number') || res.ok;
                sendResponse({ success: ok, message: raw?.message || raw?.error, raw });
              })
              .catch((err) => {
                sendResponse({ success: false, message: err?.message || '后台轮询扫码状态失败' });
              });
            return true;
          } catch (e: any) {
            sendResponse({ success: false, message: e?.message || '后台轮询扫码状态异常' });
            return false;
          }
        } else if (message.type === 'drive115.exchange_device_code_v2') {
          try {
            const uid = String(message?.payload?.uid || '').trim();
            const codeVerifier = String(message?.payload?.codeVerifier || '').trim();
            if (!uid || !codeVerifier) {
              sendResponse({ success: false, message: '缺少 uid 或 code_verifier' });
              return false;
            }
            const fd = new URLSearchParams();
            fd.set('uid', uid);
            fd.set('code_verifier', codeVerifier);
            fetch('https://passportapi.115.com/open/deviceCodeToToken', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
              body: fd.toString(),
            })
              .then(async (res) => {
                const raw = await res.json().catch(() => ({} as any));
                const token = raw?.data || raw;
                const ok = !!token?.access_token || (typeof raw?.state === 'boolean' ? raw.state : res.ok);
                sendResponse({ success: ok, message: raw?.message || raw?.error, raw });
              })
              .catch((err) => {
                sendResponse({ success: false, message: err?.message || '后台换取 token 失败' });
              });
            return true;
          } catch (e: any) {
            sendResponse({ success: false, message: e?.message || '后台换取 token 异常' });
            return false;
          }
        } else if (message.type === 'drive115.search_files_v2') {
          try {
            const accessToken = String(message?.payload?.accessToken || '').trim();
            const base = String(message?.payload?.baseUrl || 'https://proapi.115.com').replace(/\/$/, '');
            const query = message?.payload?.query || {};
            if (!accessToken) {
              sendResponse({ success: false, message: '缺少 access_token' });
              return false;
            }

            const url = new URL(`${base}/open/ufile/search`);
            Object.entries(query).forEach(([key, value]) => {
              if (value !== undefined && value !== null && String(value).trim() !== '') {
                url.searchParams.set(key, String(value));
              }
            });

            fetch(url.toString(), {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
              },
            }).then(async (res) => {
              const raw = await res.json().catch(() => ({} as any));
              const ok = typeof raw.state === 'boolean' ? raw.state : res.ok;
              sendResponse({
                success: ok,
                message: raw?.message || raw?.error,
                raw,
                data: raw?.data,
                count: raw?.count,
                limit: raw?.limit,
                offset: raw?.offset,
              });
            }).catch((err) => {
              sendResponse({ success: false, message: err?.message || '后台搜索请求失败' });
            });
            return true;
          } catch (e: any) {
            sendResponse({ success: false, message: e?.message || '后台搜索异常' });
            return false;
          }
        } else if (message.type === 'drive115.capture_legacy_cookies') {
          captureDrive115LegacyCookies()
            .then((result) => sendResponse({ success: result.count > 0, ...result }))
            .catch((err) => sendResponse({ success: false, message: err?.message || '115 Cookie 捕获失败' }));
          return true;
        } else if (message.type === 'drive115.restore_legacy_cookies') {
          restoreDrive115LegacyCookies()
            .then((result) => sendResponse({ success: result.count > 0, ...result }))
            .catch((err) => sendResponse({ success: false, message: err?.message || '115 Cookie 恢复失败' }));
          return true;
        } else if (message.type === 'drive115.search_files_legacy') {
          try {
            const searchValue = String(message?.payload?.searchValue || '').trim();
            const offset = Math.max(0, Number(message?.payload?.offset ?? 0) || 0);
            const limit = Math.min(100, Math.max(1, Number(message?.payload?.limit ?? 30) || 30));
            if (!searchValue) {
              sendResponse({ success: false, message: 'search_value 不能为空' });
              return false;
            }

            const url = new URL('https://webapi.115.com/files/search');
            url.searchParams.set('search_value', searchValue);
            url.searchParams.set('offset', String(offset));
            url.searchParams.set('limit', String(limit));

            scheduleDrive115LegacySearch(async () => {
              const cookieState = await ensureDrive115LegacyCookies();

              const runSearch = async () => {
                const res = await fetch(url.toString(), {
                  method: 'GET',
                  credentials: 'include',
                  headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'X-Requested-With': 'XMLHttpRequest',
                  },
                });

                const text = await res.text().catch(() => '');
                let raw: any = {};
                try {
                  raw = text ? JSON.parse(text) : {};
                } catch {
                  raw = { rawText: text };
                }

                const data = Array.isArray(raw?.data) ? raw.data : [];
                const errorMessage = raw?.error || raw?.message || (res.ok ? '' : `旧接口搜索网络错误: ${res.status}`);
                const loginRequired = /登录|login|signin/i.test(String(errorMessage || text || ''));
                const ok = res.ok && Array.isArray(raw?.data) && raw?.state !== false;
                return {
                  ok,
                  raw,
                  data,
                  errorMessage,
                  loginRequired,
                  count: typeof raw?.count === 'number' ? raw.count : data.length,
                };
              };

              let result = await runSearch();
              let retryCookieState: Awaited<ReturnType<typeof ensureDrive115LegacyCookies>> | undefined;
              if (!result.ok && result.loginRequired) {
                await captureDrive115LegacyCookies();
                retryCookieState = await ensureDrive115LegacyCookies();
                if (retryCookieState.count > 0) {
                  result = await runSearch();
                }
              }

              if (result.ok) {
                void captureDrive115LegacyCookies();
              }
              return {
                success: result.ok,
                message: result.ok ? undefined : (result.loginRequired ? '未登录115网盘，请先打开 115.com 登录一次' : (result.errorMessage || '旧接口搜索失败')),
                raw: result.raw,
                data: result.data,
                count: result.count,
                loginRequired: result.loginRequired,
                cookieState: retryCookieState ? { first: cookieState, retry: retryCookieState } : cookieState,
              };
            }).then((response) => {
              sendResponse(response);
            }).catch((err) => {
              sendResponse({ success: false, message: err?.message || '后台旧接口搜索请求失败' });
            });
            return true;
          } catch (e: any) {
            sendResponse({ success: false, message: e?.message || '后台旧接口搜索异常' });
            return false;
          }
        } else if (message.type === 'drive115.list_files_v2') {
          try {
            const accessToken = String(message?.payload?.accessToken || '').trim();
            const base = String(message?.payload?.baseUrl || 'https://proapi.115.com').replace(/\/$/, '');
            const query = message?.payload?.query || {};
            if (!accessToken) {
              sendResponse({ success: false, message: '缺少 access_token' });
              return false;
            }

            const url = new URL(`${base}/open/ufile/files`);
            Object.entries(query).forEach(([key, value]) => {
              if (value !== undefined && value !== null && String(value).trim() !== '') {
                url.searchParams.set(key, String(value));
              }
            });

            fetch(url.toString(), {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
              },
            }).then(async (res) => {
              const raw = await res.json().catch(() => ({} as any));
              const ok = typeof raw.state === 'boolean' ? raw.state : res.ok;
              sendResponse({
                success: ok,
                message: raw?.message || raw?.error,
                raw,
                data: raw?.data,
                path: raw?.path,
              });
            }).catch((err) => {
              sendResponse({ success: false, message: err?.message || '后台文件列表请求失败' });
            });
            return true;
          } catch (e: any) {
            sendResponse({ success: false, message: e?.message || '后台文件列表异常' });
            return false;
          }
        } else if (message.type === 'drive115.get_quota_info_v2') {
          try {
            const accessToken = String(message?.payload?.accessToken || '').trim();
            const base = String(message?.payload?.baseUrl || 'https://proapi.115.com').replace(/\/$/, '');
            if (!accessToken) {
              sendResponse({ success: false, message: '缺少 access_token' });
              return false;
            }
            fetch(`${base}/open/offline/get_quota_info`, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
              },
            }).then(async (res) => {
              const raw = await res.json().catch(() => ({} as any));
              const ok = typeof raw.state === 'boolean' ? raw.state : res.ok;
              sendResponse({ success: ok, raw });
            }).catch((err) => {
              sendResponse({ success: false, message: err?.message || '后台配额请求失败' });
            });
            return true; // 异步响应
          } catch (e: any) {
            sendResponse({ success: false, message: e?.message || '后台配额异常' });
            return false;
          }
        }
        // 未匹配任何 115 v2 消息类型
        return false;
      });
    }
  } catch (e) {
    // 静默
  }
}
