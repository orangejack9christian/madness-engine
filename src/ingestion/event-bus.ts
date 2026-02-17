import { EventEmitter } from 'events';
import { LiveGameState, Round } from '../core/types';

// === Typed Event Payloads ===

export interface GameStateChangedPayload {
  gameId: string;
  previous: LiveGameState | null;
  current: LiveGameState;
  changedFields: string[];
}

export interface GameStartedPayload {
  gameId: string;
  state: LiveGameState;
}

export interface GameCompletedPayload {
  gameId: string;
  state: LiveGameState;
  winnerId: string;
}

export interface ScoreUpdatePayload {
  gameId: string;
  homeScore: number;
  awayScore: number;
  scoreDiff: number;
  previousScoreDiff: number;
}

export interface BracketUpdatedPayload {
  gameId: string;
  winnerId: string;
  round: Round;
  affectedRegion: string;
}

// === Event Map ===

export interface IngestionEventMap {
  'game-state-changed': GameStateChangedPayload;
  'game-started': GameStartedPayload;
  'game-completed': GameCompletedPayload;
  'score-update': ScoreUpdatePayload;
  'bracket-updated': BracketUpdatedPayload;
}

// === Typed Event Bus ===

class TypedEventBus {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  on<K extends keyof IngestionEventMap>(
    event: K,
    listener: (payload: IngestionEventMap[K]) => void,
  ): void {
    this.emitter.on(event, listener as (...args: any[]) => void);
  }

  off<K extends keyof IngestionEventMap>(
    event: K,
    listener: (payload: IngestionEventMap[K]) => void,
  ): void {
    this.emitter.off(event, listener as (...args: any[]) => void);
  }

  emit<K extends keyof IngestionEventMap>(
    event: K,
    payload: IngestionEventMap[K],
  ): void {
    this.emitter.emit(event, payload);
  }

  removeAllListeners(): void {
    this.emitter.removeAllListeners();
  }
}

// Singleton export
export const eventBus = new TypedEventBus();
