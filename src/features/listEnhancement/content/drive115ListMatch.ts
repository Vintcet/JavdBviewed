import type { ExtensionSettings } from '../../../types';
import { isDrive115Enabled, searchFilesLegacyWeb as searchDrive115ListFiles } from '../../drive115/router';
import type { Drive115File } from '../../drive115/app/types';
import { ensureListTagContainer } from '../../embyLibrary/content/statusBadges';
import { log } from '../../contentState';

const MATCH_TAG_CLASS = 'jdb-drive115-list-match';
const MATCH_DETAIL_CLASS = 'jdb-drive115-list-match-detail';
const MAX_ACTIVE_SEARCHES = 6;
const SEARCH_START_INTERVAL_MS = 100;
const RATE_LIMIT_COOLDOWN_MS = 60_000;
const PERSISTENT_CACHE_KEY = 'drive115:listMatchLegacySearchCache:v1';
const PERSISTENT_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const PERSISTENT_CACHE_MAX_ENTRIES = 800;

let drive115EnabledPromise: Promise<boolean> | null = null;
let activeSearches = 0;
let nextSearchAt = 0;
let cooldownUntil = 0;
const searchQueue: Array<() => void> = [];
const searchCache = new Map<string, Promise<Drive115File[]>>();
let persistentCachePromise: Promise<Record<string, CachedSearchEntry>> | null = null;

interface CachedDrive115File {
  name: string;
  pickCode: string;
  fileId: string;
  parentId: string;
  size: number;
  updatedAt: number;
}

interface CachedSearchEntry {
  updatedAt: number;
  files: CachedDrive115File[];
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeCode(value: string): string {
  return String(value || '').trim().toUpperCase().replace(/[_\s]+/g, '-');
}

function buildCodePattern(videoId: string): RegExp | null {
  const code = normalizeCode(videoId);
  if (!code) return null;

  const fc2 = code.match(/^FC2-(?:PPV-)?(\d+)$/);
  if (fc2) {
    return new RegExp(`(^|[^A-Z0-9])FC2[-_\\s]*(?:PPV[-_\\s]*)?${escapePattern(fc2[1])}(?=$|[^A-Z0-9])`, 'i');
  }

  const parts = code.split(/[^A-Z0-9]+/).filter(Boolean);
  if (parts.length === 0) return null;

  const body = parts.map(escapePattern).join('[-_\\s.]*');
  return new RegExp(`(^|[^A-Z0-9])${body}(?=$|[^A-Z0-9])`, 'i');
}

function isVideoFileName(name: string): boolean {
  return /\.(mp4|mkv|avi|mov|wmv|flv|ts|m4v|iso)$/i.test(name || '');
}

function filterDrive115ListMatches(files: Drive115File[], videoId: string): Drive115File[] {
  const pattern = buildCodePattern(videoId);
  if (!pattern) return [];

  return (Array.isArray(files) ? files : [])
    .filter((file) => {
      const name = String(file.name || '');
      return !!(file.fileId || file.pickCode) && isVideoFileName(name) && pattern.test(name);
    })
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function formatSize(bytes: number): string {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size >= 10 || index === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[index]}`;
}

function formatDate(timestamp: number): string {
  const seconds = Number(timestamp || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return '-';
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return '-';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function canUseChromeStorage(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage?.local;
}

function serializeFile(file: Drive115File): CachedDrive115File {
  return {
    name: String(file.name || ''),
    pickCode: String(file.pickCode || ''),
    fileId: String(file.fileId || ''),
    parentId: String(file.parentId || ''),
    size: Number(file.size || 0) || 0,
    updatedAt: Number(file.updatedAt || 0) || 0,
  };
}

function hydrateFile(file: CachedDrive115File): Drive115File {
  return {
    name: String(file.name || ''),
    pickCode: String(file.pickCode || ''),
    fileId: String(file.fileId || ''),
    parentId: String(file.parentId || ''),
    size: Number(file.size || 0) || 0,
    updatedAt: Number(file.updatedAt || 0) || 0,
    raw: null,
  };
}

function loadPersistentCache(): Promise<Record<string, CachedSearchEntry>> {
  if (!canUseChromeStorage()) return Promise.resolve({});
  if (persistentCachePromise) return persistentCachePromise;

  persistentCachePromise = new Promise((resolve) => {
    try {
      chrome.storage.local.get(PERSISTENT_CACHE_KEY, (result) => {
        const cache = result?.[PERSISTENT_CACHE_KEY];
        resolve(cache && typeof cache === 'object' && !Array.isArray(cache)
          ? cache as Record<string, CachedSearchEntry>
          : {});
      });
    } catch {
      resolve({});
    }
  });
  return persistentCachePromise;
}

function prunePersistentCache(cache: Record<string, CachedSearchEntry>): void {
  const now = Date.now();
  for (const [key, entry] of Object.entries(cache)) {
    if (!entry || now - Number(entry.updatedAt || 0) > PERSISTENT_CACHE_TTL_MS) {
      delete cache[key];
    }
  }

  const entries = Object.entries(cache);
  if (entries.length <= PERSISTENT_CACHE_MAX_ENTRIES) return;
  entries
    .sort((a, b) => Number(b[1]?.updatedAt || 0) - Number(a[1]?.updatedAt || 0))
    .slice(PERSISTENT_CACHE_MAX_ENTRIES)
    .forEach(([key]) => delete cache[key]);
}

async function readPersistentCachedResults(key: string): Promise<Drive115File[] | null> {
  const cache = await loadPersistentCache();
  const entry = cache[key];
  if (!entry || Date.now() - Number(entry.updatedAt || 0) > PERSISTENT_CACHE_TTL_MS) {
    if (entry) {
      delete cache[key];
      void persistCache(cache);
    }
    return null;
  }

  return Array.isArray(entry.files) ? entry.files.map(hydrateFile) : [];
}

async function persistCache(cache: Record<string, CachedSearchEntry>): Promise<void> {
  if (!canUseChromeStorage()) return;
  prunePersistentCache(cache);
  await new Promise<void>((resolve) => {
    try {
      chrome.storage.local.set({ [PERSISTENT_CACHE_KEY]: cache }, () => resolve());
    } catch {
      resolve();
    }
  });
}

function writePersistentCachedResults(key: string, files: Drive115File[]): void {
  void loadPersistentCache().then((cache) => {
    cache[key] = {
      updatedAt: Date.now(),
      files: (Array.isArray(files) ? files : []).map(serializeFile),
    };
    return persistCache(cache);
  });
}

function invalidatePersistentCachedResults(key: string): void {
  void loadPersistentCache().then((cache) => {
    if (!(key in cache)) return;
    delete cache[key];
    return persistCache(cache);
  });
}

function scheduleSearch<T>(task: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      activeSearches += 1;
      const now = Date.now();
      const scheduledStartAt = Math.max(now, nextSearchAt, cooldownUntil);
      nextSearchAt = scheduledStartAt + SEARCH_START_INTERVAL_MS;
      const waitMs = Math.max(0, scheduledStartAt - now);
      const startTask = () => {
        task()
          .then(resolve, reject)
          .finally(() => {
            activeSearches = Math.max(0, activeSearches - 1);
            const next = searchQueue.shift();
            if (next) next();
          });
      };
      if (waitMs > 0) window.setTimeout(startTask, waitMs);
      else startTask();
    };

    if (activeSearches < MAX_ACTIVE_SEARCHES) run();
    else searchQueue.push(run);
  });
}

function isRateLimitLikeError(error: any): boolean {
  const message = String(error?.message || error || '');
  return /风控|频繁|rate|limit|too many|请求失败|后台旧接口搜索请求失败/i.test(message);
}

function getDrive115Enabled(): Promise<boolean> {
  if (!drive115EnabledPromise) {
    drive115EnabledPromise = isDrive115Enabled().catch(() => false);
  }
  return drive115EnabledPromise;
}

function getSearchResults(videoId: string): Promise<Drive115File[]> {
  const key = normalizeCode(videoId);
  const cached = searchCache.get(key);
  if (cached) return cached;

  const promise = (async () => {
    const persistentCached = await readPersistentCachedResults(key);
    if (persistentCached) return persistentCached;

    const files = await scheduleSearch(() => searchDrive115ListFiles(videoId));
    writePersistentCachedResults(key, files);
    return files;
  })()
    .catch((error) => {
      searchCache.delete(key);
      if (isRateLimitLikeError(error)) {
        cooldownUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
      }
      throw error;
    });
  searchCache.set(key, promise);
  return promise;
}

function invalidateSearchCache(videoId: string): void {
  const key = normalizeCode(videoId);
  searchCache.delete(key);
  invalidatePersistentCachedResults(key);
}

function playFile(file: Drive115File): void {
  if (!file.pickCode) return;
  window.open(`https://115vod.com/?pickcode=${encodeURIComponent(file.pickCode)}&share_id=0`, '_blank', 'noopener,noreferrer');
}

function closeMatchDetails(): void {
  document.querySelectorAll(`.${MATCH_DETAIL_CLASS}`).forEach((node) => node.remove());
  document.removeEventListener('click', handleOutsideClick, true);
}

function handleOutsideClick(event: MouseEvent): void {
  const target = event.target as Node | null;
  if (!target) return;
  const detail = document.querySelector(`.${MATCH_DETAIL_CLASS}`);
  if (detail && (detail === target || detail.contains(target))) return;
  if ((target as HTMLElement).closest?.(`.${MATCH_TAG_CLASS}`)) return;
  closeMatchDetails();
}

function showMatchDetails(anchor: HTMLElement, files: Drive115File[]): void {
  closeMatchDetails();
  if (files.length === 1) {
    playFile(files[0]);
    return;
  }

  const detail = document.createElement('div');
  detail.className = MATCH_DETAIL_CLASS;
  const rows = files.slice(0, 12).map((file) => {
    const playUrl = file.pickCode
      ? `https://115vod.com/?pickcode=${encodeURIComponent(file.pickCode)}&share_id=0`
      : '';
    return `
      <tr>
        <td title="${escapeHtml(file.name)}">${escapeHtml(file.name || '-')}</td>
        <td>${escapeHtml(formatSize(file.size))}</td>
        <td>${escapeHtml(formatDate(file.updatedAt))}</td>
        <td>${playUrl ? `<a href="${playUrl}" target="_blank" rel="noopener noreferrer">播放</a>` : '-'}</td>
      </tr>
    `;
  }).join('');

  detail.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>名称</th>
          <th>大小</th>
          <th>时间</th>
          <th>播放</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  document.body.appendChild(detail);
  const rect = anchor.getBoundingClientRect();
  const top = Math.max(8, rect.top + window.scrollY - detail.offsetHeight - 8);
  const left = Math.min(
    Math.max(8, rect.left + window.scrollX),
    Math.max(8, window.scrollX + document.documentElement.clientWidth - detail.offsetWidth - 8),
  );
  detail.style.top = `${top}px`;
  detail.style.left = `${left}px`;

  setTimeout(() => document.addEventListener('click', handleOutsideClick, true), 0);
}

function ensureStyles(): void {
  const styleId = 'jdb-drive115-list-match-style';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    .${MATCH_TAG_CLASS} {
      display: inline-flex !important;
      align-items: center;
      justify-content: center;
      min-height: 23px;
      padding: 0 9px !important;
      border: 1px solid rgba(15, 23, 42, 0.18) !important;
      border-radius: 999px !important;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
      font-size: 12px !important;
      font-weight: 800 !important;
      line-height: 21px;
      cursor: default;
      user-select: none;
    }

    .${MATCH_TAG_CLASS}.is-clickable {
      cursor: pointer;
    }

    .${MATCH_TAG_CLASS}.is-success {
      border-color: rgba(22, 101, 52, 0.36) !important;
      color: #166534 !important;
      background: #dcfce7 !important;
    }

    .${MATCH_TAG_CLASS}.is-warning {
      border-color: rgba(146, 64, 14, 0.36) !important;
      color: #92400e !important;
      background: #fef3c7 !important;
    }

    .${MATCH_TAG_CLASS}.is-danger {
      border-color: rgba(153, 27, 27, 0.34) !important;
      color: #991b1b !important;
      background: #fee2e2 !important;
    }

    .${MATCH_TAG_CLASS}.is-info {
      border-color: rgba(3, 105, 161, 0.30) !important;
      color: #0369a1 !important;
      background: #e0f2fe !important;
    }

    .${MATCH_DETAIL_CLASS} {
      position: absolute;
      z-index: 10000;
      width: min(520px, calc(100vw - 16px));
      max-height: 320px;
      overflow: auto;
      padding: 8px;
      border: 1px solid rgba(15, 23, 42, 0.16);
      border-radius: 6px;
      background: #fff;
      box-shadow: 0 16px 40px rgba(15, 23, 42, 0.20);
      color: #1f2937;
      font-size: 12px;
    }

    .${MATCH_DETAIL_CLASS} table {
      width: 100%;
      border-collapse: collapse;
    }

    .${MATCH_DETAIL_CLASS} th,
    .${MATCH_DETAIL_CLASS} td {
      padding: 5px 7px;
      border: 1px solid rgba(15, 23, 42, 0.10);
      text-align: left;
      vertical-align: middle;
    }

    .${MATCH_DETAIL_CLASS} th {
      background: #f8fafc;
      font-weight: 700;
    }

    .${MATCH_DETAIL_CLASS} td:first-child {
      max-width: 260px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `;
  document.head.appendChild(style);
}

function setTagState(tag: HTMLElement, state: 'loading' | 'matched' | 'empty' | 'disabled' | 'error', text: string, title: string): void {
  tag.className = `tag is-light ${MATCH_TAG_CLASS}`;
  tag.classList.toggle('is-info', state === 'loading' || state === 'disabled');
  tag.classList.toggle('is-success', state === 'matched');
  tag.classList.toggle('is-warning', state === 'empty');
  tag.classList.toggle('is-danger', state === 'error');
  tag.classList.toggle('is-clickable', state === 'matched' || state === 'empty' || state === 'error');
  tag.textContent = text;
  tag.title = title;
}

export function renderDrive115ListMatchTag(
  item: HTMLElement,
  videoId: string,
  settings: ExtensionSettings | null,
): void {
  const enabled = (settings as any)?.videoEnhancement?.enableDrive115Match !== false;
  const existing = item.querySelector<HTMLElement>(`.${MATCH_TAG_CLASS}`);
  if (!enabled) {
    existing?.remove();
    return;
  }

  const tagContainer = ensureListTagContainer(item);
  if (!tagContainer || !videoId) return;

  ensureStyles();

  const tag = existing || document.createElement('span');
  if (!existing) tagContainer.appendChild(tag);
  if (item.dataset.drive115ListMatchStarted === 'true') return;

  item.dataset.drive115ListMatchStarted = 'true';
  tag.onclick = null;
  setTagState(tag, 'loading', '匹配中', '正在匹配 115 资源');

  void (async () => {
    try {
      const drive115Enabled = await getDrive115Enabled();
      if (!drive115Enabled) {
        setTagState(tag, 'disabled', '115未启用', '115 功能未启用');
        return;
      }

      const files = await getSearchResults(videoId);
      const matched = filterDrive115ListMatches(files, videoId);
      if (matched.length === 0) {
        setTagState(tag, 'empty', '未匹配', '未匹配到 115 资源，点击重试');
        tag.onclick = (event) => {
          event.preventDefault();
          event.stopPropagation();
          item.dataset.drive115ListMatchStarted = 'false';
          invalidateSearchCache(videoId);
          renderDrive115ListMatchTag(item, videoId, settings);
        };
        return;
      }

      setTagState(tag, 'matched', `匹配${matched.length}个`, matched.length === 1 ? '点击播放' : `点击查看${matched.length}个匹配结果`);
      tag.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        showMatchDetails(tag, matched);
      };
    } catch (error: any) {
      const message = error?.message || '115 匹配失败';
      log(`[Drive115ListMatch] ${videoId}: ${message}`, error);
      if (/未登录115|115未登录|登录115/i.test(message)) {
        setTagState(tag, 'disabled', '115未登录', '请先在浏览器中登录 115 网页端');
        return;
      }
      setTagState(tag, 'error', '匹配失败', `${message}，点击重试`);
      tag.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        item.dataset.drive115ListMatchStarted = 'false';
        invalidateSearchCache(videoId);
        renderDrive115ListMatchTag(item, videoId, settings);
      };
    }
  })();
}
