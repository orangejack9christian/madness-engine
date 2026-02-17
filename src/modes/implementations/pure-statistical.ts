import { BaseSimulationMode, DEFAULT_WEIGHTS, DEFAULT_VARIANCE } from '../base-mode';
import { MetricWeights, VarianceConfig } from '../types';
import { registerMode } from '../registry';

class PureStatisticalMode extends BaseSimulationMode {
  readonly id = 'pure-statistical';
  readonly name = 'Serious Analytics';
  readonly description = 'Research-grade model using KenPom-style efficiency metrics, tempo, strength of schedule, and Four Factors. The foundation mode for validated predictions.';
  readonly category = 'research' as const;
  readonly confidenceTag = 'statistically-validated' as const;

  getMetricWeights(): MetricWeights {
    return { ...DEFAULT_WEIGHTS };
  }

  getVarianceConfig(): VarianceConfig {
    return { ...DEFAULT_VARIANCE };
  }
}

registerMode('pure-statistical', () => new PureStatisticalMode());
