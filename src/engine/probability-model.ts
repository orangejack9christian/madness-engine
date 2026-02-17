import { Team, TeamMetrics, LiveGameState } from '../core/types';
import { GAME_LENGTH_SECONDS } from '../core/constants';
import { MetricWeights, VarianceConfig, SimulationContext } from '../modes/types';

/**
 * Compute the momentum score from recent performance metrics.
 * Returns a normalized value where positive = hot, negative = cold.
 */
export function computeMomentumScore(metrics: TeamMetrics): number {
  const last10WinPct = metrics.last10Wins / (metrics.last10Wins + metrics.last10Losses || 1);
  const streakBonus = Math.min(metrics.winStreak * 0.03, 0.15);
  return (last10WinPct - 0.5) * 2 + streakBonus; // Range roughly -1 to +1.15
}

/**
 * Extract a named metric value from a team for use in the logistic model.
 * Maps MetricWeights keys to actual TeamMetrics fields.
 */
function getMetricValue(team: Team, key: string): number {
  const m = team.metrics;
  switch (key) {
    case 'adjOffensiveEfficiency': return m.adjOffensiveEfficiency;
    case 'adjDefensiveEfficiency': return m.adjDefensiveEfficiency;
    case 'adjTempo': return m.adjTempo;
    case 'strengthOfSchedule': return m.strengthOfSchedule;
    case 'effectiveFGPct': return m.effectiveFGPct;
    case 'threePointRate': return m.threePointRate;
    case 'threePointPct': return m.threePointPct;
    case 'freeThrowRate': return m.freeThrowRate;
    case 'freeThrowPct': return m.freeThrowPct;
    case 'offensiveReboundPct': return m.offensiveReboundPct;
    case 'defensiveReboundPct': return m.defensiveReboundPct;
    case 'turnoverPct': return m.turnoverPct;
    case 'experienceRating': return m.experienceRating;
    case 'momentumScore': return computeMomentumScore(m);
    default: return 0;
  }
}

/**
 * For metrics where lower is better (e.g., defensive efficiency, turnover%),
 * we flip the sign of the differential so that "better" always = positive.
 */
const LOWER_IS_BETTER = new Set(['adjDefensiveEfficiency', 'turnoverPct']);

/**
 * Normalization constants (approximate standard deviations across D-I teams).
 * These prevent high-magnitude metrics from dominating low-magnitude ones.
 */
const NORMALIZATION: Record<string, number> = {
  adjOffensiveEfficiency: 8.0,
  adjDefensiveEfficiency: 8.0,
  adjTempo: 4.0,
  strengthOfSchedule: 4.0,
  effectiveFGPct: 0.035,
  threePointRate: 0.06,
  threePointPct: 0.035,
  freeThrowRate: 0.08,
  freeThrowPct: 0.06,
  offensiveReboundPct: 0.04,
  defensiveReboundPct: 0.04,
  turnoverPct: 0.03,
  experienceRating: 0.6,
  momentumScore: 0.5,
};

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Compute pre-game win probability for team1 vs team2 using a logistic model
 * on weighted metric differentials.
 *
 * P(team1 wins) = sigmoid(Σ wᵢ · (metric1ᵢ - metric2ᵢ) / σᵢ)
 *
 * The scaling factor controls how sensitive the model is to metric differences.
 */
export function computeBaseWinProbability(
  team1: Team,
  team2: Team,
  weights: MetricWeights,
): number {
  let logit = 0;

  for (const [key, weight] of Object.entries(weights)) {
    if (weight === 0) continue;

    const v1 = getMetricValue(team1, key);
    const v2 = getMetricValue(team2, key);
    const norm = NORMALIZATION[key] ?? 1;

    let diff = (v1 - v2) / norm;
    if (LOWER_IS_BETTER.has(key)) {
      diff = -diff; // Flip so lower (better) → positive differential
    }

    logit += weight * diff;
  }

  // Scale factor: controls the "spread" of the sigmoid.
  // 0.25 means ~1 weighted standard deviation of difference ≈ 73% win prob
  const scaleFactor = 0.25;
  return sigmoid(logit * scaleFactor);
}

/**
 * Apply seed-gap sensitivity: adjusts probability toward historical
 * seed-based expectations. Higher sensitivity pulls the probability
 * more strongly toward what seed difference would predict.
 */
export function applySeedGapAdjustment(
  baseProbability: number,
  team1Seed: number,
  team2Seed: number,
  seedGapSensitivity: number,
): number {
  if (seedGapSensitivity === 0 || team1Seed === team2Seed) return baseProbability;

  // Seed-implied probability: lower seed = better
  // A 1 vs 16 matchup implies ~98.5% for the 1-seed historically
  const seedDiff = team2Seed - team1Seed; // Positive = team1 is favored
  const seedImpliedProb = sigmoid(seedDiff * 0.18);

  // Blend: sensitivity of 1.0 means 15% pull toward seed expectation
  const pullStrength = 0.15 * seedGapSensitivity;
  return baseProbability * (1 - pullStrength) + seedImpliedProb * pullStrength;
}

/**
 * Compute live game state adjustment.
 * Uses the current score differential and time remaining to shift probability.
 * The influence grows as the game progresses (time-decay function).
 *
 * Alpha(t) = 1 - (timeRemaining / totalTime)^gamma
 * Early game: alpha ≈ 0 (pre-game model dominates)
 * Late game: alpha ≈ 1 (live state dominates)
 */
export function computeLiveAdjustedProbability(
  pregameProbability: number,
  liveState: LiveGameState,
  homeTeamIsTeam1: boolean,
  gamma: number,
): number {
  if (liveState.status === 'pre-game') return pregameProbability;
  if (liveState.status === 'final') {
    const team1Score = homeTeamIsTeam1 ? liveState.homeScore : liveState.awayScore;
    const team2Score = homeTeamIsTeam1 ? liveState.awayScore : liveState.homeScore;
    return team1Score > team2Score ? 1.0 : team1Score < team2Score ? 0.0 : 0.5;
  }

  // Total time calculation (handle overtime)
  const totalTime = liveState.period <= 2
    ? GAME_LENGTH_SECONDS
    : GAME_LENGTH_SECONDS + (liveState.period - 2) * 300; // 5 min OT periods
  const elapsed = totalTime - liveState.timeRemainingSeconds;
  const elapsedFraction = Math.max(0, Math.min(1, elapsed / totalTime));

  // Alpha: how much live state influences the result
  const alpha = Math.pow(elapsedFraction, gamma);

  // Live probability from score differential
  const team1Score = homeTeamIsTeam1 ? liveState.homeScore : liveState.awayScore;
  const team2Score = homeTeamIsTeam1 ? liveState.awayScore : liveState.homeScore;
  const scoreDiff = team1Score - team2Score;

  // Remaining possessions estimate (assuming ~70 possessions per 40 min)
  const remainingPossessions = Math.max(1, (liveState.timeRemainingSeconds / GAME_LENGTH_SECONDS) * 70);

  // Standard deviation of score differential per possession ≈ 2.5 points
  const expectedStdDev = Math.sqrt(remainingPossessions) * 2.5;

  // Probability team1 wins from current state (normal approximation)
  const liveProb = normalCDF(scoreDiff / expectedStdDev);

  // Blend pre-game and live
  return alpha * liveProb + (1 - alpha) * pregameProbability;
}

/**
 * Standard normal CDF approximation (Abramowitz and Stegun formula 7.1.26).
 * Accurate to ~1.5e-7.
 */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Apply variance to a probability to determine a stochastic outcome.
 * Returns true if team1 wins this simulation run.
 */
export function sampleOutcome(
  team1WinProb: number,
  varianceConfig: VarianceConfig,
  round: string,
  rng: () => number,
): boolean {
  // Apply round-specific variance multiplier
  const roundMult = varianceConfig.roundVarianceMultipliers[round as keyof typeof varianceConfig.roundVarianceMultipliers] ?? 1.0;
  const variance = varianceConfig.baseVariance * roundMult;

  // Add noise to the probability (in logit space for better behavior at extremes)
  const logitP = Math.log(team1WinProb / (1 - team1WinProb + 1e-10) + 1e-10);
  const noise = gaussianRandom(rng) * variance * 4; // Scale noise to logit space
  const noisyProb = sigmoid(logitP + noise);

  // Apply upset multiplier: compresses probability toward 0.5
  const finalProb = noisyProb * (1 / varianceConfig.upsetMultiplier)
    + 0.5 * (1 - 1 / varianceConfig.upsetMultiplier);

  return rng() < Math.max(0.001, Math.min(0.999, finalProb));
}

/**
 * Box-Muller transform for Gaussian random numbers.
 */
function gaussianRandom(rng: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}
