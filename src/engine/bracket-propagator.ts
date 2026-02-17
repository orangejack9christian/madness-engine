import { Team, Round, TournamentType, TeamTournamentResult, TournamentSimulationResult } from '../core/types';
import { ROUNDS_IN_ORDER, ROUND_INDEX } from '../core/constants';
import { SimulationMode, SimulationContext } from '../modes/types';
import { SerializedBracket } from '../bracket/types';
import { BracketSimState } from '../bracket/bracket-state';
import { computeBaseWinProbability, applySeedGapAdjustment, sampleOutcome, computeLiveAdjustedProbability } from './probability-model';
import { CONFIG } from '../config';
import { estimatePossessions, estimateTeamScore, sampleScore, simulateOvertime } from './score-model';
import { BracketSimResult } from './types';

/**
 * Seeded random number generator (xoshiro128**).
 * Provides reproducible randomness for each simulation run.
 */
function createRng(seed: number): () => number {
  let s0 = seed | 0;
  let s1 = (seed * 1664525 + 1013904223) | 0;
  let s2 = (s1 * 1664525 + 1013904223) | 0;
  let s3 = (s2 * 1664525 + 1013904223) | 0;

  return () => {
    const t = (s1 << 9) | 0;
    let r = (s1 * 5) | 0;
    r = ((r << 7) | (r >>> 25)) | 0;
    r = (r * 9) | 0;

    s2 ^= s0;
    s3 ^= s1;
    s1 ^= s2;
    s0 ^= s3;
    s2 ^= t;
    s3 = (s3 << 11) | (s3 >>> 21);

    return (r >>> 0) / 4294967296;
  };
}

/**
 * Simulate a full tournament bracket N times using the given mode.
 * Returns aggregated counts of how far each team advances.
 */
export function simulateFullBracket(
  bracket: SerializedBracket,
  teams: Team[],
  mode: SimulationMode,
  simulationCount: number,
  baseSeed?: number,
): BracketSimResult {
  const teamMap = new Map<string, Team>();
  for (const t of teams) teamMap.set(t.id, t);

  const roundCounts: Record<string, Record<Round, number>> = {};
  const championshipCounts: Record<string, number> = {};

  // Initialize counts
  for (const team of teams) {
    roundCounts[team.id] = {} as Record<Round, number>;
    for (const round of ROUNDS_IN_ORDER) {
      roundCounts[team.id][round] = 0;
    }
    championshipCounts[team.id] = 0;
  }

  const modeState = mode.initializeSimState?.();

  for (let sim = 0; sim < simulationCount; sim++) {
    const rng = createRng(baseSeed !== undefined ? baseSeed + sim : Date.now() + sim);
    const state = new BracketSimState(bracket);

    // Track games played per team in this sim (for fatigue modes)
    const gamesPlayed: Record<string, number> = {};

    // Simulate round by round
    for (const round of ROUNDS_IN_ORDER) {
      const games = state.getReadyGamesForRound(round);

      for (const game of games) {
        if (!game.team1Id || !game.team2Id) continue;

        const team1 = teamMap.get(game.team1Id);
        const team2 = teamMap.get(game.team2Id);
        if (!team1 || !team2) continue;

        // Count reaching this round
        roundCounts[team1.id][round]++;
        roundCounts[team2.id][round]++;

        const context: SimulationContext = {
          round,
          region: game.region as any,
          tournamentType: bracket.tournamentType,
          gamesPlayedByTeam1: gamesPlayed[team1.id] ?? 0,
          gamesPlayedByTeam2: gamesPlayed[team2.id] ?? 0,
        };

        // Compute win probability
        const weights = mode.getMetricWeights();
        const variance = mode.getVarianceConfig();
        let prob = computeBaseWinProbability(team1, team2, weights);
        prob = applySeedGapAdjustment(prob, team1.seed, team2.seed, variance.seedGapSensitivity);
        prob = mode.adjustProbability(prob, team1, team2, context);

        // Apply live state blending if game is in progress
        if (game.liveGame && game.liveGame.status !== 'pre-game') {
          const homeIsTeam1 = game.liveGame.homeTeamId === team1.id;
          prob = computeLiveAdjustedProbability(prob, game.liveGame, homeIsTeam1, CONFIG.LIVE_STATE_GAMMA);
        }

        // Clamp probability
        prob = Math.max(0.001, Math.min(0.999, prob));

        // Sample outcome
        const team1Wins = sampleOutcome(prob, variance, round, rng);
        const winnerId = team1Wins ? team1.id : team2.id;
        const loserId = team1Wins ? team2.id : team1.id;

        state.setWinner(game.slotId, winnerId);
        gamesPlayed[winnerId] = (gamesPlayed[winnerId] ?? 0) + 1;
        gamesPlayed[loserId] = (gamesPlayed[loserId] ?? 0) + 1;

        // Notify mode of game completion (for stateful modes)
        if (mode.onGameComplete && modeState) {
          const winner = teamMap.get(winnerId)!;
          const loser = teamMap.get(loserId)!;
          mode.onGameComplete(winner, loser, round, modeState);
        }
      }
    }

    // Record champion
    const champion = state.getChampion();
    if (champion) {
      championshipCounts[champion] = (championshipCounts[champion] ?? 0) + 1;
    }
  }

  return { roundCounts, championshipCounts, totalSims: simulationCount };
}

/**
 * Convert raw BracketSimResult counts into structured TeamTournamentResult objects.
 */
export function aggregateBracketResults(
  simResult: BracketSimResult,
  teams: Team[],
  modeId: string,
  modeName: string,
  tournamentType: TournamentType,
): TournamentSimulationResult {
  const teamResults = new Map<string, TeamTournamentResult>();
  const totalSims = simResult.totalSims;

  for (const team of teams) {
    const counts = simResult.roundCounts[team.id];
    const champCount = simResult.championshipCounts[team.id] ?? 0;

    const roundProbs: Record<Round, number> = {} as Record<Round, number>;
    roundProbs['first-four'] = 1;
    roundProbs['round-of-64'] = 1; // All 64 teams start here

    for (const round of ROUNDS_IN_ORDER) {
      roundProbs[round] = (counts?.[round] ?? 0) / totalSims;
    }

    // Expected wins: sum of advancement probabilities
    let expectedWins = 0;
    for (const round of ROUNDS_IN_ORDER) {
      if (round === 'round-of-64') continue; // Making R64 isn't a "win"
      expectedWins += roundProbs[round];
    }

    teamResults.set(team.id, {
      teamId: team.id,
      teamName: team.name,
      seed: team.seed,
      region: team.region,
      roundProbabilities: roundProbs,
      championshipProbability: champCount / totalSims,
      expectedWins,
    });
  }

  // Find most likely Final Four
  const finalFourProbs: { teamId: string; prob: number }[] = [];
  for (const [id, result] of teamResults) {
    finalFourProbs.push({ teamId: id, prob: result.roundProbabilities['final-four'] });
  }
  finalFourProbs.sort((a, b) => b.prob - a.prob);
  const mostLikelyFinalFour = finalFourProbs.slice(0, 4).map(x => x.teamId);

  // Find most likely champion
  let mostLikelyChampion = '';
  let maxChampProb = 0;
  for (const [id, count] of Object.entries(simResult.championshipCounts)) {
    if (count > maxChampProb) {
      maxChampProb = count;
      mostLikelyChampion = id;
    }
  }

  // Find biggest projected upset: the underdog (seed >= 9) whose advancement
  // probability most exceeds the historical average for their seed in a given round.
  // Skip round-of-64 since every team starts there.
  let biggestUpset: TournamentSimulationResult['biggestProjectedUpset'] = null;
  let maxUpsetSurprise = 0;

  const upsetRounds = ROUNDS_IN_ORDER.filter(r => r !== 'round-of-64');
  for (const team of teams) {
    if (team.seed < 9) continue;
    const counts = simResult.roundCounts[team.id];
    for (const round of upsetRounds) {
      const reachProb = (counts?.[round] ?? 0) / totalSims;
      if (reachProb < 0.01) continue; // Skip negligible probabilities
      const expectedProbForSeed = getExpectedAdvancementForSeed(team.seed, round);
      const surprise = reachProb - expectedProbForSeed;
      if (surprise > maxUpsetSurprise) {
        maxUpsetSurprise = surprise;
        biggestUpset = {
          round,
          favoriteTeamId: '',
          underdogTeamId: team.id,
          favoriteSeed: 1,
          underdogSeed: team.seed,
          underdogWinPct: reachProb,
        };
      }
    }
  }

  // Volatility index: standard deviation of championship probabilities
  const champProbs = teams.map(t => (simResult.championshipCounts[t.id] ?? 0) / totalSims);
  const meanChampProb = champProbs.reduce((s, v) => s + v, 0) / champProbs.length;
  const volatilityIndex = Math.sqrt(
    champProbs.reduce((s, v) => s + (v - meanChampProb) ** 2, 0) / champProbs.length
  );

  return {
    modeId,
    modeName,
    tournamentType,
    timestamp: Date.now(),
    simulationCount: totalSims,
    teamResults,
    mostLikelyFinalFour,
    mostLikelyChampion,
    biggestProjectedUpset: biggestUpset,
    volatilityIndex,
  };
}

function getExpectedAdvancementForSeed(seed: number, round: Round): number {
  // Rough historical baselines for men's tournament
  const expectations: Record<number, Record<string, number>> = {
    1: { 'round-of-32': 0.99, 'sweet-sixteen': 0.85, 'elite-eight': 0.60, 'final-four': 0.35, 'championship': 0.18 },
    2: { 'round-of-32': 0.94, 'sweet-sixteen': 0.65, 'elite-eight': 0.40, 'final-four': 0.20, 'championship': 0.10 },
    3: { 'round-of-32': 0.85, 'sweet-sixteen': 0.50, 'elite-eight': 0.25, 'final-four': 0.10, 'championship': 0.04 },
    4: { 'round-of-32': 0.79, 'sweet-sixteen': 0.40, 'elite-eight': 0.18, 'final-four': 0.07, 'championship': 0.03 },
    5: { 'round-of-32': 0.65, 'sweet-sixteen': 0.30, 'elite-eight': 0.12, 'final-four': 0.04, 'championship': 0.015 },
    6: { 'round-of-32': 0.63, 'sweet-sixteen': 0.25, 'elite-eight': 0.10, 'final-four': 0.03, 'championship': 0.01 },
    7: { 'round-of-32': 0.61, 'sweet-sixteen': 0.20, 'elite-eight': 0.07, 'final-four': 0.02, 'championship': 0.007 },
    8: { 'round-of-32': 0.51, 'sweet-sixteen': 0.15, 'elite-eight': 0.05, 'final-four': 0.015, 'championship': 0.005 },
  };

  const seedExpectation = expectations[Math.min(seed, 8)];
  if (!seedExpectation) return 0;
  return seedExpectation[round] ?? 0;
}
