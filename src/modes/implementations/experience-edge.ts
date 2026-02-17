import { Team } from '../../core/types';
import { BaseSimulationMode, DEFAULT_WEIGHTS, DEFAULT_VARIANCE } from '../base-mode';
import { MetricWeights, VarianceConfig, SimulationContext } from '../types';
import { registerMode } from '../registry';

class ExperienceEdgeMode extends BaseSimulationMode {
  readonly id = 'experience-edge';
  readonly name = 'Experience Edge';
  readonly description =
    'Upperclassmen and veteran rosters thrive in March pressure. Experience rating, combined with free throw shooting (clutch indicator) and coaching experience, predicts tournament survival.';
  readonly category = 'hybrid' as const;
  readonly confidenceTag = 'experimental' as const;

  getMetricWeights(): MetricWeights {
    return {
      ...DEFAULT_WEIGHTS,
      // Veteran rosters are the centerpiece
      experienceRating: 2.5,
      // Free throw shooting as a clutch proxy
      freeThrowPct: 1.5,
      freeThrowRate: 1.0,
      // Reduce raw efficiency metrics — experience transcends talent
      adjOffensiveEfficiency: 0.6,
      adjDefensiveEfficiency: 0.6,
    };
  }

  getVarianceConfig(): VarianceConfig {
    return {
      ...DEFAULT_VARIANCE,
      baseVariance: 0.10,
      // Experience matters more in later rounds — lower variance for veteran teams
      roundVarianceMultipliers: {
        'round-of-64': 1.0,
        'round-of-32': 0.95,
        'sweet-sixteen': 0.88,
        'elite-eight': 0.80,
        'final-four': 0.72,
        'championship': 0.65,
      },
    };
  }

  adjustProbability(
    baseProbability: number,
    team1: Team,
    team2: Team,
    context: SimulationContext,
  ): number {
    const score1 = computeExperienceScore(team1);
    const score2 = computeExperienceScore(team2);

    // Differential scaled to a probability adjustment (±8% swing max)
    const diff = score1 - score2;
    const maxDiff = 80; // approximate max range of combined scores
    const rawAdjustment = (diff / maxDiff) * 0.08;

    // Bigger impact in later rounds — experience matters most under pressure
    const roundMultiplier = getExperienceRoundMultiplier(context.round);
    const adjustment = rawAdjustment * roundMultiplier;

    return Math.max(0.02, Math.min(0.98, baseProbability + adjustment));
  }
}

/**
 * Compute a combined experience score blending player experience,
 * coaching tournament experience, and free throw shooting as a clutch proxy.
 */
function computeExperienceScore(team: Team): number {
  const m = team.metrics;

  // Player experience: experienceRating typically 0-2, scale up
  const playerExp = m.experienceRating * 20;

  // Coaching experience: cap at 20 years to avoid runaway values
  const coachYears = team.coaching?.yearsExperience ?? 5;
  const coachExp = Math.min(coachYears, 20) * 1.5;

  // Clutch factor: free throw percentage as proxy (typically 0.65-0.80)
  const clutchFactor = m.freeThrowPct * 50;

  return playerExp + coachExp + clutchFactor;
}

function getExperienceRoundMultiplier(round: string): number {
  const multipliers: Record<string, number> = {
    'round-of-64': 0.7,
    'round-of-32': 0.85,
    'sweet-sixteen': 1.0,
    'elite-eight': 1.2,
    'final-four': 1.4,
    'championship': 1.6,
  };
  return multipliers[round] ?? 1.0;
}

registerMode('experience-edge', () => new ExperienceEdgeMode());
