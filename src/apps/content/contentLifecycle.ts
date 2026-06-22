import { STATE, log } from '../../features/contentState';
import { cleanupVideoDetailObservers } from '../../features/videoDetail';
import { keyboardShortcutsManager } from '../../features/keyboardShortcuts';
import { embyEnhancementManager } from '../../features/embyEnhancement/content';
import { performanceOptimizer } from '../../platform/tasks';
import { contentFilterManager } from '../../features/contentFilter';
import { magnetSearchManager } from '../../features/magnets';
import { listEnhancementManager } from '../../features/listEnhancement';
import { actorEnhancementManager } from '../../features/actorEnhancement';
import { stopPreviewVideoWatcher } from '../../features/previews';
import { processVisibleItems, setupObserver } from '../../features/listEnhancement/content/itemProcessor';

export function exposeContentDebugManagers(): void {
    if (typeof window === 'undefined') return;

    (window as any).listEnhancementManager = listEnhancementManager;
    (window as any).actorEnhancementManager = actorEnhancementManager;
}

export function installContentLifecycleHandlers(): void {
    window.addEventListener('beforeunload', () => {
        try {
            stopPreviewVideoWatcher();
            cleanupVideoDetailObservers();
            performanceOptimizer?.cleanup();
            contentFilterManager?.destroy();
            keyboardShortcutsManager?.destroy?.();
            embyEnhancementManager?.destroy();
            magnetSearchManager?.destroy?.();

            log('Resources cleaned up on page unload');
        } catch (error) {
            log('Error during cleanup:', error);
        }
    });

    if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.onConnect.addListener((port) => {
            port.onDisconnect.addListener(() => {
                if (chrome.runtime.lastError) {
                    log('[Context] Extension context may be invalidated:', chrome.runtime.lastError.message);
                    performanceOptimizer?.cleanup();
                }
            });
        });
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            log('[Performance] Page hidden, reducing resource usage');
            try {
                if (STATE.debounceTimer) {
                    clearTimeout(STATE.debounceTimer);
                    STATE.debounceTimer = null;
                }
                STATE.observer?.disconnect();
                STATE.observer = null;
                listEnhancementManager.suspend();
                stopPreviewVideoWatcher();
            } catch {}
            performanceOptimizer?.updateConfig({
                maxConcurrentRequests: 1,
                domBatchSize: 2,
                domThrottleDelay: 200,
                enableMemoryCleanup: true,
                memoryCleanupInterval: 20000,
            });
            try {
                magnetSearchManager.updateConfig({
                    sources: { sukebei: true, btdig: true, btsow: false, torrentz2: false, javbus: false, custom: [] },
                    maxResults: 8,
                    timeout: 5000,
                    enableQualityFilter: (STATE.settings as any)?.magnetSearch?.enableQualityFilter !== false,
                });
            } catch {}
        } else {
            log('[Performance] Page visible, restoring normal resource usage');
            try {
                listEnhancementManager.resume();
                if (!STATE.observer && document.querySelector('.movie-list')) {
                    processVisibleItems({ enqueueRealtimeCheck: false });
                    setupObserver();
                }
                const s = STATE.settings as any;
                const mc = (s?.magnetSearch?.concurrency?.pageMaxConcurrentRequests ?? 2) as number;
                performanceOptimizer?.updateConfig({
                    maxConcurrentRequests: mc,
                    domBatchSize: 5,
                    domThrottleDelay: 100,
                });
                const magnetSearchConfig = s?.magnetSearch || {};
                const sources = magnetSearchConfig.sources || {};
                magnetSearchManager.updateConfig({
                    sources: {
                        sukebei: sources.sukebei !== false,
                        btdig: sources.btdig !== false,
                        btsow: sources.btsow !== false,
                        torrentz2: sources.torrentz2 || false,
                        javbus: sources.javbus === true,
                        custom: [],
                    },
                    maxResults: (magnetSearchConfig.maxResults ?? 15),
                    enableQualityFilter: magnetSearchConfig.enableQualityFilter !== false,
                    timeout: (magnetSearchConfig.timeoutMs ?? 8000),
                });
            } catch {
                performanceOptimizer?.updateConfig({ maxConcurrentRequests: 2, domBatchSize: 5, domThrottleDelay: 100 });
            }
        }
    });
}
