import { Team } from '../../core/types';
import { BaseSimulationMode, DEFAULT_WEIGHTS, DEFAULT_VARIANCE } from '../base-mode';
import { MetricWeights, VarianceConfig, SimulationContext } from '../types';
import { registerMode } from '../registry';

class ChaosLadderMode extends BaseSimulationMode {
  readonly id = 'chaos-ladder';
  readonly name = 'Chaos Ladder';
  readonly description =
    'Maximum entropy. Every round gets progressively more chaotic. Round of 64 is normal, but by the Final Four anything can happen. The bracket from hell.';
  readonly category = 'entertainment' as const;
  readonly confidenceTag = 'whimsical' as const;

  getMetricWeights(): MetricWeights {
    return {
      ...DEFAULT_WEIGHTS,
      // Slightly devalue all metrics — chaos doesn't care about your stats
      adjOffensiveEfficiency: 0.7,
      adjDefensiveEfficiency: 0.7,
      strengthOfSchedule: 0.3,
      experienceRating: 0.2,
    };
  }

  getVarianceConfig(): VarianceConfig {
    return {
      ...DEFAULT_VARIANCE,
      baseVariance: 0.14,
      upsetMultiplier: 1.5,
      seedGapSensitivity: 0.5,
      // Variance escalates dramatically per round
      roundVarianceMultipliers: {
        'round-of-64': 1.1,
        'round-of-32': 1.4,
        'sweet-sixteen': 1.8,
        'elite-eight': 2.3,
        'final-four': 3.0,
        'championship': 4.0,
      },
    };
  }

  adjustProbability(
    baseProbability: number,
    _team1: Team,
    _team2: Team,
    context: SimulationContext,
  ): number {
    const chaosFactor = getChaosFactorForRound(context.round);

    // Pull probability toward 0.5 (coin flip) proportional to the chaos factor
    // At chaosFactor=0, result = baseProbability (no change)
    // At chaosFactor=1, result = 0.5 (pure coin flip)
    const adjusted = baseProbability * (1 - chaosFactor) + 0.5 * chaosFactor;

    return Math.max(0.02, Math.min(0.98, adjusted));
  }
}

/**
 * Escalating chaos factors by round.
 * Early rounds are nearly normal; later rounds approach a coin flip.
 */
function getChaosFactorForRound(round: string): number {
  const chaosFactors: Record<string, number> = {
    'first-four': 0.05,
    'round-of-64': 0.10,
    'round-of-32': 0.20,
    'sweet-sixteen': 0.35,
    'elite-eight': 0.50,
    'final-four': 0.70,
    'championship': 0.85,
  };
  return chaosFactors[round] ?? 0.10;
}

registerMode('chaos-ladder', () => new ChaosLadderMode());
