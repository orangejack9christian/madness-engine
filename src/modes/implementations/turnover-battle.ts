import { Team } from '../../core/types';
import { BaseSimulationMode, DEFAULT_WEIGHTS, DEFAULT_VARIANCE } from '../base-mode';
import { MetricWeights, VarianceConfig, SimulationContext } from '../types';
import { registerMode } from '../registry';

class TurnoverBattleMode extends BaseSimulationMode {
  readonly id = 'turnover-battle';
  readonly name = 'Turnover Battle';
  readonly description =
    'Ball security is job security. Teams that protect the ball and force turnovers control tournament games. Turnover margin is the strongest single predictor of March Madness success.';
  readonly category = 'research' as const;
  readonly confidenceTag = 'statistically-validated' as const;

  getMetricWeights(): MetricWeights {
    return {
      ...DEFAULT_WEIGHTS,
      // Massively boost turnover-related metrics
      turnoverPct: 2.5,
      stealPct: 2.0,
      // Ball-handling teams also tend to have better assist play
      adjOffensiveEfficiency: 0.8,
      adjDefensiveEfficiency: 0.8,
      // Reduce shooting-only metrics — turnovers matter more than shooting
      effectiveFGPct: 0.4,
      threePointRate: 0.2,
      threePointPct: 0.3,
    };
  }

  getVarianceConfig(): VarianceConfig {
    return {
      ...DEFAULT_VARIANCE,
      baseVariance: 0.10,
      // Teams that protect the ball are more reliable — lower variance in later rounds
      roundVarianceMultipliers: {
        'round-of-64': 1.0,
        'round-of-32': 0.95,
        'sweet-sixteen': 0.90,
        'elite-eight': 0.85,
        'final-four': 0.80,
        'championship': 0.75,
      },
    };
  }

  adjustProbability(
    baseProbability: number,
    team1: Team,
    team2: Team,
    _context: SimulationContext,
  ): number {
    const edge1 = computeTurnoverEdge(team1, team2);

    // Scale the edge to a probability adjustment (±10% swing max)
    // The raw edge is roughly in the range [-20, 20], so divide by 200 for ±10%
    const adjustment = clamp(edge1 / 200, -0.10, 0.10);

    return Math.max(0.02, Math.min(0.98, baseProbability + adjustment));
  }
}

/**
 * Compute the turnover edge for team1 over team2.
 * Positive = team1 has the advantage (lower own TO%, higher steal%).
 *
 * turnoverPct: team's own turnover rate (lower is better for the team).
 * stealPct: team's steal rate (higher is better — forces opponent turnovers).
 */
function computeTurnoverEdge(team1: Team, team2: Team): number {
  // Team2's higher turnover rate benefits team1, and vice versa
  const toAdvantage =
    (team2.metrics.turnoverPct - team1.metrics.turnoverPct) * 100;

  // Team1's higher steal rate means they force more turnovers
  const stealAdvantage =
    (team1.metrics.stealPct - team2.metrics.stealPct) * 100;

  return toAdvantage + stealAdvantage;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

registerMode('turnover-battle', () => new TurnoverBattleMode());
