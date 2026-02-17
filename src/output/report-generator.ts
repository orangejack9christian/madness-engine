import { TournamentSimulationResult } from '../core/types';
import { REGIONS } from '../core/constants';
import { getMode } from '../modes/registry';
import { OutputReport, ChampionshipOddsRow, RegionBreakdown } from './types';

/**
 * Generate a structured report from a tournament simulation result.
 */
export function generateReport(result: TournamentSimulationResult): OutputReport {
  let mode;
  try {
    mode = getMode(result.modeId);
  } catch {
    mode = null;
  }

  const teamResultsArray = [...result.teamResults.values()];

  // Championship odds: top 25 teams by championship probability
  const byChampProb = [...teamResultsArray].sort(
    (a, b) => b.championshipProbability - a.championshipProbability
  );

  const championshipOdds: ChampionshipOddsRow[] = byChampProb.map((t, i) => ({
    rank: i + 1,
    teamId: t.teamId,
    seed: t.seed,
    teamName: t.teamName,
    region: t.region,
    championPct: formatPct(t.championshipProbability),
    finalFourPct: formatPct(t.roundProbabilities['final-four']),
    eliteEightPct: formatPct(t.roundProbabilities['elite-eight']),
    sweetSixteenPct: formatPct(t.roundProbabilities['sweet-sixteen']),
    expectedWins: t.expectedWins.toFixed(2),
  }));

  // Final Four odds: top 16 teams by FF probability
  const byFFProb = [...teamResultsArray].sort(
    (a, b) => (b.roundProbabilities['final-four'] ?? 0) - (a.roundProbabilities['final-four'] ?? 0)
  );

  const finalFourOdds = byFFProb.slice(0, 16).map(t => ({
    teamId: t.teamId,
    seed: t.seed,
    teamName: t.teamName,
    region: t.region,
    probability: formatPct(t.roundProbabilities['final-four']),
  }));

  // Region breakdowns
  const regionBreakdowns: RegionBreakdown[] = REGIONS.map(region => {
    const regionTeams = teamResultsArray
      .filter(t => t.region === region)
      .sort((a, b) => a.seed - b.seed);

    return {
      region,
      teams: regionTeams.map(t => ({
        teamId: t.teamId,
        seed: t.seed,
        teamName: t.teamName,
        roundOf32Pct: formatPct(t.roundProbabilities['round-of-32']),
        sweetSixteenPct: formatPct(t.roundProbabilities['sweet-sixteen']),
        eliteEightPct: formatPct(t.roundProbabilities['elite-eight']),
        finalFourPct: formatPct(t.roundProbabilities['final-four']),
      })),
    };
  });

  // Biggest upset description
  let biggestUpset: string | null = null;
  if (result.biggestProjectedUpset) {
    const u = result.biggestProjectedUpset;
    const underdogTeam = result.teamResults.get(u.underdogTeamId);
    if (underdogTeam) {
      biggestUpset = `#${u.underdogSeed} ${underdogTeam.teamName} — ${formatPct(u.underdogWinPct)} chance of reaching ${u.round}`;
    }
  }

  return {
    title: `${result.tournamentType === 'mens' ? "Men's" : "Women's"} Tournament Simulation`,
    modeId: result.modeId,
    modeName: result.modeName,
    confidenceTag: mode?.confidenceTag ?? 'experimental',
    generatedAt: new Date(result.timestamp).toISOString(),
    simulationCount: result.simulationCount,
    championshipOdds,
    finalFourOdds,
    regionBreakdowns,
    biggestUpset,
    volatilityIndex: result.volatilityIndex,
  };
}

function formatPct(value: number): string {
  if (value >= 0.995) return '>99%';
  if (value < 0.001) return '<0.1%';
  if (value < 0.01) return `${(value * 100).toFixed(1)}%`;
  return `${(value * 100).toFixed(1)}%`;
}
