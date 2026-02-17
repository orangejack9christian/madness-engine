import { Team } from '../../core/types';
import { BaseSimulationMode, DEFAULT_WEIGHTS } from '../base-mode';
import { MetricWeights, VarianceConfig, SimulationContext, RequiredDataSource } from '../types';
import { registerMode } from '../registry';

// Fallback mascot combat ratings for teams without mascot data
const DEFAULT_COMBAT_RATING = 50;

const TYPE_POWER: Record<string, number> = {
  'mythical': 90,
  'force-of-nature': 85,
  'animal': 60,
  'human': 45,
  'object': 30,
  'abstract': 35,
};

const SIZE_MULTIPLIER: Record<string, number> = {
  'massive': 1.3,
  'large': 1.15,
  'medium': 1.0,
  'small': 0.85,
  'tiny': 0.7,
};

class MascotFightMode extends BaseSimulationMode {
  readonly id = 'mascot-fight';
  readonly name = 'Mascot Fight';
  readonly description = 'Pure entertainment: outcomes determined by mascot combat ratings. Predators beat prey, mythical creatures dominate, size matters. Not based on basketball statistics.';
  readonly category = 'entertainment' as const;
  readonly confidenceTag = 'whimsical' as const;

  getMetricWeights(): MetricWeights {
    // Zero out all basketball metrics — mascot combat only
    return {
      adjOffensiveEfficiency: 0,
      adjDefensiveEfficiency: 0,
      adjTempo: 0,
      strengthOfSchedule: 0,
      effectiveFGPct: 0,
      threePointRate: 0,
      threePointPct: 0,
      freeThrowRate: 0,
      freeThrowPct: 0,
      offensiveReboundPct: 0,
      defensiveReboundPct: 0,
      turnoverPct: 0,
      experienceRating: 0,
      momentumScore: 0,
    };
  }

  getVarianceConfig(): VarianceConfig {
    return {
      baseVariance: 0.18,
      upsetMultiplier: 1.5,
      liveStateWeight: 0,
      seedGapSensitivity: 0,
      roundVarianceMultipliers: {},
    };
  }

  getRequiredData(): RequiredDataSource[] {
    return ['mascot-data'];
  }

  adjustProbability(
    _baseProbability: number,
    team1: Team,
    team2: Team,
    _context: SimulationContext,
  ): number {
    const power1 = computeMascotPower(team1);
    const power2 = computeMascotPower(team2);

    // Convert power differential to probability via sigmoid
    const diff = (power1 - power2) / 30; // Normalize
    return 1 / (1 + Math.exp(-diff));
  }
}

function computeMascotPower(team: Team): number {
  if (!team.mascot) return DEFAULT_COMBAT_RATING;

  const m = team.mascot;
  const typePower = TYPE_POWER[m.type] ?? 50;
  const sizeMult = SIZE_MULTIPLIER[m.size] ?? 1.0;
  const flightBonus = m.flightCapable ? 12 : 0;
  const intimidation = m.intimidationFactor * 3;

  return (m.combatRating * 0.4 + typePower * 0.3 + intimidation * 0.2 + flightBonus) * sizeMult;
}

registerMode('mascot-fight', () => new MascotFightMode());
