import { Team } from '../../core/types';
import { BaseSimulationMode, DEFAULT_WEIGHTS, DEFAULT_VARIANCE } from '../base-mode';
import { MetricWeights, VarianceConfig, SimulationContext, RequiredDataSource } from '../types';
import { registerMode } from '../registry';

class CoachingMode extends BaseSimulationMode {
  readonly id = 'coaching';
  readonly name = 'Coaching Intelligence';
  readonly description = 'Weights coach tournament experience, historical performance vs seed expectations, and late-game management. Experienced coaches with deep tournament runs get a significant edge.';
  readonly category = 'hybrid' as const;
  readonly confidenceTag = 'experimental' as const;

  getMetricWeights(): MetricWeights {
    return {
      ...DEFAULT_WEIGHTS,
      // Reduce raw talent metrics
      adjOffensiveEfficiency: 0.6,
      adjDefensiveEfficiency: 0.6,
      // Boost experience and discipline
      experienceRating: 0.8,
      turnoverPct: 0.7,
      freeThrowPct: 0.6,
    };
  }

  getVarianceConfig(): VarianceConfig {
    return {
      ...DEFAULT_VARIANCE,
      baseVariance: 0.10,
      // Later rounds favor coached teams more
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

  getRequiredData(): RequiredDataSource[] {
    return ['coaching-ratings'];
  }

  adjustProbability(
    baseProbability: number,
    team1: Team,
    team2: Team,
    context: SimulationContext,
  ): number {
    const coach1Score = computeCoachScore(team1, context);
    const coach2Score = computeCoachScore(team2, context);

    // Coach advantage: up to ±10% swing
    const diff = (coach1Score - coach2Score) / 100;
    const coachWeight = getCoachWeightForRound(context.round);

    return Math.max(0.02, Math.min(0.98, baseProbability + diff * coachWeight));
  }
}

function computeCoachScore(team: Team, context: SimulationContext): number {
  if (!team.coaching) {
    // No coaching data: neutral score based on seed (lower seed = slight coaching benefit)
    return 50 - team.seed * 1.5;
  }

  const c = team.coaching;

  // Tournament win rate
  const totalGames = c.tournamentWins + c.tournamentLosses;
  const winRate = totalGames > 0 ? c.tournamentWins / totalGames : 0.5;

  // Experience score (diminishing returns)
  const expScore = Math.min(20, c.yearsExperience * 1.2);

  // Deep run bonus
  const deepRunScore = c.finalFourAppearances * 5 + c.championships * 10;

  // Seed overperformance (how much better than seed would predict)
  const overperformScore = c.seedOverperformance * 8;

  return winRate * 40 + expScore + deepRunScore + overperformScore;
}

function getCoachWeightForRound(round: string): number {
  // Coaching matters more in later rounds
  const weights: Record<string, number> = {
    'round-of-64': 0.06,
    'round-of-32': 0.08,
    'sweet-sixteen': 0.10,
    'elite-eight': 0.12,
    'final-four': 0.14,
    'championship': 0.16,
  };
  return weights[round] ?? 0.08;
}

registerMode('coaching', () => new CoachingMode());
