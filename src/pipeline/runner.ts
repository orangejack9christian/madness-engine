import { TournamentType, TournamentSimulationResult } from '../core/types';
import { CONFIG } from '../config';
import { loadTeams } from '../data/loader';
import { buildBracket } from '../bracket/bracket-builder';
import { runBracketSimulationSync } from '../engine/simulator';
import { upsertTeams, upsertTeamAdvancements } from '../storage/database';
import { generateReport } from '../output/report-generator';
import { renderReport } from '../output/cli-renderer';
import { exportReportToJson } from '../output/json-exporter';

// Import all mode implementations
import '../modes/implementations/pure-statistical';
import '../modes/implementations/upset-chaos';
import '../modes/implementations/mascot-fight';
import '../modes/implementations/coaching';
import '../modes/implementations/momentum';

export interface RunOptions {
  year?: number;
  tournamentType?: TournamentType;
  modeIds?: string[];
  simulations?: number;
  exportJson?: boolean;
  silent?: boolean;
  seed?: number;
}

/**
 * Run a full tournament simulation pipeline:
 * 1. Load team data
 * 2. Build bracket
 * 3. Run Monte Carlo simulation for each mode
 * 4. Store results
 * 5. Generate and display report
 */
export function runSimulation(options: RunOptions = {}): TournamentSimulationResult[] {
  const year = options.year ?? CONFIG.DEFAULT_YEAR;
  const tournamentType = options.tournamentType ?? CONFIG.DEFAULT_TOURNAMENT_TYPE;
  const modeIds = options.modeIds ?? CONFIG.ACTIVE_MODES;
  const simCount = options.simulations ?? CONFIG.SIMULATIONS_PER_UPDATE;
  const exportJson = options.exportJson ?? false;

  // Load teams
  if (!options.silent) console.log(`Loading ${tournamentType} team data for ${year}...`);
  const teams = loadTeams(year, tournamentType);
  if (!options.silent) console.log(`Loaded ${teams.length} teams.`);

  // Store teams in database
  upsertTeams(teams, year);

  // Build bracket
  if (!options.silent) console.log('Building tournament bracket...');
  const bracket = buildBracket(teams, year, tournamentType);

  const results: TournamentSimulationResult[] = [];

  for (const modeId of modeIds) {
    if (!options.silent) console.log(`\nRunning ${simCount.toLocaleString()} simulations with mode: ${modeId}...`);

    const startTime = Date.now();
    const result = runBracketSimulationSync(bracket, teams, modeId, simCount, options.seed);
    const elapsed = Date.now() - startTime;

    if (!options.silent) console.log(`Completed in ${(elapsed / 1000).toFixed(2)}s.`);

    // Store advancement probabilities
    const teamResults = [...result.teamResults.values()];
    upsertTeamAdvancements(modeId, year, tournamentType, teamResults);

    // Generate and display report
    const report = generateReport(result);

    if (!options.silent) {
      console.log('\n' + renderReport(report));
    }

    if (exportJson) {
      const filePath = exportReportToJson(report);
      if (!options.silent) console.log(`Report exported to: ${filePath}`);
    }

    results.push(result);
  }

  return results;
}
