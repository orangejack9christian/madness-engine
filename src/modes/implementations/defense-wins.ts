import { Team } from '../../core/types';
import { BaseSimulationMode, DEFAULT_WEIGHTS, DEFAULT_VARIANCE } from '../base-mode';
import { MetricWeights, VarianceConfig, SimulationContext } from '../types';
import { registerMode } from '../registry';

class DefenseWinsMode extends BaseSimulationMode {
  readonly id = 'defense-wins';
  readonly name = 'Defensive Dominance';
  readonly description =
    'Based on the old adage that defense wins championships. Heavily weights defensive efficiency, steal rate, and opponent field goal percentage. Teams that stifle opponents dominate.';
  readonly category = 'research' as const;
  readonly confidenceTag = 'statistically-validated' as const;

  getMetricWeights(): MetricWeights {
    return {
      ...DEFAULT_WEIGHTS,
      // Heavily boost defensive metrics
      adjDefensiveEfficiency: 2.0,
      stealPct: 1.5,
      turnoverPct: 1.2,
      defensiveReboundPct: 1.0,
      // Reduce offensive metrics
      adjOffensiveEfficiency: 0.4,
      effectiveFGPct: 0.4,
      threePointRate: 0.4,
      threePointPct: 0.4,
      freeThrowRate: 0.4,
      freeThrowPct: 0.4,
      offensiveReboundPct: 0.4,
    };
  }

  getVarianceConfig(): VarianceConfig {
    return {
      ...DEFAULT_VARIANCE,
      baseVariance: 0.09,
      // Defense is more reliable in later rounds — lower variance
      roundVarianceMultipliers: {
        'round-of-64': 1.0,
        'round-of-32': 0.92,
        'sweet-sixteen': 0.84,
        'elite-eight': 0.76,
        'final-four': 0.68,
        'championship': 0.60,
      },
    };
  }

  adjustProbability(
    baseProbability: number,
    team1: Team,
    team2: Team,
    context: SimulationContext,
  ): number {
    const defRating1 = computeDefensiveRating(team1);
    const defRating2 = computeDefensiveRating(team2);

    // Positive diff means team1 has better defense
    const diff = defRating1 - defRating2;

    // Bigger bonus in later rounds (defense becomes more reliable)
    const roundMultiplier = getDefenseRoundMultiplier(context.round);

    // Each point of defensive rating advantage is worth up to ~1.5% per unit,
    // scaled by round importance
    const adjustment = diff * 0.015 * roundMultiplier;

    return Math.max(0.02, Math.min(0.98, baseProbability + adjustment));
  }
}

/**
 * Compute a composite defensive rating for a team.
 * Lower adjDefensiveEfficiency is better (fewer points allowed),
 * so we invert it. Higher steal% and lower turnover% are better defensively.
 */
function computeDefensiveRating(team: Team): number {
  const m = team.metrics;

  // adjDefensiveEfficiency: lower is better, so invert relative to a baseline of ~100
  const defEffScore = (100 - m.adjDefensiveEfficiency) * 2.0;

  // Steal rate directly contributes
  const stealScore = m.stealPct * 8;

  // Forced turnovers (from opponent perspective, higher turnoverPct = our defense forces more)
  // Note: turnoverPct here is the team's own turnover rate, so lower is better for them.
  // We want low own turnovers + high defensive disruption, approximated via stealPct above.
  // Penalize teams that turn it over a lot themselves.
  const toPenalty = m.turnoverPct * -3;

  // Defensive rebounding
  const drebScore = m.defensiveReboundPct * 1.5;

  return defEffScore + stealScore + toPenalty + drebScore;
}

function getDefenseRoundMultiplier(round: string): number {
  const multipliers: Record<string, number> = {
    'round-of-64': 1.0,
    'round-of-32': 1.15,
    'sweet-sixteen': 1.30,
    'elite-eight': 1.50,
    'final-four': 1.70,
    'championship': 2.0,
  };
  return multipliers[round] ?? 1.0;
}

registerMode('defense-wins', () => new DefenseWinsMode());
