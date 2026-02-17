import { TournamentType, TournamentSimulationResult } from '../core/types';
import { CONFIG } from '../config';
import { loadTeams } from '../data/loader';
import { buildBracket } from '../bracket/bracket-builder';
import { runBracketSimulationSync } from '../engine/simulator';
import { upsertTeams, upsertTeamAdvancements } from '../storage/database';
import { generateReport } from '../output/report-generator';
import { renderReport } from '../output/cli-renderer';
import { exportReportToJson } from '../output/json-exporter';
import { getModeIds } from '../modes/registry';

// Import all mode implementations
import '../modes/implementations/pure-statistical';
import '../modes/implementations/upset-chaos';
import '../modes/implementations/mascot-fight';
import '../modes/implementations/coaching';
import '../modes/implementations/momentum';

/**
 * Run all registered modes and produce a comparative summary.
 */
export function runAllModes(
  year?: number,
  tournamentType?: TournamentType,
  simulations?: number,
): void {
  const y = year ?? CONFIG.DEFAULT_YEAR;
  const tt = tournamentType ?? CONFIG.DEFAULT_TOURNAMENT_TYPE;
  const sims = simulations ?? CONFIG.BATCH_SIMULATIONS;

  console.log(`\nBatch simulation: ${tt} tournament ${y}`);
  console.log(`Running ${sims.toLocaleString()} simulations per mode.\n`);

  const teams = loadTeams(y, tt);
  upsertTeams(teams, y);
  const bracket = buildBracket(teams, y, tt);

  const modeIds = getModeIds();
  console.log(`Modes to run: ${modeIds.join(', ')}\n`);

  const summaries: { modeId: string; modeName: string; champion: string; champProb: number }[] = [];

  for (const modeId of modeIds) {
    console.log(`Running mode: ${modeId}...`);
    const start = Date.now();
    const result = runBracketSimulationSync(bracket, teams, modeId, sims);
    const elapsed = Date.now() - start;
    console.log(`  Completed in ${(elapsed / 1000).toFixed(2)}s.`);

    const teamResults = [...result.teamResults.values()];
    upsertTeamAdvancements(modeId, y, tt, teamResults);

    const report = generateReport(result);
    exportReportToJson(report, `${modeId}-${tt}-${y}.json`);

    const topTeam = result.teamResults.get(result.mostLikelyChampion);
    summaries.push({
      modeId,
      modeName: result.modeName,
      champion: topTeam?.teamName ?? 'Unknown',
      champProb: topTeam?.championshipProbability ?? 0,
    });
  }

  // Print comparative summary
  console.log('\n' + '═'.repeat(60));
  console.log('  CROSS-MODE COMPARISON');
  console.log('═'.repeat(60));
  console.log(
    '  ' +
    'Mode'.padEnd(25) +
    'Predicted Champion'.padEnd(22) +
    'Prob'
  );
  console.log('  ' + '─'.repeat(55));

  for (const s of summaries) {
    console.log(
      '  ' +
      s.modeName.padEnd(25) +
      s.champion.padEnd(22) +
      `${(s.champProb * 100).toFixed(1)}%`
    );
  }

  console.log('═'.repeat(60));
}
