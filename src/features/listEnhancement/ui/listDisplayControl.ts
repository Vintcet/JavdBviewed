import type { ListDisplayControlConfig } from '../domain/config';
import { buildListDisplayControlStyles } from './styles';

export interface ApplyListDisplayControlOptions {
  document: Document;
  window: Window;
  control?: ListDisplayControlConfig;
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
const NAV_SEARCH_HOST_ID = 'x-nav-search-host';
const NAV_SEARCH_PLACEHOLDER_ID = 'x-nav-search-placeholder';
const ALLOWED_DOMAINS = ['javdb.com', 'javdb570.com'];

export function applyListDisplayControl(options: ApplyListDisplayControlOptions): ApplyListDisplayControlResult {
  const { document: documentRef, window: windowRef, control } = options;
  const hostname = windowRef.location.hostname;

  if (!isListDisplayControlAllowedHost(hostname)) {
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
  const searchBar = findSearchBar(documentRef);
  const navTarget = findNavbarTarget(documentRef);
  if (!searchBar || !navTarget) return false;

  let host = documentRef.getElementById(NAV_SEARCH_HOST_ID) as HTMLElement | null;
  if (!host) {
    host = documentRef.createElement('div');
    host.id = NAV_SEARCH_HOST_ID;
    host.className = 'navbar-item x-nav-search-host';
  }

  if (!documentRef.getElementById(NAV_SEARCH_PLACEHOLDER_ID)) {
    const placeholder = documentRef.createElement('span');
    placeholder.id = NAV_SEARCH_PLACEHOLDER_ID;
    placeholder.hidden = true;
    searchBar.parentElement?.insertBefore(placeholder, searchBar);
  }

  if (host.parentElement !== navTarget) {
    navTarget.appendChild(host);
  }

  if (searchBar.parentElement !== host) {
    host.appendChild(searchBar);
  }

  searchBar.setAttribute('data-x-nav-search', 'true');
  return true;
}

export function restoreSearchBarPlacement(documentRef: Document): void {
  const host = documentRef.getElementById(NAV_SEARCH_HOST_ID);
  const placeholder = documentRef.getElementById(NAV_SEARCH_PLACEHOLDER_ID);
  const searchBar = host?.querySelector<HTMLElement>('#search-bar-container, #search-bar-wrap');

  if (placeholder && searchBar) {
    placeholder.parentElement?.insertBefore(searchBar, placeholder);
    searchBar.removeAttribute('data-x-nav-search');
  }

  placeholder?.remove();
  host?.remove();
}

export function isListDisplayControlAllowedHost(hostname: string): boolean {
  return ALLOWED_DOMAINS.some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
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
    '.navbar .navbar-end, #navbar-menu-user .navbar-end, .navbar .navbar-menu, #navbar-menu, .navbar-menu'
  );
}
