import { Team, Round, Region, TournamentType, BracketState } from '../core/types';

export interface MetricWeights {
  adjOffensiveEfficiency: number;
  adjDefensiveEfficiency: number;
  adjTempo: number;
  strengthOfSchedule: number;
  effectiveFGPct: number;
  threePointRate: number;
  threePointPct: number;
  freeThrowRate: number;
  freeThrowPct: number;
  offensiveReboundPct: number;
  defensiveReboundPct: number;
  turnoverPct: number;
  experienceRating: number;
  momentumScore: number;
  [key: string]: number;
}

export interface VarianceConfig {
  /** Base standard deviation for game outcome noise */
  baseVariance: number;
  /** Multiplier for upset probability (1.0 = neutral) */
  upsetMultiplier: number;
  /** How much live game state shifts probability (0 = ignore, 1 = normal) */
  liveStateWeight: number;
  /** Per-round variance adjustments */
  roundVarianceMultipliers: Partial<Record<Round, number>>;
  /** How much seed difference matters (1.0 = normal) */
  seedGapSensitivity: number;
}

export interface SimulationContext {
  round: Round;
  region: Region | 'final-four';
  tournamentType: TournamentType;
  gamesPlayedByTeam1: number;
  gamesPlayedByTeam2: number;
}

export type RequiredDataSource =
  | 'mascot-data'
  | 'coaching-ratings'
  | 'nba-draft-rankings'
  | 'betting-lines'
  | 'historical-results'
  | 'ai-model';

export type ModeCategory = 'research' | 'entertainment' | 'hybrid';
export type ConfidenceTag = 'statistically-validated' | 'experimental' | 'whimsical';

/** Opaque per-simulation state for stateful modes */
export type ModeState = Record<string, any>;

export interface SimulationMode {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: ModeCategory;
  readonly confidenceTag: ConfidenceTag;

  getMetricWeights(): MetricWeights;
  getVarianceConfig(): VarianceConfig;

  /**
   * Adjust the raw probability after the base model computes it.
   * This is where mode-specific logic lives (mascot combat, seed boosts, etc.)
   */
  adjustProbability(
    baseProbability: number,
    team1: Team,
    team2: Team,
    context: SimulationContext,
  ): number;

  /** Declare additional data sources this mode needs */
  getRequiredData(): RequiredDataSource[];

  /** Per-simulation-step state mutation (e.g., fatigue accumulation) */
  onGameComplete?(
    winner: Team,
    loser: Team,
    round: Round,
    state: ModeState,
  ): void;

  /** Initialize per-simulation state at the start of each Monte Carlo run */
  initializeSimState?(): ModeState;
}
