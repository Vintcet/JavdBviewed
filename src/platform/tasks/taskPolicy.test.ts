import { describe, expect, it } from 'vitest';
import { resolveTaskBucket } from './taskPolicy';

describe('resolveTaskBucket', () => {
  it('keeps video status tasks in an independent bucket', () => {
    expect(resolveTaskBucket('videoStatus:initialSync')).toBe('videoStatus');
    expect(resolveTaskBucket('videoStatus:fullRefresh')).toBe('videoStatus');
    expect(resolveTaskBucket('videoStatus:update')).toBe('videoStatus');
  });

  it('keeps heavier detail enhancement tasks in the detail bucket', () => {
    expect(resolveTaskBucket('videoEnhancement:initCore')).toBe('video-detail');
    expect(resolveTaskBucket('drive115:init:video')).toBe('video-detail');
  });
});
