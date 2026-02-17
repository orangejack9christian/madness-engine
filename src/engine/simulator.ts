import path from 'path';
import Piscina from 'piscina';
import { Team, TournamentType, TournamentSimulationResult, Round } from '../core/types';
import { CONFIG } from '../config';
import { SimulationTask, BracketSimResult } from './types';
import { SerializedBracket } from '../bracket/types';
import { aggregateBracketResults } from './bracket-propagator';
import { getMode } from '../modes/registry';

// Import mode implementations to ensure they register
import '../modes/implementations/pure-statistical';

let pool: Piscina | null = null;

function getPool(): Piscina {
  if (pool) return pool;
  pool = new Piscina({
    filename: path.resolve(__dirname, 'sim-worker.js'),
    maxThreads: CONFIG.WORKER_THREADS,
    idleTimeout: 30000,
  });
  return pool;
}

/**
 * Destroy the worker pool. Call on shutdown.
 */
export async function destroyPool(): Promise<void> {
  if (pool) {
    await pool.destroy();
    pool = null;
  }
}

/**
 * Run a full bracket simulation using worker threads.
 * Splits the total simulations across workers for parallelism.
 */
export async function runBracketSimulation(
  bracket: SerializedBracket,
  teams: Team[],
  modeId: string,
  totalSimulations?: number,
): Promise<TournamentSimulationResult> {
  const simCount = totalSimulations ?? CONFIG.SIMULATIONS_PER_UPDATE;
  const mode = getMode(modeId);
  const workerCount = CONFIG.WORKER_THREADS;

  // Split simulations across workers
  const simsPerWorker = Math.floor(simCount / workerCount);
  const remainder = simCount % workerCount;

  const teamsJson = JSON.stringify(teams);
  const bracketJson = JSON.stringify(bracket);

  const tasks: SimulationTask[] = [];
  for (let i = 0; i < workerCount; i++) {
    const count = simsPerWorker + (i < remainder ? 1 : 0);
    if (count === 0) continue;

    tasks.push({
      type: 'full-bracket',
      modeId,
      simulationCount: count,
      tournamentType: bracket.tournamentType,
      year: bracket.year,
      seed: Date.now() + i * 1000000,
      teamsJson,
      bracketJson,
    });
  }

  const workerPool = getPool();
  const results: BracketSimResult[] = await Promise.all(
    tasks.map(task => workerPool.run(task))
  );

  // Merge results from all workers
  const merged = mergeResults(results);

  return aggregateBracketResults(merged, teams, modeId, mode.name, bracket.tournamentType);
}

/**
 * Run bracket simulation synchronously in the main thread.
 * Useful for testing or when worker threads aren't needed.
 */
export function runBracketSimulationSync(
  bracket: SerializedBracket,
  teams: Team[],
  modeId: string,
  totalSimulations?: number,
  seed?: number,
): TournamentSimulationResult {
  const simCount = totalSimulations ?? CONFIG.SIMULATIONS_PER_UPDATE;
  const mode = getMode(modeId);

  // Import here to avoid circular dependency in workers
  const { simulateFullBracket } = require('./bracket-propagator');
  const result: BracketSimResult = simulateFullBracket(bracket, teams, mode, simCount, seed);

  return aggregateBracketResults(result, teams, modeId, mode.name, bracket.tournamentType);
}

/**
 * Merge multiple BracketSimResult objects from parallel workers.
 */
function mergeResults(results: BracketSimResult[]): BracketSimResult {
  const merged: BracketSimResult = {
    roundCounts: {},
    championshipCounts: {},
    totalSims: 0,
  };

  for (const result of results) {
    merged.totalSims += result.totalSims;

    for (const [teamId, rounds] of Object.entries(result.roundCounts)) {
      if (!merged.roundCounts[teamId]) {
        merged.roundCounts[teamId] = {} as any;
      }
      for (const [round, count] of Object.entries(rounds)) {
        const r = round as Round;
        merged.roundCounts[teamId][r] =
          (merged.roundCounts[teamId][r] ?? 0) + (count as number);
      }
    }

    for (const [teamId, count] of Object.entries(result.championshipCounts)) {
      merged.championshipCounts[teamId] =
        (merged.championshipCounts[teamId] ?? 0) + count;
    }
  }

  return merged;
}
