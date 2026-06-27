export const TASK_BUCKET_LIMITS: Record<string, number> = {
  'video-detail': 3,
  videoStatus: 6,
  translate: 1,
  actorMarks: 3,
  actorRemarks: 3,
  drive115: 2,
  'drive115-push': 3,
  insights: 3,
  videoFavoriteRating: 3,
  contentFilter: 3,
  'ui-light': 8,
  'video-light': 3,
  auxiliary: 20,
};

function isVideoDetailEnhancementTask(label: string): boolean {
  return label.startsWith('videoEnhancement:')
    || label === 'actorMarks:page'
    || label === 'actorRemarks:run'
    || label === 'videoFavoriteRating:init'
    || label === 'actorQuickActions:init'
    || label === 'drive115:init:video'
    || label === 'insights:collector';
}

export function resolveTaskBucket(label: string): string {
  const normalizedLabel = label.toLowerCase();
  if (normalizedLabel.includes('translate')) return 'translate';
  if (label === 'drive115:push') return 'drive115-push';
  if (isVideoDetailEnhancementTask(label)) return 'video-detail';
  if (label.startsWith('videoStatus:')) return 'videoStatus';
  if (label.startsWith('actorMarks')) return 'actorMarks';
  if (label.startsWith('actorRemarks')) return 'actorRemarks';
  if (label.startsWith('drive115')) return 'drive115';
  if (label.startsWith('insights')) return 'insights';
  if (label.startsWith('videoFavoriteRating')) return 'videoFavoriteRating';
  if (label.startsWith('contentFilter')) return 'contentFilter';
  if (label.startsWith('ui:remove-unwanted') || label.includes(':panel')) return 'ui-light';
  if (label.startsWith('videoEnhancement:') || label.startsWith('ux:magnet:')) return 'video-light';
  return 'auxiliary';
}
