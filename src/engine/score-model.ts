import { Team } from '../core/types';

/**
 * Estimate the expected total score and individual team scores
 * for a matchup, based on tempo and efficiency metrics.
 *
 * The model:
 * 1. Estimate game possessions from both teams' tempo
 * 2. Estimate each team's points from their offense vs opponent defense
 * 3. Add variance for simulation sampling
 */

/**
 * Estimate the number of possessions in this game.
 * Uses the average of both teams' adjusted tempo.
 */
export function estimatePossessions(team1: Team, team2: Team): number {
  return (team1.metrics.adjTempo + team2.metrics.adjTempo) / 2;
}

/**
 * Estimate expected points for a team based on possessions
 * and the matchup-adjusted efficiency.
 *
 * Matchup adjustment: team's offense vs opponent's defense,
 * normalized against D-I average (~100 pts/100 poss).
 */
export function estimateTeamScore(
  offenseTeam: Team,
  defenseTeam: Team,
  possessions: number,
): number {
  const D1_AVERAGE_EFFICIENCY = 100; // Average points per 100 possessions

  // Matchup-adjusted efficiency:
  // If team A has 115 offense and team B has 95 defense,
  // the "expected" offensive efficiency in this matchup is:
  // 115 + (100 - 95) = 120 (because defense is worse than average)
  const matchupAdjusted =
    offenseTeam.metrics.adjOffensiveEfficiency
    + (D1_AVERAGE_EFFICIENCY - defenseTeam.metrics.adjDefensiveEfficiency);

  // Scale from "per 100 possessions" to actual possessions
  return (matchupAdjusted / 100) * possessions;
}

/**
 * Sample a final score for a single simulation run.
 * Adds gaussian noise to the expected score to model game variance.
 */
export function sampleScore(
  expectedScore: number,
  rng: () => number,
): number {
  // Standard deviation of ~8 points per team per game (empirical)
  const stdDev = 8.0;
  const noise = gaussianRandom(rng) * stdDev;
  return Math.max(30, Math.round(expectedScore + noise));
}

/**
 * Determine if a game goes to overtime based on the sampled scores.
 * If scores are within 2 points, there's a chance of OT.
 * In simulation, exact ties always go to OT.
 */
export function determineOvertime(
  team1Score: number,
  team2Score: number,
): boolean {
  return team1Score === team2Score;
}

/**
 * Simulate overtime resolution. Returns adjusted scores.
 * Each OT period adds ~7-10 points per team with a winner emerging.
 */
export function simulateOvertime(
  team1Score: number,
  team2Score: number,
  rng: () => number,
): { team1Score: number; team2Score: number } {
  let s1 = team1Score;
  let s2 = team2Score;

  // Simulate OT periods until someone wins (max 5 OTs for safety)
  for (let ot = 0; ot < 5 && s1 === s2; ot++) {
    const otPoints1 = Math.round(7 + gaussianRandom(rng) * 3);
    const otPoints2 = Math.round(7 + gaussianRandom(rng) * 3);
    s1 += Math.max(2, otPoints1);
    s2 += Math.max(2, otPoints2);
  }

  // If still tied after 5 OTs (extremely unlikely), force a winner
  if (s1 === s2) {
    if (rng() < 0.5) s1++;
    else s2++;
  }

  return { team1Score: s1, team2Score: s2 };
}

function gaussianRandom(rng: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}
