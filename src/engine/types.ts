import { Round, Region, TournamentType } from '../core/types';

export interface SimulationTask {
  type: 'single-game' | 'full-bracket';
  modeId: string;
  simulationCount: number;
  tournamentType: TournamentType;
  year: number;
  seed?: number; // RNG seed for reproducibility

  // For single-game tasks
  team1Id?: string;
  team2Id?: string;
  round?: Round;
  region?: Region | 'final-four';

  // For full-bracket tasks — serialized data since this goes to worker threads
  teamsJson?: string;
  bracketJson?: string;
}

export interface GameOutcome {
  team1Wins: boolean;
  team1Score: number;
  team2Score: number;
  wentToOvertime: boolean;
}

export interface SingleGameSimResult {
  team1Id: string;
  team2Id: string;
  team1Wins: number;
  team2Wins: number;
  totalSims: number;
  team1ScoreSum: number;
  team2ScoreSum: number;
  team1ScoreSqSum: number;
  team2ScoreSqSum: number;
  overtimeCount: number;
}

export interface BracketSimResult {
  /** teamId -> number of times that team reached each round */
  roundCounts: Record<string, Record<Round, number>>;
  /** teamId -> number of championships */
  championshipCounts: Record<string, number>;
  totalSims: number;
}
