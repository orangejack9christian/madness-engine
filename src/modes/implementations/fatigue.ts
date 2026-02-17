import { Team } from '../../core/types';
import { BaseSimulationMode, DEFAULT_WEIGHTS, DEFAULT_VARIANCE } from '../base-mode';
import { MetricWeights, VarianceConfig, SimulationContext } from '../types';
import { registerMode } from '../registry';

class FatigueMode extends BaseSimulationMode {
  readonly id = 'fatigue';
  readonly name = 'Fatigue Factor';
  readonly description =
    'Models tournament fatigue and bench depth. Teams with thin rotations fade in later rounds. Deep benches and experienced rosters gain a compounding edge.';
  readonly category = 'hybrid' as const;
  readonly confidenceTag = 'experimental' as const;

  getMetricWeights(): MetricWeights {
    return {
      ...DEFAULT_WEIGHTS,
      benchMinutesPct: 1.5,
      experienceRating: 1.0,
    };
  }

  getVarianceConfig(): VarianceConfig {
    return {
      ...DEFAULT_VARIANCE,
      baseVariance: 0.12,
      // Fatigue makes later rounds more unpredictable for shallow teams
      roundVarianceMultipliers: {
        'round-of-64': 1.0,
        'round-of-32': 1.05,
        'sweet-sixteen': 1.10,
        'elite-eight': 1.18,
        'final-four': 1.25,
        'championship': 1.30,
      },
    };
  }

  adjustProbability(
    baseProbability: number,
    team1: Team,
    team2: Team,
    context: SimulationContext,
  ): number {
    const fatigue1 = computeFatiguePenalty(team1, context.gamesPlayedByTeam1);
    const fatigue2 = computeFatiguePenalty(team2, context.gamesPlayedByTeam2);

    const depthBonus1 = computeDepthBonus(team1);
    const depthBonus2 = computeDepthBonus(team2);

    // Net advantage for team1: positive means team1 is fresher / deeper
    const netAdvantage = (fatigue2 - fatigue1) + (depthBonus1 - depthBonus2);

    // Scale the adjustment — each unit of net advantage is worth ~2%
    const adjustment = netAdvantage * 0.02;

    return Math.max(0.02, Math.min(0.98, baseProbability + adjustment));
  }
}

/**
 * Compute a fatigue penalty for a team based on games played and bench depth.
 * Teams with low bench minutes accumulate fatigue faster.
 * Returns a positive number where higher = more fatigued.
 */
function computeFatiguePenalty(team: Team, gamesPlayed: number): number {
  const benchPct = team.metrics.benchMinutesPct;

  // Fatigue accumulates with each game, scaled inversely by bench depth.
  // A team with benchMinutesPct of 0.20 (shallow) gets hit harder than one at 0.40 (deep).
  const fatigue = gamesPlayed * (1 - benchPct) * 0.03;

  // Experience mitigates fatigue slightly (veteran teams handle the grind)
  const experienceMitigation = Math.min(0.02, team.metrics.experienceRating * 0.005);

  return Math.max(0, fatigue - experienceMitigation);
}

/**
 * Compute a bonus for deep teams (benchMinutesPct > 0.35).
 * Returns a small positive value for deep benches, 0 otherwise.
 */
function computeDepthBonus(team: Team): number {
  const benchPct = team.metrics.benchMinutesPct;

  if (benchPct > 0.35) {
    // Deep bench bonus: up to ~1.5 for very deep teams
    return (benchPct - 0.35) * 10;
  }

  return 0;
}

registerMode('fatigue', () => new FatigueMode());
