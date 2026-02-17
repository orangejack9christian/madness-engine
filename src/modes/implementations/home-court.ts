import { Team } from '../../core/types';
import { BaseSimulationMode, DEFAULT_WEIGHTS, DEFAULT_VARIANCE } from '../base-mode';
import { MetricWeights, VarianceConfig, SimulationContext } from '../types';
import { registerMode } from '../registry';

class HomeCourtMode extends BaseSimulationMode {
  readonly id = 'home-court';
  readonly name = 'Regional Advantage';
  readonly description =
    'Geography matters. Teams playing closer to home benefit from crowd support and travel fatigue advantages. Regional site proximity gives a measurable edge in March.';
  readonly category = 'hybrid' as const;
  readonly confidenceTag = 'experimental' as const;

  getMetricWeights(): MetricWeights {
    return {
      ...DEFAULT_WEIGHTS,
    };
  }

  getVarianceConfig(): VarianceConfig {
    return {
      ...DEFAULT_VARIANCE,
      // Slight variance boost — crowd energy adds unpredictability
      baseVariance: 0.12,
      roundVarianceMultipliers: {
        'round-of-64': 1.05,
        'round-of-32': 1.05,
        'sweet-sixteen': 1.0,
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
    const bump1 = computeRegionalBump(team1, context);
    const bump2 = computeRegionalBump(team2, context);

    // Net advantage for team1
    const adjustment = bump1 - bump2;

    return Math.max(0.02, Math.min(0.98, baseProbability + adjustment));
  }
}

/**
 * Compute the regional advantage bump for a team.
 * If the team's region matches the game region, they get a home-court edge.
 * Lower seeds (underdogs) benefit more from home crowd support.
 * In the Final Four / Championship (neutral site), no region advantage applies.
 */
function computeRegionalBump(
  team: Team,
  context: SimulationContext,
): number {
  // Final Four and Championship are at a neutral site — no regional advantage
  if (
    context.region === 'final-four' ||
    context.round === 'final-four' ||
    context.round === 'championship'
  ) {
    return 0;
  }

  // Check if the team's region matches the game's region
  if (team.region !== context.region) {
    return 0;
  }

  // Team is playing in their home region
  if (team.seed <= 4) {
    // Higher seeds (1-4) in their own region get a smaller bump.
    // They're expected to win anyway — the crowd helps but doesn't swing as much.
    return 0.03;
  }

  // Lower seeds (5-16) in their home region get a bigger bump.
  // Crowd support can be the difference for an underdog.
  return 0.05;
}

registerMode('home-court', () => new HomeCourtMode());
