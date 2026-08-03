import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_LEVEL_IDS,
  CAMPAIGN_PROGRESS_STORAGE_KEY,
  CAMPAIGN_PROGRESS_VERSION,
  TOTAL_CAMPAIGN_LEVELS,
  completeCampaignLevel,
  completeCampaignLevelInStorage,
  createCampaignProgress,
  getCampaignLevelId,
  getCampaignLevelNumber,
  isCampaignLevelCompleted,
  isCampaignLevelUnlocked,
  loadCampaignProgress,
  normalizeCampaignProgress,
  saveCampaignProgress,
  type CampaignProgressStorage,
} from '../src/game/campaignProgress';

class MemoryStorage implements CampaignProgressStorage {
  private readonly entries = new Map<string, string>();

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }
}

describe('campaign progress', () => {
  it('starts with seven levels and only level one unlocked', () => {
    const progress = createCampaignProgress();

    expect(CAMPAIGN_LEVEL_IDS).toHaveLength(TOTAL_CAMPAIGN_LEVELS);
    expect(progress).toEqual({
      completedLevels: [],
      highestUnlockedLevel: 1,
    });
    expect(isCampaignLevelUnlocked(progress, 'level-1')).toBe(true);
    expect(isCampaignLevelUnlocked(progress, 'level-2')).toBe(false);
    expect(getCampaignLevelNumber('level-7')).toBe(7);
    expect(getCampaignLevelId(7)).toBe('level-7');
    expect(getCampaignLevelId(8)).toBeNull();
  });

  it('records a completed level and unlocks only its next level', () => {
    const afterFirst = completeCampaignLevel(
      createCampaignProgress(),
      'level-1',
    );

    expect(afterFirst).toEqual({
      completedLevels: ['level-1'],
      highestUnlockedLevel: 2,
    });
    expect(isCampaignLevelCompleted(afterFirst, 'level-1')).toBe(true);
    expect(isCampaignLevelUnlocked(afterFirst, 'level-2')).toBe(true);
    expect(isCampaignLevelUnlocked(afterFirst, 'level-3')).toBe(false);

    const afterSecond = completeCampaignLevel(afterFirst, 'level-2');
    expect(afterSecond).toEqual({
      completedLevels: ['level-1', 'level-2'],
      highestUnlockedLevel: 3,
    });
  });

  it('keeps completion idempotent and caps the final unlock at level seven', () => {
    const completedTwice = completeCampaignLevel(
      completeCampaignLevel(createCampaignProgress(), 'level-1'),
      'level-1',
    );
    expect(completedTwice).toEqual({
      completedLevels: ['level-1'],
      highestUnlockedLevel: 2,
    });

    const finalLevel = completeCampaignLevel(
      {
        completedLevels: [
          'level-1',
          'level-2',
          'level-3',
          'level-4',
          'level-5',
          'level-6',
        ],
        highestUnlockedLevel: 7,
      },
      'level-7',
    );
    expect(finalLevel.highestUnlockedLevel).toBe(7);
    expect(finalLevel.completedLevels).toHaveLength(7);
  });

  it('persists and reloads completed progress', () => {
    const storage = new MemoryStorage();
    const saved = completeCampaignLevelInStorage('level-1', storage);

    expect(loadCampaignProgress(storage)).toEqual(saved);
    expect(JSON.parse(storage.getItem(CAMPAIGN_PROGRESS_STORAGE_KEY) ?? '')).toEqual({
      version: CAMPAIGN_PROGRESS_VERSION,
      completedLevels: ['level-1'],
      highestUnlockedLevel: 2,
    });
  });

  it('recovers from missing, malformed, and inconsistent saved data', () => {
    const storage = new MemoryStorage();
    expect(loadCampaignProgress(storage)).toEqual(createCampaignProgress());

    storage.setItem(CAMPAIGN_PROGRESS_STORAGE_KEY, '{not json');
    expect(loadCampaignProgress(storage)).toEqual(createCampaignProgress());

    storage.setItem(
      CAMPAIGN_PROGRESS_STORAGE_KEY,
      JSON.stringify({
        completedLevels: ['level-3', 'not-a-level', 'level-1', 'level-3'],
        highestUnlockedLevel: 99,
      }),
    );
    expect(loadCampaignProgress(storage)).toEqual({
      completedLevels: ['level-1', 'level-3'],
      highestUnlockedLevel: 4,
    });
  });

  it('does not require a browser Storage implementation', () => {
    const noStorageProgress = completeCampaignLevelInStorage('level-1', null);
    expect(noStorageProgress).toEqual({
      completedLevels: ['level-1'],
      highestUnlockedLevel: 2,
    });

    const unavailableStorage: CampaignProgressStorage = {
      getItem: () => {
        throw new Error('Storage access denied');
      },
      setItem: () => {
        throw new Error('Storage access denied');
      },
    };
    expect(loadCampaignProgress(unavailableStorage)).toEqual(
      createCampaignProgress(),
    );
    expect(
      saveCampaignProgress(
        { completedLevels: ['level-1'], highestUnlockedLevel: 2 },
        unavailableStorage,
      ),
    ).toEqual({
      completedLevels: ['level-1'],
      highestUnlockedLevel: 2,
    });
  });

  it('normalizes progress without mutating its source object', () => {
    const source = {
      completedLevels: ['level-2', 'level-1', 'invalid', 'level-2'],
      highestUnlockedLevel: 1,
    };

    expect(normalizeCampaignProgress(source)).toEqual({
      completedLevels: ['level-1', 'level-2'],
      highestUnlockedLevel: 3,
    });
    expect(source).toEqual({
      completedLevels: ['level-2', 'level-1', 'invalid', 'level-2'],
      highestUnlockedLevel: 1,
    });
  });
});
