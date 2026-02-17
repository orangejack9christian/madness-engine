import { Team } from '../../core/types';
import { BaseSimulationMode, DEFAULT_WEIGHTS, DEFAULT_VARIANCE } from '../base-mode';
import { MetricWeights, VarianceConfig, SimulationContext } from '../types';
import { registerMode } from '../registry';

class RivalryRevengeMode extends BaseSimulationMode {
  readonly id = 'rivalry-revenge';
  readonly name = 'Rivalry & Revenge';
  readonly description =
    'Same-conference matchups become blood feuds. Teams from the same conference get extra intensity and unpredictability. Conference tournament momentum carries over.';
  readonly category = 'entertainment' as const;
  readonly confidenceTag = 'whimsical' as const;

  getMetricWeights(): MetricWeights {
    return {
      ...DEFAULT_WEIGHTS,
      // Slightly boost momentum and experience for rivalry games
      momentumScore: 0.4,
      experienceRating: 0.5,
    };
  }

  getVarianceConfig(): VarianceConfig {
    return {
      ...DEFAULT_VARIANCE,
      baseVariance: 0.14,
      upsetMultiplier: 1.2,
    };
  }

  adjustProbability(
    baseProbability: number,
    team1: Team,
    team2: Team,
    _context: SimulationContext,
  ): number {
    const sameConference = team1.conference === team2.conference;

    if (sameConference) {
      // Rivalry game: pull probability toward 0.50 (rivalry = unpredictable)
      // This adds conceptual variance by making the outcome more of a coin flip
      let adjusted = baseProbability * 0.55 + 0.50 * 0.45;

      // Conference tournament champion bonus:
      // Team with higher conference win rate gets an edge (they "own" the conference)
      const confWinRate1 = getConferenceWinRate(team1);
      const confWinRate2 = getConferenceWinRate(team2);
      const confDiff = (confWinRate1 - confWinRate2) * 0.06;
      adjusted += confDiff;

      return Math.max(0.02, Math.min(0.98, adjusted));
    }

    // Non-conference matchup: still check for conference momentum
    // Teams with dominant conference records get a slight edge
    const momentum1 = getConferenceMomentum(team1);
    const momentum2 = getConferenceMomentum(team2);
    const momentumDiff = (momentum1 - momentum2) * 0.02;

    return Math.max(0.02, Math.min(0.98, baseProbability + momentumDiff));
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

/**
 * Compute conference momentum based on conference win rate and recent form.
 * Teams that dominated their conference and have a hot streak carry momentum.
 * Returns a score roughly in the range 0-2.
 */
function getConferenceMomentum(team: Team): number {
  const confWinRate = getConferenceWinRate(team);

  // Recent form bonus: last 10 games performance
  const last10Total = team.metrics.last10Wins + team.metrics.last10Losses;
  const recentWinRate = last10Total > 0 ? team.metrics.last10Wins / last10Total : 0.5;

  // Win streak bonus (capped)
  const streakBonus = Math.min(0.3, team.metrics.winStreak * 0.04);

  return confWinRate + recentWinRate * 0.5 + streakBonus;
}

registerMode('rivalry-revenge', () => new RivalryRevengeMode());
