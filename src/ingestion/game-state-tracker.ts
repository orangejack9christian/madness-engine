import { LiveGameState } from '../core/types';
import { eventBus } from './event-bus';

/**
 * Fields to compare when detecting meaningful changes.
 * Excludes `lastUpdated` to filter timestamp-only noise.
 */
const DIFF_FIELDS: (keyof LiveGameState)[] = [
  'homeScore', 'awayScore', 'period', 'timeRemainingSeconds',
  'possession', 'status',
  'homeFouls', 'awayFouls', 'homeInBonus', 'awayInBonus',
  'homeFGM', 'homeFGA', 'home3PM', 'home3PA', 'homeFTM', 'homeFTA',
  'awayFGM', 'awayFGA', 'away3PM', 'away3PA', 'awayFTM', 'awayFTA',
];

export interface GameStateDiff {
  gameId: string;
  changedFields: string[];
  scoreChanged: boolean;
  periodChanged: boolean;
  statusChanged: boolean;
  previousState: LiveGameState | null;
  currentState: LiveGameState;
}

export class GameStateTracker {
  private states: Map<string, LiveGameState> = new Map();

  /**
   * Update game state. Returns the diff if meaningful changes detected, null otherwise.
   * Emits events through the event bus when changes are found.
   */
  updateState(newState: LiveGameState): GameStateDiff | null {
    const previous = this.states.get(newState.gameId) ?? null;
    const changedFields = this.computeChangedFields(previous, newState);

    if (changedFields.length === 0 && previous !== null) {
      return null;
    }

    this.states.set(newState.gameId, newState);

    const diff: GameStateDiff = {
      gameId: newState.gameId,
      changedFields,
      scoreChanged: changedFields.includes('homeScore') || changedFields.includes('awayScore'),
      periodChanged: changedFields.includes('period'),
      statusChanged: changedFields.includes('status'),
      previousState: previous,
      currentState: newState,
    };

    // Emit events
    eventBus.emit('game-state-changed', {
      gameId: newState.gameId,
      previous,
      current: newState,
      changedFields,
    });

    // Game started
    if (
      diff.statusChanged &&
      previous?.status !== 'in-progress' &&
      newState.status === 'in-progress'
    ) {
      eventBus.emit('game-started', {
        gameId: newState.gameId,
        state: newState,
      });
    }

    // Game completed
    if (
      diff.statusChanged &&
      newState.status === 'final'
    ) {
      const winnerId = newState.homeScore > newState.awayScore
        ? newState.homeTeamId
        : newState.awayTeamId;

      eventBus.emit('game-completed', {
        gameId: newState.gameId,
        state: newState,
        winnerId,
      });
    }

    // Score update
    if (diff.scoreChanged) {
      const prevHomeDiff = previous
        ? (previous.homeScore - previous.awayScore)
        : 0;

      eventBus.emit('score-update', {
        gameId: newState.gameId,
        homeScore: newState.homeScore,
        awayScore: newState.awayScore,
        scoreDiff: newState.homeScore - newState.awayScore,
        previousScoreDiff: prevHomeDiff,
      });
    }

    return diff;
  }

  getState(gameId: string): LiveGameState | undefined {
    return this.states.get(gameId);
  }

  getAllActiveGames(): LiveGameState[] {
    return [...this.states.values()].filter(
      g => g.status === 'in-progress' || g.status === 'halftime',
    );
  }

  getAllGames(): LiveGameState[] {
    return [...this.states.values()];
  }

  getAllGamesAsMap(): Map<string, LiveGameState> {
    return new Map(this.states);
  }

  removeGame(gameId: string): void {
    this.states.delete(gameId);
  }

  clear(): void {
    this.states.clear();
  }

  get size(): number {
    return this.states.size;
  }

  private computeChangedFields(
    previous: LiveGameState | null,
    current: LiveGameState,
  ): string[] {
    if (!previous) {
      // First time seeing this game — everything is new
      return ['_initial'];
    }

    const changed: string[] = [];

    for (const field of DIFF_FIELDS) {
      const oldVal = previous[field];
      const newVal = current[field];

      if (oldVal !== newVal) {
        changed.push(field);
      }
    }

    // Check nested objects
    if (
      previous.lastScoringRun.team !== current.lastScoringRun.team ||
      previous.lastScoringRun.points !== current.lastScoringRun.points
    ) {
      changed.push('lastScoringRun');
    }

    if (
      previous.timeoutsRemaining.home !== current.timeoutsRemaining.home ||
      previous.timeoutsRemaining.away !== current.timeoutsRemaining.away
    ) {
      changed.push('timeoutsRemaining');
    }

    return changed;
  }
}
