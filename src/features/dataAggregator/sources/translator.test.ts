import { describe, expect, it, vi } from 'vitest';
import { TranslatorService, DEFAULT_TRANSLATOR_CONFIG } from './translator';

describe('TranslatorService', () => {
  it('uses Google PA translation endpoint before the legacy endpoint', async () => {
    const originalFetch = globalThis.fetch;
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      translation: '测试中文标题',
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;

    try {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        writable: true,
        value: fetchImpl,
      });

      const translator = new TranslatorService({
        ...DEFAULT_TRANSLATOR_CONFIG,
        service: 'google',
        sourceLanguage: 'ja',
        targetLanguage: 'zh-CN',
      });

      const result = await translator.translate('テスト作品タイトル');

      expect(result.success).toBe(true);
      expect(result.data?.translatedText).toBe('测试中文标题');
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(String(fetchImpl.mock.calls[0][0])).toContain('https://translate-pa.googleapis.com/v1/translate');
      expect(String(fetchImpl.mock.calls[0][0])).toContain('query.targetLanguage=zh-CN');
    } finally {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        writable: true,
        value: originalFetch,
      });
    }
  });
});
