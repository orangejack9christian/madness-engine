import { Team } from '../../core/types';
import { BaseSimulationMode, DEFAULT_WEIGHTS, DEFAULT_VARIANCE } from '../base-mode';
import { MetricWeights, VarianceConfig, SimulationContext } from '../types';
import { registerMode } from '../registry';

class SizeMattersMode extends BaseSimulationMode {
  readonly id = 'size-matters';
  readonly name = 'Size Matters';
  readonly description =
    'Tall teams control the paint, dominate rebounding, and alter shots. Average height, offensive/defensive rebounding rates drive predictions. March Madness has historically rewarded big lineups.';
  readonly category = 'hybrid' as const;
  readonly confidenceTag = 'experimental' as const;

  getMetricWeights(): MetricWeights {
    return {
      ...DEFAULT_WEIGHTS,
      // Massively boost rebounding metrics
      offensiveReboundPct: 2.0,
      defensiveReboundPct: 2.0,
      // Reduce perimeter-oriented metrics
      threePointRate: 0.15,
      threePointPct: 0.25,
      // Slightly reduce tempo (big teams play slower, grind-it-out style)
      adjTempo: 0.15,
    };
  }

  getVarianceConfig(): VarianceConfig {
    return {
      ...DEFAULT_VARIANCE,
      baseVariance: 0.10,
      // Size advantage is consistent — lower variance in later rounds
      roundVarianceMultipliers: {
        'round-of-64': 1.0,
        'round-of-32': 0.95,
        'sweet-sixteen': 0.90,
        'elite-eight': 0.85,
        'final-four': 0.82,
        'championship': 0.80,
      },
    };
  }

  adjustProbability(
    baseProbability: number,
    team1: Team,
    team2: Team,
    _context: SimulationContext,
  ): number {
    // Height differential in inches
    const heightDiff = team1.metrics.averageHeight - team2.metrics.averageHeight;

    // Each inch of height advantage is worth ~2% probability swing
    const heightAdjustment = heightDiff * 0.02;

    // Rebounding differential
    const reboundDiff = computeReboundingAdvantage(team1, team2);

    // Rebounding advantage: each point of differential is worth ~1%
    const reboundAdjustment = reboundDiff * 0.01;

    const totalAdjustment = heightAdjustment + reboundAdjustment;

    return Math.max(0.02, Math.min(0.98, baseProbability + totalAdjustment));
  }
}

/**
 * Compute the rebounding advantage of team1 over team2.
 * Combines both offensive and defensive rebounding rates.
 * Returns positive if team1 has the advantage.
 */
function computeReboundingAdvantage(team1: Team, team2: Team): number {
  const oreb1 = team1.metrics.offensiveReboundPct;
  const oreb2 = team2.metrics.offensiveReboundPct;
  const dreb1 = team1.metrics.defensiveReboundPct;
  const dreb2 = team2.metrics.defensiveReboundPct;

  // Offensive rebounding advantage
  const orebDiff = oreb1 - oreb2;

  // Defensive rebounding advantage
  const drebDiff = dreb1 - dreb2;

  // Weight both equally — controlling the boards on both ends matters
  return orebDiff + drebDiff;
}

registerMode('size-matters', () => new SizeMattersMode());
