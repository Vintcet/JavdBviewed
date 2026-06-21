import type { ListPreviewVideoInfo } from '../../previews';

function normalizeTitleText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function getListItemFullTitle(item: HTMLElement, code?: string): string {
  const linkTitle = item.querySelector<HTMLAnchorElement>('a[title]')?.getAttribute('title') || '';
  if (linkTitle.trim()) {
    return normalizeTitleText(linkTitle);
  }

  const dataTitle = item.querySelector<HTMLElement>('div.video-title [data-title]')?.getAttribute('data-title') || '';
  if (dataTitle.trim()) {
    return normalizeTitleText(dataTitle);
  }

  const titleElement = item.querySelector('div.video-title');
  if (!titleElement) return '';

  const clone = titleElement.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.x-btn, .x-title-translation, .tags').forEach(node => node.remove());
  const raw = clone.textContent || '';
  const withoutCode = code ? raw.replace(code, '') : raw;
  return normalizeTitleText(withoutCode);
}

export function extractListItemVideoInfo(item: HTMLElement): ListPreviewVideoInfo | null {
  const titleElement = item.querySelector('div.video-title > strong');
  const linkElement = item.querySelector('a[href*="/v/"]');

  if (!titleElement || !linkElement) return null;

  const code = titleElement.textContent?.trim() || '';
  const title = getListItemFullTitle(item, code);
  const url = (linkElement as HTMLAnchorElement).href;

  return { code, title, url };
}

export interface OptimizeListItemTitleOptions {
  showFullTitle?: boolean;
}

export function optimizeListItemTitle(
  item: HTMLElement,
  videoInfo: ListPreviewVideoInfo,
  options: OptimizeListItemTitleOptions = {},
): void {
  const titleElement = item.querySelector('div.video-title') as HTMLElement | null;
  if (!titleElement) return;

  if (!titleElement.querySelector('.x-btn')) {
    const button = document.createElement('span');
    button.className = 'x-btn';
    button.title = '列表功能';
    button.setAttribute('data-code', videoInfo.code);
    button.setAttribute('data-title', videoInfo.title);

    titleElement.insertAdjacentElement('afterbegin', button);
  }

  const showFullTitle = options.showFullTitle !== false;
  if (videoInfo.title && !titleElement.getAttribute('data-x-original-title')) {
    titleElement.setAttribute('title', videoInfo.title);
  }
  if (!showFullTitle && item.querySelector('.tags')) {
    titleElement.classList.add('x-ellipsis');
  } else {
    titleElement.classList.remove('x-ellipsis');
  }
  titleElement.classList.add('x-title');
  titleElement.classList.toggle('x-title-full', showFullTitle);
}
