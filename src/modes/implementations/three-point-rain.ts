import { Team } from '../../core/types';
import { BaseSimulationMode, DEFAULT_WEIGHTS, DEFAULT_VARIANCE } from '../base-mode';
import { MetricWeights, VarianceConfig, SimulationContext } from '../types';
import { registerMode } from '../registry';

class ThreePointRainMode extends BaseSimulationMode {
  readonly id = 'three-point-rain';
  readonly name = 'Three-Point Rain';
  readonly description =
    'Lives and dies by the three. Teams that shoot high volume and high percentage from beyond the arc get massive boosts. But high variance — threes are streaky.';
  readonly category = 'hybrid' as const;
  readonly confidenceTag = 'experimental' as const;

  getMetricWeights(): MetricWeights {
    return {
      ...DEFAULT_WEIGHTS,
      threePointRate: 2.5,
      threePointPct: 2.5,
      // Slightly reduce non-three metrics
      adjOffensiveEfficiency: 0.6,
      adjDefensiveEfficiency: 0.7,
      freeThrowRate: 0.15,
      freeThrowPct: 0.2,
      offensiveReboundPct: 0.2,
    };
  }

  getVarianceConfig(): VarianceConfig {
    return {
      ...DEFAULT_VARIANCE,
      // Three-point shooting is volatile — high base variance across all rounds
      baseVariance: 0.20,
      upsetMultiplier: 1.3,
      roundVarianceMultipliers: {
        'round-of-64': 1.0,
        'round-of-32': 1.0,
        'sweet-sixteen': 1.05,
        'elite-eight': 1.05,
        'final-four': 1.10,
        'championship': 1.10,
      },
    };
  }

  adjustProbability(
    baseProbability: number,
    team1: Team,
    team2: Team,
    _context: SimulationContext,
  ): number {
    const power1 = computeThreePointPower(team1);
    const power2 = computeThreePointPower(team2);

    // Differential in three-point power
    const diff = power1 - power2;

    // Scale: cap the swing at +-15%
    const maxSwing = 0.15;
    const adjustment = Math.max(-maxSwing, Math.min(maxSwing, diff * 0.008));

    return Math.max(0.02, Math.min(0.98, baseProbability + adjustment));
  }
}

/**
 * Compute a three-point power score for a team.
 * Combines volume (threePointRate) and accuracy (threePointPct).
 * Both are typically decimals (e.g., 0.38 for 38% three-point rate).
 * Multiplying and scaling by 100 gives a composite score.
 */
function computeThreePointPower(team: Team): number {
  const rate = team.metrics.threePointRate;
  const pct = team.metrics.threePointPct;

  // Power = volume * accuracy * 100
  // A team shooting 40% of their shots from three at 38% accuracy:
  //   0.40 * 0.38 * 100 = 15.2
  // A team shooting 25% of shots from three at 32%:
  //   0.25 * 0.32 * 100 = 8.0
  return pct * rate * 100;
}

registerMode('three-point-rain', () => new ThreePointRainMode());
