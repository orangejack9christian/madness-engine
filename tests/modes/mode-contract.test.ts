import { describe, it, expect } from 'vitest';
import { Team } from '../../src/core/types';
import { SimulationMode, SimulationContext } from '../../src/modes/types';

// Import all mode implementations
import '../../src/modes/implementations/pure-statistical';
import '../../src/modes/implementations/upset-chaos';
import '../../src/modes/implementations/mascot-fight';
import '../../src/modes/implementations/coaching';
import '../../src/modes/implementations/momentum';

import { getAllModes } from '../../src/modes/registry';

function makeTeam(id: string, seed: number): Team {
  return {
    id,
    name: `Team ${id}`,
    shortName: id,
    seed,
    region: 'east',
    conference: 'Test',
    tournamentType: 'mens',
    metrics: {
      adjOffensiveEfficiency: 105,
      adjDefensiveEfficiency: 98,
      adjTempo: 67,
      strengthOfSchedule: 3,
      nonConferenceSOS: 2,
      effectiveFGPct: 0.510,
      threePointRate: 0.350,
      threePointPct: 0.340,
      freeThrowRate: 0.300,
      freeThrowPct: 0.720,
      offensiveReboundPct: 0.310,
      defensiveReboundPct: 0.710,
      turnoverPct: 0.175,
      stealPct: 0.090,
      averageHeight: 77,
      benchMinutesPct: 0.35,
      experienceRating: 2.2,
      wins: 22,
      losses: 10,
      conferenceWins: 12,
      conferenceLosses: 6,
      last10Wins: 7,
      last10Losses: 3,
      winStreak: 2,
    },
  };
}

const team1 = makeTeam('team-a', 3);
const team2 = makeTeam('team-b', 11);

const context: SimulationContext = {
  round: 'round-of-64',
  region: 'east',
  tournamentType: 'mens',
  gamesPlayedByTeam1: 0,
  gamesPlayedByTeam2: 0,
};

describe('Mode contract tests', () => {
  const modes = getAllModes();

  it('has at least one registered mode', () => {
    expect(modes.length).toBeGreaterThan(0);
  });

  for (const mode of modes) {
    describe(`Mode: ${mode.id}`, () => {
      it('has valid identity fields', () => {
        expect(mode.id).toBeTruthy();
        expect(mode.name).toBeTruthy();
        expect(mode.description).toBeTruthy();
        expect(['research', 'entertainment', 'hybrid']).toContain(mode.category);
        expect(['statistically-validated', 'experimental', 'whimsical']).toContain(mode.confidenceTag);
      });

      it('returns valid MetricWeights (all values >= 0)', () => {
        const weights = mode.getMetricWeights();
        expect(weights).toBeTruthy();
        for (const [key, value] of Object.entries(weights)) {
          expect(value).toBeGreaterThanOrEqual(0);
        }
      });

      it('returns valid VarianceConfig', () => {
        const vc = mode.getVarianceConfig();
        expect(vc.baseVariance).toBeGreaterThan(0);
        expect(vc.upsetMultiplier).toBeGreaterThan(0);
        expect(vc.liveStateWeight).toBeGreaterThanOrEqual(0);
        expect(vc.seedGapSensitivity).toBeGreaterThanOrEqual(0);
      });

      it('adjustProbability returns value in [0, 1]', () => {
        const result = mode.adjustProbability(0.65, team1, team2, context);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(1);
      });

      it('adjustProbability is deterministic', () => {
        const r1 = mode.adjustProbability(0.65, team1, team2, context);
        const r2 = mode.adjustProbability(0.65, team1, team2, context);
        expect(r1).toBe(r2);
      });

      it('adjustProbability handles edge case inputs', () => {
        const low = mode.adjustProbability(0.01, team1, team2, context);
        const high = mode.adjustProbability(0.99, team1, team2, context);
        expect(low).toBeGreaterThanOrEqual(0);
        expect(low).toBeLessThanOrEqual(1);
        expect(high).toBeGreaterThanOrEqual(0);
        expect(high).toBeLessThanOrEqual(1);
      });

      it('getRequiredData returns valid data source identifiers', () => {
        const sources = mode.getRequiredData();
        expect(Array.isArray(sources)).toBe(true);
        const validSources = [
          'mascot-data', 'coaching-ratings', 'nba-draft-rankings',
          'betting-lines', 'historical-results', 'ai-model',
        ];
        for (const source of sources) {
          expect(validSources).toContain(source);
        }
      });
    });
  }
});
