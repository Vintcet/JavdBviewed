import { TranslatorService, DEFAULT_TRANSLATOR_CONFIG } from '../../dataAggregator/sources/translator';
import type { ListPreviewVideoInfo } from '../../previews';
import { getListItemFullTitle } from '../ui/listItemDom';

interface CacheEntry {
  translated: string;
  ts: number;
}

const CACHE_PREFIX = 'jdb_list_title_translation_v1:';
const JHS_TRANSLATE_CACHE_KEY = 'jhs_translate';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_CONCURRENT_TRANSLATIONS = 3;
const ORIGINAL_TITLE_ATTR = 'data-x-original-title';
const TRANSLATED_TITLE_ATTR = 'data-x-translated-title';
const TRANSLATION_MODE_ATTR = 'data-title-translation-mode';
const QUEUED_STATE = 'queued';
const VIEWPORT_ROOT_MARGIN = '900px';

const memoryCache = new Map<string, CacheEntry>();
const pendingByKey = new Map<string, Promise<string | null>>();
let activeCount = 0;
const queue: Array<() => void> = [];
let jhsCache: Record<string, unknown> | null = null;
let jhsCacheFlushTimer: number | null = null;
let titleTranslationObserver: IntersectionObserver | null = null;
const queuedTitleItems = new WeakMap<HTMLElement, { videoInfo: ListPreviewVideoInfo; options: TranslateListItemTitleOptions }>();

const translator = new TranslatorService({
  ...DEFAULT_TRANSLATOR_CONFIG,
  timeout: 4000,
  maxRetries: 1,
});

function normalizeTitle(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function needsTranslation(text: string): boolean {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(text);
}

function hashText(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function getCacheKey(text: string): string {
  return `${CACHE_PREFIX}${hashText(text)}`;
}

function readCache(key: string): CacheEntry | null {
  const memory = memoryCache.get(key);
  if (memory && Date.now() - memory.ts < CACHE_TTL_MS) {
    return memory;
  }

  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (!parsed?.translated || Date.now() - parsed.ts >= CACHE_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    memoryCache.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(key: string, translated: string): void {
  const entry = { translated, ts: Date.now() };
  memoryCache.set(key, entry);
  try {
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {}
}

function readJhsCache(code?: string): string | null {
  if (!code) return null;
  try {
    if (!jhsCache) {
      const raw = localStorage.getItem(JHS_TRANSLATE_CACHE_KEY);
      jhsCache = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    }
    const cached = jhsCache?.[code];
    return typeof cached === 'string' && cached.trim() ? normalizeTitle(cached) : null;
  } catch {
    jhsCache = {};
    return null;
  }
}

function writeJhsCache(code: string | undefined, translated: string): void {
  if (!code) return;
  try {
    if (!jhsCache) {
      const raw = localStorage.getItem(JHS_TRANSLATE_CACHE_KEY);
      jhsCache = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    }
    jhsCache[code] = translated;
    if (jhsCacheFlushTimer !== null) {
      window.clearTimeout(jhsCacheFlushTimer);
    }
    jhsCacheFlushTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(JHS_TRANSLATE_CACHE_KEY, JSON.stringify(jhsCache || {}));
      } catch {}
      jhsCacheFlushTimer = null;
    }, 500);
  } catch {}
}

async function runLimited<T>(task: () => Promise<T>): Promise<T> {
  if (activeCount >= MAX_CONCURRENT_TRANSLATIONS) {
    await new Promise<void>(resolve => queue.push(resolve));
  }

  activeCount += 1;
  try {
    return await task();
  } finally {
    activeCount = Math.max(0, activeCount - 1);
    const next = queue.shift();
    if (next) next();
  }
}

async function translateTitle(original: string, code?: string): Promise<string | null> {
  const normalized = normalizeTitle(original);
  if (!normalized || !needsTranslation(normalized)) return null;

  const jhsCached = readJhsCache(code);
  if (jhsCached) return jhsCached;

  const cacheKey = getCacheKey(normalized);
  const cached = readCache(cacheKey);
  if (cached) return cached.translated;

  const pending = pendingByKey.get(cacheKey);
  if (pending) return pending;

  const request = runLimited(async () => {
    const response = await translator.translate(normalized);
    const translated = normalizeTitle(response.data?.translatedText || '');
    if (!response.success || !translated || translated === normalized) {
      return null;
    }
    writeCache(cacheKey, translated);
    writeJhsCache(code, translated);
    return translated;
  }).finally(() => {
    pendingByKey.delete(cacheKey);
  });

  pendingByKey.set(cacheKey, request);
  return request;
}

function ensureTranslationElement(titleElement: HTMLElement): HTMLElement {
  let element = titleElement.querySelector<HTMLElement>('.x-title-translation');
  if (!element) {
    element = document.createElement('div');
    element.className = 'x-title-translation';
    titleElement.appendChild(element);
  }
  return element;
}

function setTitleText(titleElement: HTMLElement, text: string): void {
  const textNodes = Array.from(titleElement.childNodes)
    .filter((node): node is Text => node.nodeType === Node.TEXT_NODE && !!node.textContent?.trim());

  if (textNodes.length === 0) {
    titleElement.appendChild(document.createTextNode(` ${text}`));
    return;
  }

  textNodes[0].textContent = ` ${text}`;
  textNodes.slice(1).forEach(node => {
    node.textContent = '';
  });
}

function restoreOriginalTitle(titleElement: HTMLElement): void {
  const original = titleElement.getAttribute(ORIGINAL_TITLE_ATTR);
  if (!original) return;
  setTitleText(titleElement, original);
  titleElement.removeAttribute(ORIGINAL_TITLE_ATTR);
  titleElement.removeAttribute(TRANSLATED_TITLE_ATTR);
  titleElement.removeAttribute('title');
}

function replaceTitleWithTranslation(titleElement: HTMLElement, original: string, translated: string): void {
  if (!titleElement.getAttribute(ORIGINAL_TITLE_ATTR)) {
    titleElement.setAttribute(ORIGINAL_TITLE_ATTR, original);
  }
  titleElement.setAttribute(TRANSLATED_TITLE_ATTR, translated);
  titleElement.setAttribute('title', translated);
  titleElement.querySelectorAll('.x-title-translation').forEach(node => node.remove());
  setTitleText(titleElement, translated);
}

export interface TranslateListItemTitleOptions {
  replaceOriginal?: boolean;
}

function isNearViewport(item: HTMLElement): boolean {
  if (typeof window === 'undefined') return true;
  const rect = item.getBoundingClientRect();
  const margin = 900;
  return rect.bottom >= -margin && rect.top <= window.innerHeight + margin;
}

function getTitleTranslationObserver(): IntersectionObserver | null {
  if (typeof IntersectionObserver === 'undefined') return null;
  if (!titleTranslationObserver) {
    titleTranslationObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const item = entry.target as HTMLElement;
        titleTranslationObserver?.unobserve(item);
        const queued = queuedTitleItems.get(item);
        if (!queued) return;
        queuedTitleItems.delete(item);
        void runListItemTitleTranslation(item, queued.videoInfo, queued.options);
      });
    }, { rootMargin: VIEWPORT_ROOT_MARGIN });
  }
  return titleTranslationObserver;
}

function queueTitleTranslation(
  item: HTMLElement,
  videoInfo: ListPreviewVideoInfo,
  options: TranslateListItemTitleOptions,
  mode: string,
): boolean {
  if (isNearViewport(item)) return false;
  queuedTitleItems.set(item, { videoInfo, options });
  item.setAttribute('data-title-translation-state', QUEUED_STATE);
  item.setAttribute(TRANSLATION_MODE_ATTR, mode);
  const observer = getTitleTranslationObserver();
  if (!observer) return false;
  observer.observe(item);
  return true;
}

async function runListItemTitleTranslation(
  item: HTMLElement,
  videoInfo: ListPreviewVideoInfo,
  options: TranslateListItemTitleOptions = {},
): Promise<void> {
  const mode = options.replaceOriginal === true ? 'replace' : 'append';
  if (
    item.getAttribute('data-title-translation-state') === 'done' &&
    item.getAttribute(TRANSLATION_MODE_ATTR) === mode
  ) {
    return;
  }

  const titleElement = item.querySelector<HTMLElement>('div.video-title');
  if (!titleElement) return;

  const original = getListItemFullTitle(item, videoInfo.code) || videoInfo.title;
  if (!original || !needsTranslation(original)) return;

  item.setAttribute('data-title-translation-state', 'pending');
  item.setAttribute(TRANSLATION_MODE_ATTR, mode);

  let translationElement: HTMLElement | null = null;
  if (mode === 'append') {
    restoreOriginalTitle(titleElement);
    translationElement = ensureTranslationElement(titleElement);
    translationElement.textContent = '翻译中...';
    translationElement.setAttribute('data-state', 'pending');
  } else {
    titleElement.querySelectorAll('.x-title-translation').forEach(node => node.remove());
  }

  try {
    const translated = await translateTitle(original, videoInfo.code);
    if (!translated) {
      translationElement?.remove();
      item.removeAttribute('data-title-translation-state');
      item.removeAttribute(TRANSLATION_MODE_ATTR);
      return;
    }

    if (mode === 'replace') {
      replaceTitleWithTranslation(titleElement, original, translated);
    } else if (translationElement) {
      translationElement.textContent = translated;
      translationElement.setAttribute('data-state', 'done');
      translationElement.setAttribute('title', translated);
    }
    item.setAttribute('data-title-translation-state', 'done');
  } catch {
    translationElement?.remove();
    item.removeAttribute('data-title-translation-state');
    item.removeAttribute(TRANSLATION_MODE_ATTR);
  }
}

export async function translateListItemTitle(
  item: HTMLElement,
  videoInfo: ListPreviewVideoInfo,
  options: TranslateListItemTitleOptions = {},
): Promise<void> {
  const mode = options.replaceOriginal === true ? 'replace' : 'append';
  if (
    item.getAttribute('data-title-translation-state') === QUEUED_STATE &&
    item.getAttribute(TRANSLATION_MODE_ATTR) === mode
  ) {
    queuedTitleItems.set(item, { videoInfo, options });
    return;
  }

  if (queueTitleTranslation(item, videoInfo, options, mode)) {
    return;
  }

  await runListItemTitleTranslation(item, videoInfo, options);
}

export function clearListItemTitleTranslation(item: HTMLElement): void {
  queuedTitleItems.delete(item);
  titleTranslationObserver?.unobserve(item);
  const titleElement = item.querySelector<HTMLElement>('div.video-title');
  if (titleElement) restoreOriginalTitle(titleElement);
  item.querySelectorAll('.x-title-translation').forEach(node => node.remove());
  item.removeAttribute('data-title-translation-state');
  item.removeAttribute(TRANSLATION_MODE_ATTR);
}
