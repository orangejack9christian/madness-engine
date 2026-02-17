import { Team, TournamentType } from '../core/types';
import { SerializedBracket } from '../bracket/types';
import { CONFIG } from '../config';
import { eventBus, GameStateChangedPayload, GameCompletedPayload } from '../ingestion/event-bus';
import { GameStateTracker } from '../ingestion/game-state-tracker';
import { LiveStateBlender } from '../engine/live-state-blender';
import { runBracketSimulationSync } from '../engine/simulator';
import { generateReport } from '../output/report-generator';
import { recordActualWinner } from '../storage/database';

export interface RealTimeLoopOptions {
  bracket: SerializedBracket;
  teams: Team[];
  modeId: string;
  tracker: GameStateTracker;
  broadcastFn: (data: any) => void;
  simulationCount?: number;
}

export class RealTimeLoop {
  private blender: LiveStateBlender;
  private tracker: GameStateTracker;
  private modeId: string;
  private teams: Team[];
  private simulationCount: number;
  private broadcastFn: (data: any) => void;

  private isSimulating = false;
  private pendingSimulation = false;
  private isRunning = false;
  private lastBroadcastTime = 0;

  // Bound handlers for event bus (needed for cleanup)
  private onGameStateChangedBound: (payload: GameStateChangedPayload) => void;
  private onGameCompletedBound: (payload: GameCompletedPayload) => void;

  constructor(options: RealTimeLoopOptions) {
    this.blender = new LiveStateBlender(options.bracket, options.teams);
    this.tracker = options.tracker;
    this.modeId = options.modeId;
    this.teams = options.teams;
    this.simulationCount = options.simulationCount ?? CONFIG.SIMULATIONS_PER_UPDATE;
    this.broadcastFn = options.broadcastFn;

    this.onGameStateChangedBound = this.onGameStateChanged.bind(this);
    this.onGameCompletedBound = this.onGameCompleted.bind(this);
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    eventBus.on('game-state-changed', this.onGameStateChangedBound);
    eventBus.on('game-completed', this.onGameCompletedBound);

    console.log(`[RealTimeLoop] Started (mode: ${this.modeId}, sims: ${this.simulationCount})`);
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;

    eventBus.off('game-state-changed', this.onGameStateChangedBound);
    eventBus.off('game-completed', this.onGameCompletedBound);

    console.log('[RealTimeLoop] Stopped');
  }

  private onGameStateChanged(_payload: GameStateChangedPayload): void {
    this.queueResimulation();
  }

  private onGameCompleted(payload: GameCompletedPayload): void {
    // Find the bracket slot for this game and lock the result
    const liveGames = this.tracker.getAllGamesAsMap();
    const adjusted = this.blender.blend(liveGames);

    // Find slot by matching teams
    for (const slot of adjusted.bracket.slots) {
      if (slot.liveGame?.gameId === payload.gameId) {
        this.blender.lockResult(slot.slotId, payload.winnerId);

        // Record for calibration
        recordActualWinner(payload.gameId, payload.winnerId);

        // Emit bracket-updated event
        eventBus.emit('bracket-updated', {
          gameId: payload.gameId,
          winnerId: payload.winnerId,
          round: payload.state.round,
          affectedRegion: slot.region as string,
        });

        break;
      }
    }

    this.queueResimulation();
  }

  private queueResimulation(): void {
    if (!this.isRunning) return;

    if (this.isSimulating) {
      // Already running a simulation — queue exactly one follow-up
      this.pendingSimulation = true;
      return;
    }

    this.runSimulation();
  }

  private runSimulation(): void {
    this.isSimulating = true;
    this.pendingSimulation = false;

    const startTime = Date.now();

    try {
      // Get current live game states
      const liveGames = this.tracker.getAllGamesAsMap();
      const adjusted = this.blender.blend(liveGames);

      // Run Monte Carlo simulation with live-adjusted bracket
      const result = runBracketSimulationSync(
        adjusted.bracket,
        this.teams,
        this.modeId,
        this.simulationCount,
      );

      // Generate report
      const report = generateReport(result);

      // Broadcast simulation results
      const teamResults = [...result.teamResults.values()];
      this.broadcastFn({
        type: 'simulation-update',
        payload: {
          report,
          rawResults: teamResults.map(t => ({
            teamId: t.teamId,
            teamName: t.teamName,
            seed: t.seed,
            region: t.region,
            championshipProbability: t.championshipProbability,
            roundProbabilities: t.roundProbabilities,
            expectedWins: t.expectedWins,
          })),
          mostLikelyFinalFour: result.mostLikelyFinalFour,
          mostLikelyChampion: result.mostLikelyChampion,
          volatilityIndex: result.volatilityIndex,
          liveGamesActive: adjusted.activeGameSlots.length,
          gamesCompleted: adjusted.completedGameSlots.length,
        },
      });

      // Broadcast live game states
      this.broadcastFn({
        type: 'live-games-update',
        payload: {
          games: Object.fromEntries(liveGames),
          activeSlots: adjusted.activeGameSlots,
          completedSlots: adjusted.completedGameSlots,
        },
      });

      const elapsed = Date.now() - startTime;
      this.lastBroadcastTime = Date.now();

      if (elapsed > 2000) {
        console.warn(`[RealTimeLoop] Simulation took ${elapsed}ms (target: <2000ms)`);
      }
    } catch (err: any) {
      console.error('[RealTimeLoop] Simulation error:', err.message);
    } finally {
      this.isSimulating = false;

      // If another event queued while we were simulating, run again
      if (this.pendingSimulation && this.isRunning) {
        // Small delay to prevent tight loops
        setTimeout(() => this.runSimulation(), 50);
      }
    }
  }

  get running(): boolean {
    return this.isRunning;
  }
}
