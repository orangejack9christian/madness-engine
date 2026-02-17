import { describe, it, expect, beforeEach } from 'vitest';
import { GameStateTracker } from '../../src/ingestion/game-state-tracker';
import { eventBus } from '../../src/ingestion/event-bus';
import type { LiveGameState } from '../../src/core/types';
import type {
  GameStateChangedPayload,
  GameStartedPayload,
  GameCompletedPayload,
  ScoreUpdatePayload,
} from '../../src/ingestion/event-bus';

function makeLiveGameState(overrides: Partial<LiveGameState> = {}): LiveGameState {
  return {
    gameId: 'test-game-1',
    homeTeamId: 'team-a',
    awayTeamId: 'team-b',
    round: 'round-of-64',
    homeScore: 0,
    awayScore: 0,
    period: 1,
    timeRemainingSeconds: 1200,
    possession: null,
    homeFouls: 0, awayFouls: 0,
    homeInBonus: false, awayInBonus: false,
    homeFGM: 0, homeFGA: 0, home3PM: 0, home3PA: 0, homeFTM: 0, homeFTA: 0,
    awayFGM: 0, awayFGA: 0, away3PM: 0, away3PA: 0, awayFTM: 0, awayFTA: 0,
    lastScoringRun: { team: 'home', points: 0 },
    timeoutsRemaining: { home: 4, away: 4 },
    status: 'in-progress',
    lastUpdated: Date.now(),
    ...overrides,
  };
}

describe('game-state-tracker', () => {
  let tracker: GameStateTracker;

  beforeEach(() => {
    tracker = new GameStateTracker();
    eventBus.removeAllListeners();
  });

  it('returns diff on first state (initial)', () => {
    const state = makeLiveGameState();
    const diff = tracker.updateState(state);

    expect(diff).not.toBeNull();
    expect(diff!.changedFields).toContain('_initial');
    expect(diff!.gameId).toBe('test-game-1');
  });

  it('returns null when no meaningful fields changed', () => {
    const state = makeLiveGameState();
    tracker.updateState(state);

    // Only change the timestamp
    const updated = { ...state, lastUpdated: Date.now() + 1000 };
    const diff = tracker.updateState(updated);

    expect(diff).toBeNull();
  });

  it('detects score changes', () => {
    const state = makeLiveGameState();
    tracker.updateState(state);

    const updated = { ...state, homeScore: 3, lastUpdated: Date.now() + 1000 };
    const diff = tracker.updateState(updated);

    expect(diff).not.toBeNull();
    expect(diff!.scoreChanged).toBe(true);
    expect(diff!.changedFields).toContain('homeScore');
  });

  it('detects period changes', () => {
    const state = makeLiveGameState();
    tracker.updateState(state);

    const updated = { ...state, period: 2, timeRemainingSeconds: 1200, lastUpdated: Date.now() + 1000 };
    const diff = tracker.updateState(updated);

    expect(diff).not.toBeNull();
    expect(diff!.periodChanged).toBe(true);
  });

  it('detects status changes', () => {
    const state = makeLiveGameState({ status: 'pre-game' });
    tracker.updateState(state);

    const updated = { ...state, status: 'in-progress' as const, lastUpdated: Date.now() + 1000 };
    const diff = tracker.updateState(updated);

    expect(diff).not.toBeNull();
    expect(diff!.statusChanged).toBe(true);
  });

  it('emits game-started when status goes to in-progress', () => {
    let startedPayload: GameStartedPayload | null = null;
    eventBus.on('game-started', (p) => { startedPayload = p; });

    const state = makeLiveGameState({ status: 'pre-game' });
    tracker.updateState(state);

    const updated = { ...state, status: 'in-progress' as const, lastUpdated: Date.now() + 1000 };
    tracker.updateState(updated);

    expect(startedPayload).not.toBeNull();
    expect(startedPayload!.gameId).toBe('test-game-1');
  });

  it('emits game-completed when status goes to final', () => {
    let completedPayload: GameCompletedPayload | null = null;
    eventBus.on('game-completed', (p) => { completedPayload = p; });

    const state = makeLiveGameState({ homeScore: 70, awayScore: 65 });
    tracker.updateState(state);

    const finalState = { ...state, status: 'final' as const, lastUpdated: Date.now() + 1000 };
    tracker.updateState(finalState);

    expect(completedPayload).not.toBeNull();
    expect(completedPayload!.winnerId).toBe('team-a'); // home team wins 70-65
  });

  it('emits score-update with correct diff', () => {
    let scorePayload: ScoreUpdatePayload | null = null;
    eventBus.on('score-update', (p) => { scorePayload = p; });

    const state = makeLiveGameState({ homeScore: 20, awayScore: 15 });
    tracker.updateState(state);

    const updated = { ...state, homeScore: 23, lastUpdated: Date.now() + 1000 };
    tracker.updateState(updated);

    expect(scorePayload).not.toBeNull();
    expect(scorePayload!.homeScore).toBe(23);
    expect(scorePayload!.awayScore).toBe(15);
    expect(scorePayload!.scoreDiff).toBe(8); // 23 - 15
    expect(scorePayload!.previousScoreDiff).toBe(5); // 20 - 15
  });

  it('getAllActiveGames only returns in-progress and halftime games', () => {
    tracker.updateState(makeLiveGameState({ gameId: 'g1', status: 'in-progress' }));
    tracker.updateState(makeLiveGameState({ gameId: 'g2', status: 'halftime' }));
    tracker.updateState(makeLiveGameState({ gameId: 'g3', status: 'final' }));
    tracker.updateState(makeLiveGameState({ gameId: 'g4', status: 'pre-game' }));

    const active = tracker.getAllActiveGames();
    expect(active.length).toBe(2);
    expect(active.map(g => g.gameId).sort()).toEqual(['g1', 'g2']);
  });

  it('tracks size correctly', () => {
    expect(tracker.size).toBe(0);
    tracker.updateState(makeLiveGameState({ gameId: 'g1' }));
    expect(tracker.size).toBe(1);
    tracker.updateState(makeLiveGameState({ gameId: 'g2' }));
    expect(tracker.size).toBe(2);
    tracker.removeGame('g1');
    expect(tracker.size).toBe(1);
  });
});
