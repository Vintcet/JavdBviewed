/**
 * 115 统一路由（过渡期兼容层）
 * 对外继续暴露历史接口，但内部统一转发到 v2 应用服务层。
 */

import type { Drive115BatchOptionsUnified, Drive115OfflineOptionsUnified } from '../app';
import { getDrive115AppService } from '../app';
import { mapLegacySearchResult } from '../app/adapters';
import type { Drive115File } from '../app/types';

export async function isDrive115Enabled(): Promise<boolean> {
  return getDrive115AppService().isEnabled();
}

export async function searchFiles(query: string) {
  return getDrive115AppService().searchFiles(query);
}

export async function searchFilesLegacyWeb(query: string): Promise<Drive115File[]> {
  const searchValue = String(query || '').trim().toLowerCase().replace(/^fc2-/, '');
  if (!searchValue) return [];

  const resp: any = await new Promise((resolve) => {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime?.id || typeof chrome.runtime.sendMessage !== 'function') {
        resolve({ success: false, message: '扩展后台不可用' });
        return;
      }
      chrome.runtime.sendMessage(
        {
          type: 'drive115.search_files_legacy',
          payload: {
            searchValue,
            offset: 0,
            limit: 30,
          },
        },
        (messageResp) => resolve(messageResp),
      );
    } catch (error: any) {
      resolve({ success: false, message: error?.message || '旧接口搜索异常' });
    }
  });

  if (!resp?.success) {
    throw new Error(resp?.message || '旧接口搜索失败');
  }

  return Array.isArray(resp.data) ? resp.data.map(mapLegacySearchResult) : [];
}

export async function downloadOffline(options: Drive115OfflineOptionsUnified) {
  return getDrive115AppService().downloadOffline(options);
}

export async function downloadBatch(options: Drive115BatchOptionsUnified) {
  return getDrive115AppService().downloadBatch(options);
}

export async function verifyDownload(videoId: string) {
  return getDrive115AppService().verifyDownload(videoId);
}

export async function getLogs() {
  return getDrive115AppService().getLogs();
}

export async function getLogStats() {
  return getDrive115AppService().getLogStats();
}

export async function clearLogs() {
  return getDrive115AppService().clearLogs();
}

export async function exportLogs() {
  return getDrive115AppService().exportLogs();
}

export async function addTaskUrlsV2(params: { urls: string; wp_path_id?: string; context?: import('../app').Drive115PushContext }): Promise<{ success: boolean; message?: string; data?: any[]; raw?: any }>{
  return getDrive115AppService().addTaskUrls(params);
}
