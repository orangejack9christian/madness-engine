import { Team } from '../../core/types';
import { BaseSimulationMode, DEFAULT_WEIGHTS, DEFAULT_VARIANCE } from '../base-mode';
import { MetricWeights, VarianceConfig, SimulationContext } from '../types';
import { registerMode } from '../registry';

class BalancedAttackMode extends BaseSimulationMode {
  readonly id = 'balanced-attack';
  readonly name = 'Balanced Attack';
  readonly description =
    'Teams that excel in all Four Factors — shooting, turnovers, rebounding, and free throws — are the most complete. No single weakness to exploit. Balance wins tournaments.';
  readonly category = 'research' as const;
  readonly confidenceTag = 'statistically-validated' as const;

  getMetricWeights(): MetricWeights {
    return {
      ...DEFAULT_WEIGHTS,
      // Weight all Four Factors equally and highly
      effectiveFGPct: 1.5,
      turnoverPct: 1.5,
      offensiveReboundPct: 1.5,
      freeThrowRate: 1.5,
      // Support metrics at moderate weight
      adjOffensiveEfficiency: 0.8,
      adjDefensiveEfficiency: 0.8,
      defensiveReboundPct: 1.0,
    };
  }

  getVarianceConfig(): VarianceConfig {
    return {
      ...DEFAULT_VARIANCE,
      baseVariance: 0.10,
      // Balanced teams are consistent — lower variance in later rounds
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
    const balance1 = computeBalanceScore(team1);
    const balance2 = computeBalanceScore(team2);

    // Differential scaled to ±6% swing
    const diff = balance1 - balance2;
    const maxDiff = 50; // approximate max range of balance scores
    const adjustment = (diff / maxDiff) * 0.06;

    return Math.max(0.02, Math.min(0.98, baseProbability + adjustment));
  }
}

/**
 * Compute a balance score based on Dean Oliver's Four Factors.
 * The weakest link determines the team's strength — a team with one
 * glaring weakness is penalized even if the other factors are elite.
 *
 * Factors are normalized to roughly 0-100 scale using typical D1 ranges:
 *   - eFG%: ~0.44 to 0.58 -> 0 to 100
 *   - TO%: ~0.12 to 0.24 -> 0 to 100 (inverted — lower is better)
 *   - OR%: ~0.22 to 0.38 -> 0 to 100
 *   - FTRate: ~0.20 to 0.45 -> 0 to 100
 */
function computeBalanceScore(team: Team): number {
  const m = team.metrics;

  // Normalize each factor to a 0-100 scale
  const shootingScore = normalizeMetric(m.effectiveFGPct, 0.44, 0.58);
  const turnoverScore = normalizeMetric(1 - m.turnoverPct, 1 - 0.24, 1 - 0.12); // invert: lower TO% is better
  const reboundScore = normalizeMetric(m.offensiveReboundPct, 0.22, 0.38);
  const freeThrowScore = normalizeMetric(m.freeThrowRate, 0.20, 0.45);

  const factors = [shootingScore, turnoverScore, reboundScore, freeThrowScore];

  // Weakest link: the minimum factor determines the floor
  const weakestLink = Math.min(...factors);

  // Average of all factors
  const average = factors.reduce((sum, f) => sum + f, 0) / factors.length;

  // Balance score: blend of weakest link (60%) and average (40%)
  // This rewards teams with no glaring weakness over lopsided teams
  const balanceScore = weakestLink * 0.6 + average * 0.4;

  // Bonus for truly balanced teams (all factors above 50th percentile)
  const allAboveMedian = factors.every(f => f >= 50);
  const balanceBonus = allAboveMedian ? 8 : 0;

  // Penalty for lopsided teams (any factor below 25th percentile)
  const hasWeakness = factors.some(f => f < 25);
  const weaknessPenalty = hasWeakness ? -10 : 0;

  return balanceScore + balanceBonus + weaknessPenalty;
}

/**
 * Normalize a value to a 0-100 scale given expected min/max range.
 * Values outside the range are clamped.
 */
function normalizeMetric(value: number, min: number, max: number): number {
  if (max === min) return 50;
  const normalized = ((value - min) / (max - min)) * 100;
  return Math.max(0, Math.min(100, normalized));
}

registerMode('balanced-attack', () => new BalancedAttackMode());
