import { Team } from '../../core/types';
import { BaseSimulationMode, DEFAULT_WEIGHTS, DEFAULT_VARIANCE } from '../base-mode';
import { MetricWeights, VarianceConfig, SimulationContext } from '../types';
import { registerMode } from '../registry';

class SeedKillerMode extends BaseSimulationMode {
  readonly id = 'seed-killer';
  readonly name = 'Giant Killer';
  readonly description =
    'History says specific seed matchups produce upsets at reliable rates. The 5v12 upset is tradition. The 6v11 is a coin flip. This mode supercharges the most historically upset-prone matchups.';
  readonly category = 'entertainment' as const;
  readonly confidenceTag = 'whimsical' as const;

  getMetricWeights(): MetricWeights {
    return {
      ...DEFAULT_WEIGHTS,
    };
  }

  getVarianceConfig(): VarianceConfig {
    return {
      ...DEFAULT_VARIANCE,
      baseVariance: 0.14,
      upsetMultiplier: 1.8,
      seedGapSensitivity: 0.6,
      roundVarianceMultipliers: {
        'round-of-64': 1.3,
        'round-of-32': 1.2,
        'sweet-sixteen': 1.1,
        'elite-eight': 1.0,
        'final-four': 0.95,
        'championship': 0.90,
      },
    };
  }

  adjustProbability(
    baseProbability: number,
    team1: Team,
    team2: Team,
    context: SimulationContext,
  ): number {
    // Determine the favorite (lower seed) and underdog (higher seed)
    const team1IsFavorite = team1.seed <= team2.seed;
    const favoriteSeed = team1IsFavorite ? team1.seed : team2.seed;
    const underdogSeed = team1IsFavorite ? team2.seed : team1.seed;

    // Look up the historical upset target for this seed matchup
    const targetUpsetRate = getHistoricalUpsetRate(favoriteSeed, underdogSeed);

    if (targetUpsetRate !== null) {
      // Pull the probability toward the historical upset rate
      // baseProbability is from team1's perspective
      const targetTeam1Prob = team1IsFavorite
        ? 1 - targetUpsetRate
        : targetUpsetRate;

      // Blend: 60% historical target, 40% base model
      let adjusted = targetTeam1Prob * 0.6 + baseProbability * 0.4;

      // In later rounds, underdogs who've already won get a momentum boost
      const underdogGamesWon = team1IsFavorite
        ? context.gamesPlayedByTeam2
        : context.gamesPlayedByTeam1;

      if (underdogGamesWon > 0 && !isFirstRound(context.round)) {
        // Each prior upset win gives the underdog extra confidence
        const momentumBoost = underdogGamesWon * 0.02;
        adjusted = team1IsFavorite
          ? adjusted - momentumBoost
          : adjusted + momentumBoost;
      }

      return Math.max(0.02, Math.min(0.98, adjusted));
    }

    // No special matchup data — return base probability with slight upset bump
    return baseProbability;
  }
}

/**
 * Historical upset rates for classic NCAA tournament seed matchups.
 * Returns the probability that the underdog (higher seed) wins,
 * or null if there's no special data for this matchup.
 */
function getHistoricalUpsetRate(
  favoriteSeed: number,
  underdogSeed: number,
): number | null {
  // Key format: "favorite-underdog"
  const matchupKey = `${favoriteSeed}-${underdogSeed}`;

  const historicalRates: Record<string, number> = {
    // Classic first-round upset-prone matchups
    '5-12': 0.45,   // The legendary 5v12 — pull to near coin flip favoring 12
    '6-11': 0.48,   // 6v11 is nearly a coin flip
    '7-10': 0.46,   // 7v10 produces frequent upsets
    '8-9': 0.50,    // 8v9 is a true toss-up
    '3-14': 0.20,   // 3v14 — slight boost to 14 seed
    '4-13': 0.28,   // 4v13 — meaningful boost to 13 seed
    // Rare but memorable
    '2-15': 0.08,   // 2v15 — it happens (see: UMBC, St. Peter's)
    '1-16': 0.02,   // 1v16 — it happened once (UMBC 2018)
  };

  return historicalRates[matchupKey] ?? null;
}

function isFirstRound(round: string): boolean {
  return round === 'round-of-64' || round === 'first-four';
}

registerMode('seed-killer', () => new SeedKillerMode());
