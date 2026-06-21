import { TranslatorService, DEFAULT_TRANSLATOR_CONFIG } from '../../dataAggregator/sources/translator';
import type { ListPreviewVideoInfo } from '../../previews';
import { getListItemFullTitle } from '../ui/listItemDom';

interface CacheEntry {
  translated: string;
  ts: number;
}

const CACHE_PREFIX = 'jdb_list_title_translation_v1:';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_CONCURRENT_TRANSLATIONS = 3;

const memoryCache = new Map<string, CacheEntry>();
const pendingByKey = new Map<string, Promise<string | null>>();
let activeCount = 0;
const queue: Array<() => void> = [];

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

async function translateTitle(original: string): Promise<string | null> {
  const normalized = normalizeTitle(original);
  if (!normalized || !needsTranslation(normalized)) return null;

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

export async function translateListItemTitle(item: HTMLElement, videoInfo: ListPreviewVideoInfo): Promise<void> {
  if (item.getAttribute('data-title-translation-state') === 'done') return;

  const titleElement = item.querySelector<HTMLElement>('div.video-title');
  if (!titleElement) return;

  const original = getListItemFullTitle(item, videoInfo.code) || videoInfo.title;
  if (!original || !needsTranslation(original)) return;

  item.setAttribute('data-title-translation-state', 'pending');
  const translationElement = ensureTranslationElement(titleElement);
  translationElement.textContent = '翻译中...';
  translationElement.setAttribute('data-state', 'pending');

  try {
    const translated = await translateTitle(original);
    if (!translated) {
      translationElement.remove();
      item.removeAttribute('data-title-translation-state');
      return;
    }

    translationElement.textContent = translated;
    translationElement.setAttribute('data-state', 'done');
    translationElement.setAttribute('title', translated);
    item.setAttribute('data-title-translation-state', 'done');
  } catch {
    translationElement.remove();
    item.removeAttribute('data-title-translation-state');
  }
}

export function clearListItemTitleTranslation(item: HTMLElement): void {
  item.querySelectorAll('.x-title-translation').forEach(node => node.remove());
  item.removeAttribute('data-title-translation-state');
}
