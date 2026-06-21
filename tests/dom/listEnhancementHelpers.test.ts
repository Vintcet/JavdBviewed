import { describe, expect, it } from 'vitest';
import {
  buildPopularityEffectAttributes,
  parseRatingStatsText,
} from '../../src/features/listEnhancement/application/popularityEffects';
import {
  matchActorsFromTitle,
} from '../../src/features/listEnhancement/application/actorMatching';
import {
  decideActorHiding,
} from '../../src/features/listEnhancement/application/actorHiding';
import {
  buildListDisplayControlStyles,
} from '../../src/features/listEnhancement/ui/styles';
import type { ActorRecord } from '../../src/types';

function createActor(id: string, name: string): ActorRecord {
  return {
    id,
    name,
    aliases: [],
    gender: 'female',
    category: 'unknown',
    profileUrl: `https://javdb.com/actors/${id}`,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('list enhancement helpers', () => {
  it('parses score and rating count from JavDB rating text', () => {
    expect(parseRatingStatsText('4.5 分，由 532 人评价')).toEqual({
      score: 4.5,
      count: 532,
    });
    expect(parseRatingStatsText('暂无评分')).toEqual({
      score: null,
      count: null,
    });
  });

  it('builds popularity effect attributes from thresholds', () => {
    expect(buildPopularityEffectAttributes(
      { score: 4.6, count: 600 },
      { enabled: true, minRating: 4, minRatingCount: 350 },
    )).toEqual({
      effect: 'fire',
      level: '1',
      count: '600',
      score: '4.6',
    });

    expect(buildPopularityEffectAttributes(
      { score: 3.9, count: 600 },
      { enabled: true, minRating: 4, minRatingCount: 350 },
    )).toEqual({
      count: '600',
      score: '3.9',
    });
  });

  it('builds list display control CSS with container expansion and exact item width', () => {
    const result = buildListDisplayControlStyles({
      columnCount: 5,
      containerWidth: 120,
      enableContainerExpansion: true,
      isVideoDetailPage: false,
    });

    expect(result.itemWidthCalc).toBe('calc(20% - 10px)');
    expect(result.marginValue).toBe('0 -10%');
    expect(result.styleContent).toContain('body #search-bar-wrap');
    expect(result.styleContent).toContain('width: 120%');
    expect(result.styleContent).toContain('width: calc(20% - 10px)');
  });

  it('builds JHS-inspired wide layout and search bar CSS when toggles are enabled', () => {
    const result = buildListDisplayControlStyles({
      columnCount: 4,
      containerWidth: 100,
      enableContainerExpansion: false,
      enableWideLayout: true,
      enableSearchBarLayout: true,
      isVideoDetailPage: false,
    });

    expect(result.styleContent).toContain('calc(100vw - 24px)');
    expect(result.styleContent).toContain('--x-list-controls-width: var(--x-list-shell-width)');
    expect(result.styleContent).toContain('body .main-tabs');
    expect(result.styleContent).toContain('body .section-addition');
    expect(result.styleContent).toContain('margin-left: auto !important');
    expect(result.styleContent).toContain('body #x-nav-search-box');
    expect(result.styleContent).toContain('data-x-original-search-hidden');
  });

  it('keeps actor page profile and filters aligned to the wide list shell', () => {
    const result = buildListDisplayControlStyles({
      columnCount: 5,
      containerWidth: 100,
      enableContainerExpansion: false,
      enableWideLayout: true,
      enableSearchBarLayout: true,
      isVideoDetailPage: false,
      isActorPage: true,
    });

    expect(result.styleContent).toContain('body .section > .container:has(.actor-section-name)');
    expect(result.styleContent).toContain('body .section > .container:has(.section-columns)');
    expect(result.styleContent).toContain('body .section > .container:has(.avatar-box)');
    expect(result.styleContent).toContain('body .section-columns');
    expect(result.styleContent).toContain('grid-template-columns: repeat(3, minmax(160px, 1fr))');
    expect(result.styleContent).toContain('body .avatar-box .photo-info');
    expect(result.styleContent).toContain('width: var(--x-list-shell-width) !important');
    expect(result.styleContent).not.toContain('max-width: 1120px');
  });

  it('matches actors from title suffix and weighted fallback candidates without duplicates', () => {
    const miho = createActor('actor-miho', 'Miho Nana');
    const yuna = createActor('actor-yuna', 'Yuna Ogura');
    const actorIndex = new Map<string, ActorRecord>([
      ['miho nana', miho],
      ['yuna ogura', yuna],
    ]);

    expect(matchActorsFromTitle('Some Release Title Miho Nana', actorIndex)).toEqual([miho]);
    expect(matchActorsFromTitle('【Yuna Ogura】Some Release Title Miho Nana', actorIndex)).toEqual([miho]);
    expect(matchActorsFromTitle('Yuna Ogura Some Release Title', actorIndex)).toEqual([yuna]);
    expect(matchActorsFromTitle('No known actor', actorIndex)).toEqual([]);
  });

  it('decides actor based hiding reasons from local actor state', () => {
    const miho = createActor('actor-miho', 'Miho Nana');
    const blacklisted = { ...createActor('actor-black', 'Blocked Actor'), blacklisted: true };

    expect(decideActorHiding({
      hideByBlacklist: true,
      hideByNonFavorited: true,
      hideUnrecognized: true,
      treatSubscribedAsFavorited: true,
      domActorIds: new Set(['actor-black']),
      actors: [blacklisted],
      subscribedActorIds: new Set(),
    }).reason).toBe('ACTOR_BLACKLIST');

    expect(decideActorHiding({
      hideByBlacklist: false,
      hideByNonFavorited: true,
      hideUnrecognized: true,
      treatSubscribedAsFavorited: true,
      domActorIds: new Set(['actor-missing']),
      actors: [],
      subscribedActorIds: new Set(),
    }).reason).toBe('ACTOR_NOT_FAVORITED');

    expect(decideActorHiding({
      hideByBlacklist: false,
      hideByNonFavorited: true,
      hideUnrecognized: true,
      treatSubscribedAsFavorited: true,
      domActorIds: new Set(),
      actors: [],
      subscribedActorIds: new Set(),
    }).reason).toBe('ACTOR_NOT_FAVORITED');

    expect(decideActorHiding({
      hideByBlacklist: false,
      hideByNonFavorited: true,
      hideUnrecognized: true,
      treatSubscribedAsFavorited: true,
      domActorIds: new Set(['actor-miho']),
      actors: [miho],
      subscribedActorIds: new Set(),
    }).reason).toBeNull();
  });
});
