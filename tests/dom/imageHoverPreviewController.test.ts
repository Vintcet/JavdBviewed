import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createImageHoverPreviewController,
} from '../../src/features/listEnhancement/ui/imageHoverPreviewController';

function createCover(): HTMLElement {
  const cover = document.createElement('div');
  cover.className = 'cover';
  const image = document.createElement('img');
  image.src = 'https://example.test/thumbs/abc.jpg';
  cover.appendChild(image);
  document.body.appendChild(cover);
  return cover;
}

describe('image hover preview controller', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('shows the large image preview only after the hover delay', async () => {
    vi.useFakeTimers();
    const cover = createCover();
    const controller = createImageHoverPreviewController({
      document,
      window,
      showDelayMs: 1000,
    });

    controller.attach(cover);
    cover.querySelector('img')?.dispatchEvent(new MouseEvent('mouseenter', { clientX: 10, clientY: 20 }));

    await vi.advanceTimersByTimeAsync(999);
    expect(document.querySelector('.x-image-hover-preview')).toBeNull();

    await vi.advanceTimersByTimeAsync(1);
    const preview = document.querySelector<HTMLElement>('.x-image-hover-preview');
    expect(preview).not.toBeNull();
    expect(preview?.style.display).toBe('block');
  });

  it('cancels the pending preview when the mouse leaves before the delay', async () => {
    vi.useFakeTimers();
    const cover = createCover();
    const image = cover.querySelector('img')!;
    const controller = createImageHoverPreviewController({
      document,
      window,
      showDelayMs: 1000,
    });

    controller.attach(cover);
    image.dispatchEvent(new MouseEvent('mouseenter', { clientX: 10, clientY: 20 }));
    await vi.advanceTimersByTimeAsync(500);
    image.dispatchEvent(new MouseEvent('mouseleave'));
    await vi.advanceTimersByTimeAsync(500);

    expect(document.querySelector('.x-image-hover-preview')).toBeNull();
  });
});
