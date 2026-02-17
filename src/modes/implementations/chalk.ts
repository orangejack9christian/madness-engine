import { Team } from '../../core/types';
import { BaseSimulationMode, DEFAULT_WEIGHTS, DEFAULT_VARIANCE } from '../base-mode';
import { MetricWeights, VarianceConfig, SimulationContext, RequiredDataSource } from '../types';
import { registerMode } from '../registry';

/**
 * Historical seed-vs-seed win rates for the first round (1985-present).
 * Key format: "higherSeed-lowerSeed" where higherSeed is the better (lower number) seed.
 */
const HISTORICAL_SEED_WIN_RATES: Record<string, number> = {
  '1-16': 0.99,
  '2-15': 0.94,
  '3-14': 0.85,
  '4-13': 0.79,
  '5-12': 0.65,
  '6-11': 0.63,
  '7-10': 0.61,
  '8-9': 0.51,
};

class ChalkMode extends BaseSimulationMode {
  readonly id = 'chalk';
  readonly name = 'Chalk Talk';
  readonly description =
    'Strictly follows the historical seed-based win rates. Higher seeds almost always advance. The safest, most boring bracket — but often the most accurate.';
  readonly category = 'research' as const;
  readonly confidenceTag = 'statistically-validated' as const;

  getMetricWeights(): MetricWeights {
    return {
      ...DEFAULT_WEIGHTS,
    };
  }

  getVarianceConfig(): VarianceConfig {
    return {
      ...DEFAULT_VARIANCE,
      baseVariance: 0.06,
      seedGapSensitivity: 2.5,
      upsetMultiplier: 0.4,
    };
  }

  getRequiredData(): RequiredDataSource[] {
    return ['historical-results'];
  }

  adjustProbability(
    baseProbability: number,
    team1: Team,
    team2: Team,
    _context: SimulationContext,
  ): number {
    const historicalRate = getHistoricalRate(team1.seed, team2.seed);

    if (historicalRate === null) {
      // No direct historical data for this seed matchup — lean on base probability
      // but still nudge toward the higher seed
      const seedAdvantage = team2.seed - team1.seed;
      const nudge = seedAdvantage * 0.008;
      return Math.max(0.02, Math.min(0.98, baseProbability + nudge));
    }

    // Blend: 40% base model + 60% historical seed rates
    const blended = baseProbability * 0.4 + historicalRate * 0.6;

    return Math.max(0.02, Math.min(0.98, blended));
  }
}

/**
 * Look up the historical win rate for team1 vs team2 based on seeds.
 * Returns the probability that team1 wins, or null if no direct lookup exists.
 */
function getHistoricalRate(seed1: number, seed2: number): number | null {
  const higherSeed = Math.min(seed1, seed2);
  const lowerSeed = Math.max(seed1, seed2);
  const key = `${higherSeed}-${lowerSeed}`;

  const rate = HISTORICAL_SEED_WIN_RATES[key];
  if (rate === undefined) {
    return null;
  }

  // Rate is from the perspective of the higher (better) seed
  // If team1 is the higher seed, return rate directly; otherwise invert
  return seed1 <= seed2 ? rate : 1 - rate;
}

registerMode('chalk', () => new ChalkMode());
