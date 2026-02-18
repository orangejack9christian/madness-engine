/**
 * Bracket Scheduler — Automatically checks for and ingests the NCAA tournament
 * bracket during March. Runs on server startup and every few hours.
 *
 * Active window: March 1 through April 10 (covers Selection Sunday through
 * the end of the tournament). Outside this window, does nothing.
 *
 * On each check:
 *   1) Tries to ingest the bracket from ESPN (if not already ingested)
 *   2) Updates team stats (win/loss records)
 *   3) Reloads teams into the database and clears simulation cache
 *
 * The scheduler is idempotent — if the bracket was already ingested and
 * no new data is available, it's a no-op.
 */

import { CONFIG } from '../config';
import { TournamentType } from '../core/types';
import { ingestBracket } from './bracket-ingester';
import { updateTeamStats } from './stats-updater';
import { loadTeams } from '../data/loader';
import { upsertTeams } from '../storage/database';

interface SchedulerState {
  lastBracketIngest: number | null;   // timestamp of last successful bracket ingest
  lastStatsUpdate: number | null;     // timestamp of last successful stats update
  bracketTeamCount: number;           // number of teams found last ingest
  intervalId: ReturnType<typeof setInterval> | null;
}

const state: SchedulerState = {
  lastBracketIngest: null,
  lastStatsUpdate: null,
  bracketTeamCount: 0,
  intervalId: null,
};

// Check interval: every 4 hours
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

// Active months: March (2) and early April (3) — 0-indexed
const ACTIVE_START_MONTH = 2;  // March
const ACTIVE_END_MONTH = 3;    // April
const ACTIVE_END_DAY = 10;     // April 10

function isInActiveWindow(): boolean {
  const now = new Date();
  const month = now.getMonth();
  const day = now.getDate();

  if (month === ACTIVE_START_MONTH) return true;          // All of March
  if (month === ACTIVE_END_MONTH && day <= ACTIVE_END_DAY) return true; // April 1-10
  return false;
}

/**
 * Callback to clear simulation cache — injected by the server
 * so we don't create a circular dependency.
 */
let onDataUpdated: (() => void) | null = null;

/**
 * Run a single check: try bracket ingest + stats update.
 */
async function runCheck(tournamentType: TournamentType, year: number): Promise<void> {
  if (!isInActiveWindow()) {
    console.log('[Bracket Scheduler] Outside active window (March 1 – April 10), skipping.');
    return;
  }

  console.log(`[Bracket Scheduler] Running check for ${tournamentType} ${year}...`);

  // Step 1: Try bracket ingestion
  try {
    const result = await ingestBracket(tournamentType, year);

    if (result.total > 0) {
      state.lastBracketIngest = Date.now();
      state.bracketTeamCount = result.total;
      console.log(`[Bracket Scheduler] Bracket ingested: ${result.total} teams (${result.created} new, ${result.updated} updated)`);

      // Reload teams into database
      const teams = loadTeams(year, tournamentType);
      upsertTeams(teams, year);

      if (onDataUpdated) onDataUpdated();
    }
  } catch (err: any) {
    // This is expected before the bracket is announced
    console.log(`[Bracket Scheduler] Bracket not available yet: ${err.message}`);
  }

  // Step 2: Update stats (win/loss records)
  try {
    const statsResult = await updateTeamStats(tournamentType, year);
    if (statsResult.updated > 0) {
      state.lastStatsUpdate = Date.now();
      console.log(`[Bracket Scheduler] Stats updated: ${statsResult.updated}/${statsResult.total} teams`);

      // Reload teams into database
      const teams = loadTeams(year, tournamentType);
      upsertTeams(teams, year);

      if (onDataUpdated) onDataUpdated();
    }
  } catch (err: any) {
    console.warn(`[Bracket Scheduler] Stats update failed: ${err.message}`);
  }
}

/**
 * Start the bracket auto-check scheduler.
 * Runs immediately on startup, then every CHECK_INTERVAL_MS.
 */
export function startBracketScheduler(
  tournamentType: TournamentType = CONFIG.DEFAULT_TOURNAMENT_TYPE,
  year: number = CONFIG.DEFAULT_YEAR,
  cacheInvalidator?: () => void,
): void {
  if (state.intervalId) {
    console.warn('[Bracket Scheduler] Already running, skipping duplicate start.');
    return;
  }

  onDataUpdated = cacheInvalidator || null;

  console.log(`[Bracket Scheduler] Started for ${tournamentType} ${year}`);
  console.log(`[Bracket Scheduler] Check interval: ${CHECK_INTERVAL_MS / 1000 / 60 / 60}h`);
  console.log(`[Bracket Scheduler] Active window: March 1 – April 10`);

  // Run immediately on startup (with a short delay to let the server finish booting)
  setTimeout(() => runCheck(tournamentType, year), 5000);

  // Then run on interval
  state.intervalId = setInterval(() => runCheck(tournamentType, year), CHECK_INTERVAL_MS);
}

/**
 * Stop the scheduler.
 */
export function stopBracketScheduler(): void {
  if (state.intervalId) {
    clearInterval(state.intervalId);
    state.intervalId = null;
    console.log('[Bracket Scheduler] Stopped.');
  }
}

/**
 * Get current scheduler state (for diagnostics / API).
 */
export function getSchedulerState(): {
  running: boolean;
  lastBracketIngest: number | null;
  lastStatsUpdate: number | null;
  bracketTeamCount: number;
  inActiveWindow: boolean;
} {
  return {
    running: state.intervalId !== null,
    lastBracketIngest: state.lastBracketIngest,
    lastStatsUpdate: state.lastStatsUpdate,
    bracketTeamCount: state.bracketTeamCount,
    inActiveWindow: isInActiveWindow(),
  };
}
