import { Team, Round } from '../core/types';
import { BaseSimulationMode } from './base-mode';
import {
  SimulationMode,
  MetricWeights,
  VarianceConfig,
  SimulationContext,
  RequiredDataSource,
  ModeCategory,
  ConfidenceTag,
  ModeState,
} from './types';

interface BlendComponent {
  mode: SimulationMode;
  weight: number;
}

/**
 * Combines two or more modes with specified blend weights.
 * Metric weights and variance configs are blended proportionally.
 * adjustProbability is called on each mode and the results are weight-averaged.
 */
export class ModeBlender extends BaseSimulationMode {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: ModeCategory;
  readonly confidenceTag: ConfidenceTag;

  private components: BlendComponent[];
  private totalWeight: number;

  constructor(
    components: BlendComponent[],
    config: {
      id: string;
      name: string;
      description: string;
    },
  ) {
    super();
    if (components.length < 2) {
      throw new Error('ModeBlender requires at least 2 component modes');
    }
    this.components = components;
    this.totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
    this.id = config.id;
    this.name = config.name;
    this.description = config.description;

    // If any component is whimsical, the blend is entertainment
    // If all are research, it stays research
    const hasWhimsical = components.some(c => c.mode.confidenceTag === 'whimsical');
    const allResearch = components.every(c => c.mode.category === 'research');
    this.category = hasWhimsical ? 'entertainment' : allResearch ? 'research' : 'hybrid';
    this.confidenceTag = hasWhimsical ? 'experimental' : 'experimental';
  }

  getMetricWeights(): MetricWeights {
    const blended: Record<string, number> = {};

    for (const { mode, weight } of this.components) {
      const weights = mode.getMetricWeights();
      for (const [key, value] of Object.entries(weights)) {
        blended[key] = (blended[key] ?? 0) + value * (weight / this.totalWeight);
      }
    }

    return blended as MetricWeights;
  }

  getVarianceConfig(): VarianceConfig {
    let baseVariance = 0;
    let upsetMultiplier = 0;
    let liveStateWeight = 0;
    let seedGapSensitivity = 0;

    for (const { mode, weight } of this.components) {
      const vc = mode.getVarianceConfig();
      const w = weight / this.totalWeight;
      baseVariance += vc.baseVariance * w;
      upsetMultiplier += vc.upsetMultiplier * w;
      liveStateWeight += vc.liveStateWeight * w;
      seedGapSensitivity += vc.seedGapSensitivity * w;
    }

    return {
      baseVariance,
      upsetMultiplier,
      liveStateWeight,
      seedGapSensitivity,
      roundVarianceMultipliers: {},
    };
  }

  adjustProbability(
    baseProbability: number,
    team1: Team,
    team2: Team,
    context: SimulationContext,
  ): number {
    let blended = 0;
    for (const { mode, weight } of this.components) {
      blended += mode.adjustProbability(baseProbability, team1, team2, context) * weight;
    }
    return blended / this.totalWeight;
  }

  getRequiredData(): RequiredDataSource[] {
    const all = this.components.flatMap(c => c.mode.getRequiredData());
    return [...new Set(all)];
  }
}
