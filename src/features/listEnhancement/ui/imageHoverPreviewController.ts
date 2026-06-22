export interface ImageHoverPreviewController {
  attach: (coverElement: HTMLElement) => void;
  destroy: () => void;
}

interface BoundHandlers {
  enter: (event: MouseEvent) => void;
  leave: () => void;
  move: (event: MouseEvent) => void;
}

function getImageUrl(image: HTMLImageElement): string {
  const source = image.getAttribute('data-full')
    || image.currentSrc
    || image.getAttribute('data-src')
    || image.src
    || '';

  return source
    .replace(/\/thumbs?\//i, '/covers/')
    .replace(/([._-])thumb(\.[a-z0-9]+)$/i, '$1cover$2');
}

export function createImageHoverPreviewController(options: {
  document: Document;
  window: Window;
  maxWidth?: number;
  maxHeight?: number;
  showDelayMs?: number;
}): ImageHoverPreviewController {
  const maxWidth = options.maxWidth ?? 1000;
  const maxHeight = options.maxHeight ?? 1000;
  const showDelayMs = options.showDelayMs ?? 1000;
  const offset = 20;
  const bound = new Map<HTMLImageElement, BoundHandlers>();
  let preview: HTMLDivElement | null = null;
  let activeImage: HTMLImageElement | null = null;
  let showTimer: number | null = null;
  let lastMouseEvent: MouseEvent | null = null;

  function ensureStyles(): void {
    if (options.document.getElementById('x-image-hover-preview-styles')) return;
    const style = options.document.createElement('style');
    style.id = 'x-image-hover-preview-styles';
    style.textContent = `
      .x-image-hover-preview {
        position: fixed;
        display: none;
        z-index: 2147483647;
        border-radius: 4px;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.24);
        overflow: hidden;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.16s ease;
        background: #fff;
      }

      .x-image-hover-preview.active {
        opacity: 1;
      }

      .x-image-hover-preview img {
        display: block;
        max-width: ${maxWidth}px;
        max-height: ${maxHeight}px;
        object-fit: contain;
      }

      .x-image-hover-preview.loading::before {
        content: '加载中...';
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: #666;
        font-size: 14px;
        white-space: nowrap;
      }
    `;
    options.document.head.appendChild(style);
  }

  function ensurePreview(): HTMLDivElement {
    if (preview) return preview;
    ensureStyles();
    preview = options.document.createElement('div');
    preview.className = 'x-image-hover-preview';
    options.document.body.appendChild(preview);
    return preview;
  }

  function calculateSize(image: HTMLImageElement): { width: number; height: number } {
    let width = image.naturalWidth || image.width || maxWidth;
    let height = image.naturalHeight || image.height || maxHeight;
    if (width > maxWidth || height > maxHeight) {
      const scale = Math.min(maxWidth / width, maxHeight / height);
      width *= scale;
      height *= scale;
    }
    return { width, height };
  }

  function move(event: MouseEvent): void {
    if (!preview || !preview.classList.contains('active')) return;
    const previewWidth = preview.offsetWidth;
    const previewHeight = preview.offsetHeight;
    let left = event.clientX + offset;
    let top = event.clientY + offset;

    if (left + previewWidth > options.window.innerWidth) {
      left = event.clientX - previewWidth - offset;
    }
    if (top + previewHeight > options.window.innerHeight) {
      top = event.clientY - previewHeight - offset;
    }

    preview.style.left = `${Math.max(0, left)}px`;
    preview.style.top = `${Math.max(0, top)}px`;
  }

  function hide(): void {
    if (showTimer !== null) {
      options.window.clearTimeout(showTimer);
      showTimer = null;
    }
    if (!preview) return;
    preview.classList.remove('active', 'loading');
    preview.style.display = 'none';
    preview.replaceChildren();
    activeImage = null;
  }

  function show(event: MouseEvent, image: HTMLImageElement): void {
    const url = getImageUrl(image);
    if (!url) return;

    activeImage = image;
    const panel = ensurePreview();
    panel.replaceChildren();
    panel.classList.add('loading');
    panel.classList.remove('active');
    panel.style.display = 'block';
    panel.style.width = '120px';
    panel.style.height = '72px';

    const largeImage = new Image();
    largeImage.onload = () => {
      if (activeImage !== image) return;
      const size = calculateSize(largeImage);
      largeImage.alt = image.alt || '预览图';
      panel.classList.remove('loading');
      panel.replaceChildren(largeImage);
      panel.style.width = `${size.width}px`;
      panel.style.height = `${size.height}px`;
      void panel.offsetHeight;
      panel.classList.add('active');
      move(event);
    };
    largeImage.onerror = () => hide();
    largeImage.src = url;
  }

  function scheduleShow(event: MouseEvent, image: HTMLImageElement): void {
    lastMouseEvent = event;
    if (showTimer !== null) {
      options.window.clearTimeout(showTimer);
    }
    showTimer = options.window.setTimeout(() => {
      showTimer = null;
      show(lastMouseEvent || event, image);
    }, showDelayMs);
  }

  function attach(coverElement: HTMLElement): void {
    const image = coverElement.querySelector<HTMLImageElement>('img');
    if (!image || bound.has(image)) return;

    const handlers: BoundHandlers = {
      enter: (event) => scheduleShow(event, image),
      leave: () => hide(),
      move: (event) => {
        lastMouseEvent = event;
        move(event);
      },
    };
    image.addEventListener('mouseenter', handlers.enter);
    image.addEventListener('mouseleave', handlers.leave);
    image.addEventListener('mousemove', handlers.move);
    bound.set(image, handlers);
  }

  function destroy(): void {
    bound.forEach((handlers, image) => {
      image.removeEventListener('mouseenter', handlers.enter);
      image.removeEventListener('mouseleave', handlers.leave);
      image.removeEventListener('mousemove', handlers.move);
    });
    bound.clear();
    hide();
    lastMouseEvent = null;
    preview?.remove();
    preview = null;
  }

  return { attach, destroy };
}
