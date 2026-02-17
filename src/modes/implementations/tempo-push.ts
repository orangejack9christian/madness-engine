import { Team } from '../../core/types';
import { BaseSimulationMode, DEFAULT_WEIGHTS, DEFAULT_VARIANCE } from '../base-mode';
import { MetricWeights, VarianceConfig, SimulationContext } from '../types';
import { registerMode } from '../registry';

class TempoPushMode extends BaseSimulationMode {
  readonly id = 'tempo-push';
  readonly name = 'Tempo Push';
  readonly description =
    'Pace kills. Fast-paced teams that push tempo create more possessions and more opportunities for their talent to shine. Slow-it-down teams get penalized for reducing variance.';
  readonly category = 'hybrid' as const;
  readonly confidenceTag = 'experimental' as const;

  getMetricWeights(): MetricWeights {
    return {
      ...DEFAULT_WEIGHTS,
      // Massively boost tempo
      adjTempo: 2.5,
      // Fast teams need to convert — shooting still matters
      effectiveFGPct: 0.8,
      // Turnovers are amplified at high pace
      turnoverPct: 0.8,
    };
  }

  getVarianceConfig(): VarianceConfig {
    return {
      ...DEFAULT_VARIANCE,
      // Fast-paced games are more volatile
      baseVariance: 0.15,
      roundVarianceMultipliers: {
        'round-of-64': 1.1,
        'round-of-32': 1.1,
        'sweet-sixteen': 1.0,
        'elite-eight': 1.0,
        'final-four': 0.95,
        'championship': 0.90,
      },
    };
  }

  adjustProbability(
    baseProbability: number,
    team1: Team,
    team2: Team,
    _context: SimulationContext,
  ): number {
    // Compute tempo differential: positive means team1 is faster
    const tempoDiff = (team1.metrics.adjTempo - team2.metrics.adjTempo) / 10;

    // Each unit of tempo advantage (~1 possession per game) = ~1.5% probability shift
    const tempoBonus = tempoDiff * 0.015;

    // Bonus for extremely fast teams (tempo > 72): they impose their will
    const fastThreshold = 72;
    const team1FastBonus =
      team1.metrics.adjTempo > fastThreshold
        ? (team1.metrics.adjTempo - fastThreshold) * 0.003
        : 0;
    const team2FastBonus =
      team2.metrics.adjTempo > fastThreshold
        ? (team2.metrics.adjTempo - fastThreshold) * 0.003
        : 0;

    const adjusted =
      baseProbability + tempoBonus + team1FastBonus - team2FastBonus;

    return Math.max(0.02, Math.min(0.98, adjusted));
  }
}

registerMode('tempo-push', () => new TempoPushMode());
