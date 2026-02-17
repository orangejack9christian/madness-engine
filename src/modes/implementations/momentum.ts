import { Team } from '../../core/types';
import { BaseSimulationMode, DEFAULT_WEIGHTS, DEFAULT_VARIANCE } from '../base-mode';
import { MetricWeights, VarianceConfig, SimulationContext } from '../types';
import { registerMode } from '../registry';

class MomentumMode extends BaseSimulationMode {
  readonly id = 'momentum';
  readonly name = 'Hot Streak';
  readonly description = 'Heavily weights recent form: last 10 games, win streaks, and conference tournament performance. Hot teams get boosted; cold teams get penalized.';
  readonly category = 'hybrid' as const;
  readonly confidenceTag = 'experimental' as const;

  getMetricWeights(): MetricWeights {
    return {
      ...DEFAULT_WEIGHTS,
      // Reduce season-long metrics
      adjOffensiveEfficiency: 0.5,
      adjDefensiveEfficiency: 0.5,
      strengthOfSchedule: 0.3,
      // Massively boost momentum
      momentumScore: 2.0,
      experienceRating: 0.4,
    };
  }

  getVarianceConfig(): VarianceConfig {
    return {
      ...DEFAULT_VARIANCE,
      baseVariance: 0.13,
      upsetMultiplier: 1.2,
    };
  }

  adjustProbability(
    baseProbability: number,
    team1: Team,
    team2: Team,
    _context: SimulationContext,
  ): number {
    const momentum1 = computeDetailedMomentum(team1);
    const momentum2 = computeDetailedMomentum(team2);

    // Momentum differential: up to ±12% swing
    const diff = (momentum1 - momentum2) / 100;
    const adjustment = diff * 0.12;

    return Math.max(0.03, Math.min(0.97, baseProbability + adjustment));
  }
}

/**
 * Detailed momentum calculation:
 * - Last 10 record (weighted heavily)
 * - Win streak (exponential bonus)
 * - Season win percentage (baseline)
 * - Trend: are they improving or declining?
 */
function computeDetailedMomentum(team: Team): number {
  const m = team.metrics;

  // Last 10 win pct (0-100 scale)
  const last10Pct = (m.last10Wins / (m.last10Wins + m.last10Losses || 1)) * 100;

  // Win streak bonus: exponential (0, 3, 8, 15, 24, 35, ...)
  const streakBonus = Math.min(35, m.winStreak * m.winStreak * 1.5);

  // Season win pct as baseline stability measure
  const seasonPct = (m.wins / (m.wins + m.losses || 1)) * 100;

  // Conference performance (competitive games matter more)
  const confPct = (m.conferenceWins / (m.conferenceWins + m.conferenceLosses || 1)) * 100;

  // Blend: recent form dominates
  return last10Pct * 0.40 + streakBonus * 0.25 + confPct * 0.20 + seasonPct * 0.15;
}

registerMode('momentum', () => new MomentumMode());
