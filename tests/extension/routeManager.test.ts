import { describe, expect, it, vi } from 'vitest';
import manifest from '../../src/manifest.json';
import { DEFAULT_SETTINGS, SERVER_API_BASE_URL } from '../../src/utils/config';
import { getChromeStorageSnapshot, setChromeStorage } from '../setup/chrome';

describe('RouteManager remote config', () => {
  it('keeps JavDB primary and no-proxy routes separate', async () => {
    setChromeStorage({
      settings: {
        ...DEFAULT_SETTINGS,
        routes: {
          ...(DEFAULT_SETTINGS as any).routes,
          javdb: {
            primary: 'javdb-main.example/path',
            noProxyUrl: 'javdb-free.example/search?q=abc',
            preferredUrl: 'javdb-free.example/search?q=abc',
            alternatives: [
              {
                url: 'javdb-extra.example/v/abc',
                enabled: true,
                description: 'extra route',
                addedAt: 1,
              },
              {
                url: 'javdb-disabled.example',
                enabled: false,
                description: 'disabled route',
                addedAt: 2,
              },
            ],
          },
        },
      },
    });

    const {
      getJavDBNoProxyRoute,
      getJavDBPrimaryRoute,
      getRouteManager,
    } = await import('../../src/features/routeManagement');
    const routeManager = getRouteManager();
    routeManager.clearCache();

    await expect(getJavDBPrimaryRoute()).resolves.toBe('https://javdb-main.example');
    await expect(getJavDBNoProxyRoute()).resolves.toBe('https://javdb-free.example');
    await expect(routeManager.getCurrentRoute('javdb')).resolves.toBe('https://javdb-free.example');
    await expect(routeManager.getAllEnabledRoutes('javdb')).resolves.toEqual([
      'https://javdb-main.example',
      'https://javdb-free.example',
      'https://javdb-extra.example',
    ]);
  });

  it('uses the default no-proxy route for legacy settings without a separate field', async () => {
    setChromeStorage({
      settings: {
        ...DEFAULT_SETTINGS,
        routes: {
          ...(DEFAULT_SETTINGS as any).routes,
          javdb: {
            primary: 'https://javdb.com',
            alternatives: [],
          },
        },
      },
    });

    const { getJavDBNoProxyRoute, getRouteManager } = await import('../../src/features/routeManagement');
    getRouteManager().clearCache();

    await expect(getJavDBNoProxyRoute()).resolves.toBe('https://javdb570.com');
  });

  it('updates routes from the server config endpoint before falling back to legacy routes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        schemaVersion: 1,
        updatedAt: '2026-05-27T00:00:00.000Z',
        routes: {
          javdb: {
            primary: 'https://javdb.com',
            alternatives: [
              {
                url: 'https://javdb-server-alt.example',
                status: 'active',
                description: 'server route',
              },
            ],
          },
          javbus: {
            primary: 'https://www.javbus.com',
            alternatives: [],
          },
        },
        announcements: [],
        updatePolicy: {
          latestVersion: '1.20.2',
          minimumVersion: '1.18.0',
          releaseUrl: 'https://github.com/Vintcet/my-javdb/releases/latest',
        },
        featureFlags: {
          telemetryRequired: true,
          remoteRoutesEnabled: true,
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    setChromeStorage({
      settings: {
        ...DEFAULT_SETTINGS,
        routes: {
          ...(DEFAULT_SETTINGS as any).routes,
          javdb: {
            ...(DEFAULT_SETTINGS as any).routes.javdb,
            alternatives: [
              {
                url: 'https://user-route.example',
                enabled: true,
                description: 'user custom',
                addedAt: 1,
              },
            ],
          },
        },
      },
    });

    const { RouteManager } = await import('../../src/features/routeManagement');

    await expect(RouteManager.getInstance().checkAndUpdateRoutes(true)).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(
      `${SERVER_API_BASE_URL}/v1/config?channel=stable&version=${manifest.version}&platform=unknown&locale=en-US`,
      expect.objectContaining({
        cache: 'no-cache',
      }),
    );
    const settings = getChromeStorageSnapshot().settings;
    expect(settings.routes.javdb.noProxyUrl).toBe('https://javdb-server-alt.example');
    expect(settings.routes.javdb.alternatives).toEqual(expect.arrayContaining([
      expect.objectContaining({
        url: 'https://user-route.example',
        enabled: true,
        description: 'user custom',
      }),
    ]));
  });
});
