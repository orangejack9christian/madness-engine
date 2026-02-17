import { Team } from '../../core/types';
import { BaseSimulationMode, DEFAULT_WEIGHTS, DEFAULT_VARIANCE } from '../base-mode';
import { MetricWeights, VarianceConfig, SimulationContext } from '../types';
import { registerMode } from '../registry';

class ConferenceStrengthMode extends BaseSimulationMode {
  readonly id = 'conference-strength';
  readonly name = 'Conference Power';
  readonly description =
    'Teams from tougher conferences are battle-tested. Weights strength of schedule and conference win percentage heavily. Mid-majors get penalized; power conference teams get boosted.';
  readonly category = 'research' as const;
  readonly confidenceTag = 'experimental' as const;

  getMetricWeights(): MetricWeights {
    return {
      ...DEFAULT_WEIGHTS,
      strengthOfSchedule: 2.0,
      // Boost metrics that correlate with conference quality
      adjOffensiveEfficiency: 0.8,
      adjDefensiveEfficiency: 0.8,
      experienceRating: 0.5,
    };
  }

  getVarianceConfig(): VarianceConfig {
    return {
      ...DEFAULT_VARIANCE,
      baseVariance: 0.10,
      // Power conference teams are more consistent
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
    // Conference power tier bonuses
    const tierBonus1 = getConferenceTierBonus(team1);
    const tierBonus2 = getConferenceTierBonus(team2);

    // Conference win rate factor
    const confWinRate1 = getConferenceWinRate(team1);
    const confWinRate2 = getConferenceWinRate(team2);

    // SOS differential
    const sosDiff = team1.metrics.strengthOfSchedule - team2.metrics.strengthOfSchedule;
    const sosAdjustment = sosDiff * 0.005;

    // Conference tier differential
    const tierDiff = tierBonus1 - tierBonus2;

    // Conference win rate differential (scaled down — it's a tiebreaker)
    const confWinDiff = (confWinRate1 - confWinRate2) * 0.03;

    const totalAdjustment = sosAdjustment + tierDiff + confWinDiff;

    return Math.max(0.02, Math.min(0.98, baseProbability + totalAdjustment));
  }
}

/**
 * Assign a bonus/penalty based on strength of schedule tier.
 * Top tier (SOS > 7): power conference, battle-tested
 * Mid tier (SOS 4-7): solid but not elite schedule
 * Low tier (SOS < 4): weak schedule, mid-major penalty
 */
function getConferenceTierBonus(team: Team): number {
  const sos = team.metrics.strengthOfSchedule;

  if (sos > 7) {
    return 0.04; // +4% bonus
  } else if (sos >= 4) {
    return 0; // neutral
  } else {
    return -0.04; // -4% penalty
  }
}

/**
 * Compute the conference win rate for a team.
 * Returns a value between 0 and 1.
 */
function getConferenceWinRate(team: Team): number {
  const totalConfGames = team.metrics.conferenceWins + team.metrics.conferenceLosses;
  if (totalConfGames === 0) {
    return 0.5;
  }
  return team.metrics.conferenceWins / totalConfGames;
}

registerMode('conference-strength', () => new ConferenceStrengthMode());
