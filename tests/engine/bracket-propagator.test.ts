import { describe, it, expect } from 'vitest';
import { Team, TournamentType } from '../../src/core/types';
import { buildBracket } from '../../src/bracket/bracket-builder';
import { simulateFullBracket, aggregateBracketResults } from '../../src/engine/bracket-propagator';
import { REGIONS } from '../../src/core/constants';

import '../../src/modes/implementations/pure-statistical';
import { getMode } from '../../src/modes/registry';

function generateMockTeams(): Team[] {
  const teams: Team[] = [];
  for (const region of REGIONS) {
    for (let seed = 1; seed <= 16; seed++) {
      const quality = (17 - seed) / 16; // 1.0 for seed 1, 0.0625 for seed 16
      teams.push({
        id: `${region}-${seed}`,
        name: `${region.charAt(0).toUpperCase() + region.slice(1)} ${seed}-seed`,
        shortName: `${region.slice(0, 1).toUpperCase()}${seed}`,
        seed,
        region: region as any,
        conference: 'Test',
        tournamentType: 'mens',
        metrics: {
          adjOffensiveEfficiency: 95 + quality * 30,
          adjDefensiveEfficiency: 105 - quality * 20,
          adjTempo: 67,
          strengthOfSchedule: quality * 10,
          nonConferenceSOS: quality * 5,
          effectiveFGPct: 0.470 + quality * 0.08,
          threePointRate: 0.350,
          threePointPct: 0.320 + quality * 0.06,
          freeThrowRate: 0.300,
          freeThrowPct: 0.680 + quality * 0.08,
          offensiveReboundPct: 0.280 + quality * 0.05,
          defensiveReboundPct: 0.680 + quality * 0.05,
          turnoverPct: 0.200 - quality * 0.04,
          stealPct: 0.080 + quality * 0.03,
          averageHeight: 76 + quality * 4,
          benchMinutesPct: 0.35,
          experienceRating: 1.5 + quality * 2,
          wins: 15 + Math.round(quality * 18),
          losses: 15 - Math.round(quality * 10),
          conferenceWins: 8 + Math.round(quality * 10),
          conferenceLosses: 10 - Math.round(quality * 6),
          last10Wins: 4 + Math.round(quality * 6),
          last10Losses: 6 - Math.round(quality * 6),
          winStreak: Math.round(quality * 5),
        },
      });
    }
  }
  return teams;
}

describe('bracket-propagator', () => {
  const teams = generateMockTeams();
  const bracket = buildBracket(teams, 2025, 'mens');

  it('produces results for all 64 teams', () => {
    const mode = getMode('pure-statistical');
    const result = simulateFullBracket(bracket, teams, mode, 100, 42);
    expect(Object.keys(result.roundCounts)).toHaveLength(64);
    expect(Object.keys(result.championshipCounts).length).toBeGreaterThan(0);
  });

  it('championship counts sum to totalSims', () => {
    const mode = getMode('pure-statistical');
    const result = simulateFullBracket(bracket, teams, mode, 500, 42);
    const totalChamps = Object.values(result.championshipCounts).reduce((s, v) => s + v, 0);
    expect(totalChamps).toBe(result.totalSims);
  });

  it('higher seeds win championships more often', () => {
    const mode = getMode('pure-statistical');
    const result = simulateFullBracket(bracket, teams, mode, 2000, 42);

    // Combine championship counts for all 1-seeds vs all 16-seeds
    let seed1Champs = 0;
    let seed16Champs = 0;
    for (const team of teams) {
      const champCount = result.championshipCounts[team.id] ?? 0;
      if (team.seed === 1) seed1Champs += champCount;
      if (team.seed === 16) seed16Champs += champCount;
    }

    expect(seed1Champs).toBeGreaterThan(seed16Champs);
  });

  it('round advancement counts are monotonically decreasing', () => {
    const mode = getMode('pure-statistical');
    const result = simulateFullBracket(bracket, teams, mode, 1000, 42);

    for (const team of teams) {
      const counts = result.roundCounts[team.id];
      // R64 count >= R32 count >= S16 count >= E8 count >= FF count >= Champ count
      expect(counts['round-of-64']).toBeGreaterThanOrEqual(counts['round-of-32']);
      expect(counts['round-of-32']).toBeGreaterThanOrEqual(counts['sweet-sixteen']);
      expect(counts['sweet-sixteen']).toBeGreaterThanOrEqual(counts['elite-eight']);
      expect(counts['elite-eight']).toBeGreaterThanOrEqual(counts['final-four']);
      expect(counts['final-four']).toBeGreaterThanOrEqual(counts['championship']);
    }
  });

  it('aggregated championship probabilities sum to approximately 1.0', () => {
    const mode = getMode('pure-statistical');
    const simResult = simulateFullBracket(bracket, teams, mode, 2000, 42);
    const aggregated = aggregateBracketResults(simResult, teams, 'pure-statistical', 'Test', 'mens');

    let totalChampProb = 0;
    for (const [, result] of aggregated.teamResults) {
      totalChampProb += result.championshipProbability;
    }
    expect(totalChampProb).toBeCloseTo(1.0, 1);
  });

  it('is deterministic with the same seed', () => {
    const mode = getMode('pure-statistical');
    const result1 = simulateFullBracket(bracket, teams, mode, 500, 12345);
    const result2 = simulateFullBracket(bracket, teams, mode, 500, 12345);

    for (const team of teams) {
      expect(result1.championshipCounts[team.id] ?? 0).toBe(
        result2.championshipCounts[team.id] ?? 0
      );
    }
  });
});
