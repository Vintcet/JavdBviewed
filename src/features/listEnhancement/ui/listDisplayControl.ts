import type { ListDisplayControlConfig } from '../domain/config';
import { buildListDisplayControlStyles } from './styles';

export interface ApplyListDisplayControlOptions {
  document: Document;
  window: Window;
  control?: ListDisplayControlConfig;
  allowedHosts?: string[];
  logger?: (...args: any[]) => void;
}

export interface ApplyListDisplayControlResult {
  applied: boolean;
  reason?: 'unsupported-host' | 'disabled';
  containersProcessed: number;
  itemWidthCalc?: string;
  marginValue?: string;
}

const STYLE_ID = 'x-list-display-control';
const NAV_SEARCH_BOX_ID = 'x-nav-search-box';
const ALLOWED_DOMAINS = ['javdb.com', 'javdb570.com'];

export function applyListDisplayControl(options: ApplyListDisplayControlOptions): ApplyListDisplayControlResult {
  const { document: documentRef, window: windowRef, control } = options;
  const hostname = windowRef.location.hostname;

  if (!isListDisplayControlAllowedHost(hostname, options.allowedHosts)) {
    options.logger?.('[LIST DISPLAY] Domain not allowed for list display control:', hostname);
    removeListDisplayControlStyle(documentRef);
    restoreSearchBarPlacement(documentRef);
    const containersProcessed = clearListDisplayContainerOverrides(documentRef);
    return { applied: false, reason: 'unsupported-host', containersProcessed };
  }

  options.logger?.('[LIST DISPLAY] Applying list display styles...', {
    control,
    enabled: control?.enabled,
    columnCount: control?.columnCount,
    containerWidth: control?.containerWidth,
    hostname,
  });

  if (!control || !control.enabled) {
    removeListDisplayControlStyle(documentRef);
    restoreSearchBarPlacement(documentRef);
    const containersProcessed = clearListDisplayContainerOverrides(documentRef);
    options.logger?.('[LIST DISPLAY] Removed custom styles (disabled)');
    return { applied: false, reason: 'disabled', containersProcessed };
  }

  removeListDisplayControlStyle(documentRef);
  if (control.enableSearchBarLayout === false) {
    restoreSearchBarPlacement(documentRef);
  } else {
    mountSearchBarIntoNavbar(documentRef);
  }
  const containersProcessed = processListDisplayContainers(documentRef);
  if (containersProcessed > 0) {
    options.logger?.('[LIST DISPLAY] Processed containers:', containersProcessed);
  }

  const { columnCount, containerWidth, enableContainerExpansion, enableWideLayout, enableSearchBarLayout } = control;
  const { styleContent, itemWidthCalc, marginValue } = buildListDisplayControlStyles({
    columnCount,
    containerWidth,
    enableContainerExpansion,
    enableWideLayout,
    enableSearchBarLayout,
    isVideoDetailPage: windowRef.location.pathname.startsWith('/v/'),
    isActorPage: windowRef.location.pathname.startsWith('/actors/'),
  });

  const style = documentRef.createElement('style');
  style.id = STYLE_ID;
  style.textContent = styleContent;
  documentRef.head.appendChild(style);

  options.logger?.('[LIST DISPLAY] ✓ List display styles applied successfully', {
    columnCount,
    containerWidth,
    enableContainerExpansion,
    itemWidthCalc,
    margin: marginValue,
    containersProcessed,
  });

  return {
    applied: true,
    containersProcessed,
    itemWidthCalc,
    marginValue,
  };
}

export function processListDisplayContainers(documentRef: Document): number {
  const containers = documentRef.querySelectorAll('.movie-list.h') as NodeListOf<HTMLElement>;
  containers.forEach(container => {
    removeColumnsClasses(container);
    container.setAttribute('data-x-cols-override', 'true');
  });
  return containers.length;
}

export function clearListDisplayContainerOverrides(documentRef: Document): number {
  const containers = documentRef.querySelectorAll('.movie-list.h') as NodeListOf<HTMLElement>;
  containers.forEach(container => {
    container.removeAttribute('data-x-cols-override');
  });
  return containers.length;
}

export function removeListDisplayControlStyle(documentRef: Document): void {
  documentRef.getElementById(STYLE_ID)?.remove();
}

export function mountSearchBarIntoNavbar(documentRef: Document): boolean {
  const navTarget = findNavbarTarget(documentRef);
  if (!navTarget) return false;

  const searchBar = findSearchBar(documentRef);
  if (searchBar) {
    if (!searchBar.hasAttribute('data-x-prev-display')) {
      searchBar.setAttribute('data-x-prev-display', searchBar.style.display || '');
    }
    searchBar.setAttribute('data-x-original-search-hidden', 'true');
  }

  let box = documentRef.getElementById(NAV_SEARCH_BOX_ID) as HTMLElement | null;
  if (!box) {
    box = createNavSearchBox(documentRef);
  }

  if (box.parentElement !== navTarget.parentElement) {
    navTarget.insertAdjacentElement('afterend', box);
  }

  return true;
}

export function restoreSearchBarPlacement(documentRef: Document): void {
  const searchBar = findSearchBar(documentRef);
  if (searchBar?.getAttribute('data-x-original-search-hidden') === 'true') {
    searchBar.style.display = searchBar.getAttribute('data-x-prev-display') || '';
    searchBar.removeAttribute('data-x-prev-display');
    searchBar.removeAttribute('data-x-original-search-hidden');
  }

  documentRef.getElementById(NAV_SEARCH_BOX_ID)?.remove();
}

export function isListDisplayControlAllowedHost(hostname: string, extraAllowedHosts: string[] = []): boolean {
  const allowedDomains = Array.from(new Set([
    ...ALLOWED_DOMAINS,
    ...extraAllowedHosts
      .map(host => String(host || '').trim().toLowerCase())
      .filter(Boolean),
  ]));
  const normalizedHostname = String(hostname || '').trim().toLowerCase();
  return allowedDomains.some(domain =>
    normalizedHostname === domain || normalizedHostname.endsWith(`.${domain}`)
  );
}

function removeColumnsClasses(container: HTMLElement): void {
  for (let i = 1; i <= 8; i++) {
    container.classList.remove(`cols-${i}`);
  }
}

function findSearchBar(documentRef: Document): HTMLElement | null {
  return documentRef.querySelector<HTMLElement>('#search-bar-container, #search-bar-wrap');
}

function findNavbarTarget(documentRef: Document): HTMLElement | null {
  return documentRef.querySelector<HTMLElement>(
    '#navbar-menu-hero, .navbar .navbar-menu:first-of-type, #navbar-menu, .navbar-menu'
  );
}

function createNavSearchBox(documentRef: Document): HTMLElement {
  const box = documentRef.createElement('div');
  box.id = NAV_SEARCH_BOX_ID;
  box.className = 'navbar-menu x-nav-search-box';
  box.innerHTML = `
    <div class="navbar-start x-nav-search-inner">
      <select id="x-nav-search-type" aria-label="搜索类型">
        <option value="all">影片</option>
        <option value="actor">演员</option>
        <option value="series">系列</option>
        <option value="maker">片商</option>
        <option value="director">导演</option>
        <option value="code">番号</option>
        <option value="list">清单</option>
      </select>
      <input id="x-nav-search-keyword" type="text" placeholder="输入影片番号、演员名等关键词进行检索" autocomplete="off">
      <a id="x-nav-advanced-search" href="/advanced_search?noFold=1" title="高级检索">...</a>
      <button id="x-nav-image-search" type="button">识图</button>
      <button id="x-nav-search-submit" type="button">搜索</button>
    </div>
  `;

  const keyword = box.querySelector<HTMLInputElement>('#x-nav-search-keyword');
  const type = box.querySelector<HTMLSelectElement>('#x-nav-search-type');
  const submit = box.querySelector<HTMLButtonElement>('#x-nav-search-submit');
  const image = box.querySelector<HTMLButtonElement>('#x-nav-image-search');
  const runSearch = () => {
    const q = String(keyword?.value || '').trim();
    if (!q) return;
    const f = String(type?.value || 'all');
    documentRef.defaultView?.location.assign(`/search?q=${encodeURIComponent(q)}&f=${encodeURIComponent(f)}`);
  };

  submit?.addEventListener('click', runSearch);
  keyword?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      runSearch();
    }
  });
  image?.addEventListener('click', () => {
    const originTrigger = documentRef.querySelector<HTMLElement>('#button-search-image, .search-image, [data-action*="image"], input[type="file"][accept*="image"]');
    originTrigger?.click();
  });

  return box;
}
