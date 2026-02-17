import { Team } from '../../core/types';
import { BaseSimulationMode, DEFAULT_WEIGHTS, DEFAULT_VARIANCE } from '../base-mode';
import { MetricWeights, VarianceConfig, SimulationContext } from '../types';
import { registerMode } from '../registry';

class CinderellaMode extends BaseSimulationMode {
  readonly id = 'cinderella';
  readonly name = 'Cinderella Story';
  readonly description =
    'Every underdog has its day. Dramatically boosts lower seeds while penalizing favorites. Double-digit seeds get massive upsets. The bracket-buster\'s dream.';
  readonly category = 'entertainment' as const;
  readonly confidenceTag = 'whimsical' as const;

  getMetricWeights(): MetricWeights {
    return {
      ...DEFAULT_WEIGHTS,
      // Reduce all standard metric weights — stats barely matter here
      adjOffensiveEfficiency: 0.2,
      adjDefensiveEfficiency: 0.2,
      adjTempo: 0.2,
      strengthOfSchedule: 0.2,
      effectiveFGPct: 0.2,
      threePointRate: 0.2,
      threePointPct: 0.2,
      freeThrowRate: 0.2,
      freeThrowPct: 0.2,
      offensiveReboundPct: 0.2,
      defensiveReboundPct: 0.2,
      turnoverPct: 0.2,
      experienceRating: 0.2,
      momentumScore: 0.2,
    };
  }

  getVarianceConfig(): VarianceConfig {
    return {
      ...DEFAULT_VARIANCE,
      baseVariance: 0.25,
      upsetMultiplier: 3.0,
      seedGapSensitivity: 0.1, // Almost ignore seeds for the base calc
    };
  }

  adjustProbability(
    baseProbability: number,
    team1: Team,
    team2: Team,
    _context: SimulationContext,
  ): number {
    const seed1 = team1.seed;
    const seed2 = team2.seed;

    // Determine who is the underdog (higher seed number = worse seed = underdog)
    const seedDiff = seed1 - seed2;

    if (seedDiff === 0) {
      // Same seed: no Cinderella adjustment
      return baseProbability;
    }

    // Pull probability strongly toward 0.50 first (level the playing field)
    let adjusted = baseProbability * 0.4 + 0.5 * 0.6;

    if (seedDiff > 0) {
      // team1 is the underdog (higher seed number) — give team1 a boost
      const underdogBonus = seedDiff * 0.025;
      adjusted += underdogBonus;
    } else {
      // team2 is the underdog (higher seed number) — penalize team1 (the favorite)
      const underdogBonus = Math.abs(seedDiff) * 0.025;
      adjusted -= underdogBonus;
    }

    return Math.max(0.02, Math.min(0.98, adjusted));
  }
}

registerMode('cinderella', () => new CinderellaMode());
