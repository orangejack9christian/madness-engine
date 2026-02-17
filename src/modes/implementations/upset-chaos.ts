import { Team } from '../../core/types';
import { BaseSimulationMode, DEFAULT_WEIGHTS } from '../base-mode';
import { MetricWeights, VarianceConfig, SimulationContext } from '../types';
import { registerMode } from '../registry';

class UpsetChaosMode extends BaseSimulationMode {
  readonly id = 'upset-chaos';
  readonly name = 'Upset Chaos';
  readonly description = 'Dramatically amplifies randomness and upset probability. Lower seeds get significant boosts. March Madness at its wildest.';
  readonly category = 'entertainment' as const;
  readonly confidenceTag = 'experimental' as const;

  getMetricWeights(): MetricWeights {
    return {
      ...DEFAULT_WEIGHTS,
      adjOffensiveEfficiency: 0.4,
      adjDefensiveEfficiency: 0.4,
      strengthOfSchedule: 0.2,
      experienceRating: 0.1,
      momentumScore: 0.5,
    };
  }

  getVarianceConfig(): VarianceConfig {
    return {
      baseVariance: 0.22,
      upsetMultiplier: 2.5,
      liveStateWeight: 0.7,
      seedGapSensitivity: 0.3,
      roundVarianceMultipliers: {
        'round-of-64': 1.5,
        'round-of-32': 1.3,
        'sweet-sixteen': 1.1,
        'elite-eight': 1.0,
        'final-four': 0.9,
        'championship': 0.8,
      },
    };
  }

  adjustProbability(
    baseProbability: number,
    team1: Team,
    team2: Team,
    _context: SimulationContext,
  ): number {
    // Pull probabilities toward 50/50
    const chaosAdjusted = baseProbability * 0.55 + 0.5 * 0.45;

    // Boost for underdogs (higher seed number)
    const seedDiff = team1.seed - team2.seed;
    const seedBoost = seedDiff * 0.012;

    return Math.max(0.05, Math.min(0.95, chaosAdjusted + seedBoost));
  }
}

registerMode('upset-chaos', () => new UpsetChaosMode());
