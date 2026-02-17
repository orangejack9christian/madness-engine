import { describe, it, expect, beforeEach } from 'vitest';
import { eventBus } from '../../src/ingestion/event-bus';
import type { GameStateChangedPayload, ScoreUpdatePayload } from '../../src/ingestion/event-bus';
import type { LiveGameState } from '../../src/core/types';

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

describe('event-bus', () => {
  beforeEach(() => {
    eventBus.removeAllListeners();
  });

  it('emits and receives typed events', () => {
    let received: GameStateChangedPayload | null = null;
    const state = makeLiveGameState();

    eventBus.on('game-state-changed', (payload) => {
      received = payload;
    });

    const payload: GameStateChangedPayload = {
      gameId: 'test-1',
      previous: null,
      current: state,
      changedFields: ['_initial'],
    };

    eventBus.emit('game-state-changed', payload);
    expect(received).toEqual(payload);
  });

  it('supports multiple listeners for the same event', () => {
    let count = 0;
    const listener1 = () => { count++; };
    const listener2 = () => { count++; };

    eventBus.on('score-update', listener1);
    eventBus.on('score-update', listener2);

    const payload: ScoreUpdatePayload = {
      gameId: 'test-1',
      homeScore: 10,
      awayScore: 5,
      scoreDiff: 5,
      previousScoreDiff: 0,
    };

    eventBus.emit('score-update', payload);
    expect(count).toBe(2);
  });

  it('off() unsubscribes correctly', () => {
    let count = 0;
    const listener = () => { count++; };

    eventBus.on('game-started', listener);

    const state = makeLiveGameState();
    eventBus.emit('game-started', { gameId: 'test-1', state });
    expect(count).toBe(1);

    eventBus.off('game-started', listener);
    eventBus.emit('game-started', { gameId: 'test-2', state });
    expect(count).toBe(1); // should not increment
  });

  it('removeAllListeners clears everything', () => {
    let count = 0;

    eventBus.on('game-completed', () => { count++; });
    eventBus.on('score-update', () => { count++; });

    eventBus.removeAllListeners();

    const state = makeLiveGameState({ status: 'final' });
    eventBus.emit('game-completed', { gameId: 'x', state, winnerId: 'team-a' });
    eventBus.emit('score-update', { gameId: 'x', homeScore: 0, awayScore: 0, scoreDiff: 0, previousScoreDiff: 0 });

    expect(count).toBe(0);
  });
});
