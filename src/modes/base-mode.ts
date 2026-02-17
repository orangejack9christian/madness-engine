import { Team, Round } from '../core/types';
import {
  SimulationMode,
  MetricWeights,
  VarianceConfig,
  SimulationContext,
  RequiredDataSource,
  ModeCategory,
  ConfidenceTag,
} from './types';

export const DEFAULT_WEIGHTS: MetricWeights = {
  adjOffensiveEfficiency: 1.0,
  adjDefensiveEfficiency: 1.0,
  adjTempo: 0.3,
  strengthOfSchedule: 0.5,
  effectiveFGPct: 0.6,
  threePointRate: 0.3,
  threePointPct: 0.5,
  freeThrowRate: 0.2,
  freeThrowPct: 0.3,
  offensiveReboundPct: 0.4,
  defensiveReboundPct: 0.4,
  turnoverPct: 0.5,
  experienceRating: 0.3,
  momentumScore: 0.2,
};

export const DEFAULT_VARIANCE: VarianceConfig = {
  baseVariance: 0.11,
  upsetMultiplier: 1.0,
  liveStateWeight: 1.0,
  seedGapSensitivity: 1.0,
  roundVarianceMultipliers: {},
};

export abstract class BaseSimulationMode implements SimulationMode {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly category: ModeCategory;
  abstract readonly confidenceTag: ConfidenceTag;

  abstract getMetricWeights(): MetricWeights;
  abstract getVarianceConfig(): VarianceConfig;

  adjustProbability(
    baseProbability: number,
    _team1: Team,
    _team2: Team,
    _context: SimulationContext,
  ): number {
    return baseProbability;
  }

  getRequiredData(): RequiredDataSource[] {
    return [];
  }
}
