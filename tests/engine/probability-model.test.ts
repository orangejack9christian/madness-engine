import { describe, it, expect } from 'vitest';
import { Team } from '../../src/core/types';
import { DEFAULT_WEIGHTS } from '../../src/modes/base-mode';
import {
  computeBaseWinProbability,
  applySeedGapAdjustment,
  sampleOutcome,
} from '../../src/engine/probability-model';
import { DEFAULT_VARIANCE } from '../../src/modes/base-mode';

function makeTeam(overrides: Partial<Team> & { seed: number; metrics?: Partial<Team['metrics']> }): Team {
  const defaults: Team = {
    id: 'test-team',
    name: 'Test Team',
    shortName: 'Test',
    seed: overrides.seed,
    region: 'east',
    conference: 'Test',
    tournamentType: 'mens',
    metrics: {
      adjOffensiveEfficiency: 100,
      adjDefensiveEfficiency: 100,
      adjTempo: 67,
      strengthOfSchedule: 0,
      nonConferenceSOS: 0,
      effectiveFGPct: 0.500,
      threePointRate: 0.350,
      threePointPct: 0.340,
      freeThrowRate: 0.300,
      freeThrowPct: 0.700,
      offensiveReboundPct: 0.300,
      defensiveReboundPct: 0.700,
      turnoverPct: 0.180,
      stealPct: 0.090,
      averageHeight: 77,
      benchMinutesPct: 0.35,
      experienceRating: 2.0,
      wins: 20,
      losses: 10,
      conferenceWins: 10,
      conferenceLosses: 8,
      last10Wins: 5,
      last10Losses: 5,
      winStreak: 0,
      ...overrides.metrics,
    },
  };
  return { ...defaults, ...overrides, metrics: { ...defaults.metrics, ...overrides.metrics } };
}

describe('computeBaseWinProbability', () => {
  it('returns 0.5 for identical teams', () => {
    const team1 = makeTeam({ seed: 1, id: 'team1' });
    const team2 = makeTeam({ seed: 1, id: 'team2' });
    const prob = computeBaseWinProbability(team1, team2, DEFAULT_WEIGHTS);
    expect(prob).toBeCloseTo(0.5, 2);
  });

  it('favors the team with better offensive efficiency', () => {
    const strong = makeTeam({ seed: 1, id: 'strong', metrics: { adjOffensiveEfficiency: 120 } });
    const weak = makeTeam({ seed: 1, id: 'weak', metrics: { adjOffensiveEfficiency: 95 } });
    const prob = computeBaseWinProbability(strong, weak, DEFAULT_WEIGHTS);
    expect(prob).toBeGreaterThan(0.5);
  });

  it('favors the team with better defensive efficiency (lower is better)', () => {
    const strong = makeTeam({ seed: 1, id: 'strong', metrics: { adjDefensiveEfficiency: 88 } });
    const weak = makeTeam({ seed: 1, id: 'weak', metrics: { adjDefensiveEfficiency: 105 } });
    const prob = computeBaseWinProbability(strong, weak, DEFAULT_WEIGHTS);
    expect(prob).toBeGreaterThan(0.5);
  });

  it('returns value between 0 and 1', () => {
    const elite = makeTeam({
      seed: 1,
      id: 'elite',
      metrics: { adjOffensiveEfficiency: 125, adjDefensiveEfficiency: 85, strengthOfSchedule: 10 },
    });
    const terrible = makeTeam({
      seed: 16,
      id: 'terrible',
      metrics: { adjOffensiveEfficiency: 90, adjDefensiveEfficiency: 110, strengthOfSchedule: -5 },
    });
    const prob = computeBaseWinProbability(elite, terrible, DEFAULT_WEIGHTS);
    expect(prob).toBeGreaterThan(0);
    expect(prob).toBeLessThan(1);
    expect(prob).toBeGreaterThan(0.8); // Elite team should be heavily favored
  });

  it('opposing probabilities sum to 1', () => {
    const team1 = makeTeam({ seed: 3, id: 't1', metrics: { adjOffensiveEfficiency: 110 } });
    const team2 = makeTeam({ seed: 6, id: 't2', metrics: { adjOffensiveEfficiency: 105 } });
    const p1 = computeBaseWinProbability(team1, team2, DEFAULT_WEIGHTS);
    const p2 = computeBaseWinProbability(team2, team1, DEFAULT_WEIGHTS);
    expect(p1 + p2).toBeCloseTo(1.0, 5);
  });
});

describe('applySeedGapAdjustment', () => {
  it('does not change probability when sensitivity is 0', () => {
    const result = applySeedGapAdjustment(0.6, 1, 16, 0);
    expect(result).toBe(0.6);
  });

  it('does not change probability for same seed', () => {
    const result = applySeedGapAdjustment(0.6, 5, 5, 1.0);
    expect(result).toBe(0.6);
  });

  it('slightly boosts favored team (lower seed) probability', () => {
    const base = 0.6;
    const adjusted = applySeedGapAdjustment(base, 1, 16, 1.0);
    expect(adjusted).toBeGreaterThan(base);
  });

  it('slightly reduces underdog probability', () => {
    const base = 0.6;
    const adjusted = applySeedGapAdjustment(base, 16, 1, 1.0);
    expect(adjusted).toBeLessThan(base);
  });
});

describe('sampleOutcome', () => {
  it('produces outcomes matching probability over many trials', () => {
    let seed = 12345;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    const prob = 0.7;
    let wins = 0;
    const trials = 10000;
    for (let i = 0; i < trials; i++) {
      if (sampleOutcome(prob, DEFAULT_VARIANCE, 'round-of-64', rng)) wins++;
    }
    const winRate = wins / trials;
    // Should be within ~5% of the true probability given variance
    expect(winRate).toBeGreaterThan(0.55);
    expect(winRate).toBeLessThan(0.85);
  });
});
