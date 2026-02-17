import { Round, Region } from './types';

export const REGIONS: Region[] = ['east', 'west', 'south', 'midwest'];

export const ROUNDS_IN_ORDER: Round[] = [
  'round-of-64',
  'round-of-32',
  'sweet-sixteen',
  'elite-eight',
  'final-four',
  'championship',
];

export const ROUND_NAMES: Record<Round, string> = {
  'first-four': 'First Four',
  'round-of-64': 'Round of 64',
  'round-of-32': 'Round of 32',
  'sweet-sixteen': 'Sweet Sixteen',
  'elite-eight': 'Elite Eight',
  'final-four': 'Final Four',
  'championship': 'Championship',
};

export const ROUND_INDEX: Record<Round, number> = {
  'first-four': -1,
  'round-of-64': 0,
  'round-of-32': 1,
  'sweet-sixteen': 2,
  'elite-eight': 3,
  'final-four': 4,
  'championship': 5,
};

export const TEAMS_PER_REGION = 16;
export const TOTAL_TEAMS = 64;
export const GAME_LENGTH_SECONDS = 40 * 60; // 40 minutes
export const OVERTIME_LENGTH_SECONDS = 5 * 60; // 5 minutes

// Standard seed matchups in round of 64
// Index is game number within region (0-7), value is [seed1, seed2]
export const SEED_MATCHUPS: [number, number][] = [
  [1, 16],
  [8, 9],
  [5, 12],
  [4, 13],
  [6, 11],
  [3, 14],
  [7, 10],
  [2, 15],
];

// Which R64 game winners play each other in R32
// e.g., winner of game 0 (1v16) plays winner of game 1 (8v9)
export const BRACKET_PROGRESSION: [number, number][] = [
  [0, 1], // 1/16 winner vs 8/9 winner
  [2, 3], // 5/12 winner vs 4/13 winner
  [4, 5], // 6/11 winner vs 3/14 winner
  [6, 7], // 7/10 winner vs 2/15 winner
];

// Historical upset rates by seed matchup (1-seed vs 16-seed, etc.)
// Based on men's tournament data 1985-2024
export const HISTORICAL_UPSET_RATES_MENS: Record<string, number> = {
  '1v16': 0.015,
  '2v15': 0.060,
  '3v14': 0.150,
  '4v13': 0.210,
  '5v12': 0.350,
  '6v11': 0.370,
  '7v10': 0.390,
  '8v9': 0.490,
};

// Women's tournament has historically fewer upsets
export const HISTORICAL_UPSET_RATES_WOMENS: Record<string, number> = {
  '1v16': 0.000,
  '2v15': 0.030,
  '3v14': 0.100,
  '4v13': 0.150,
  '5v12': 0.280,
  '6v11': 0.320,
  '7v10': 0.360,
  '8v9': 0.480,
};

// Calibration parameters that differ between men's and women's
export const TOURNAMENT_CALIBRATION = {
  mens: {
    baseVariance: 0.11,
    seedGapSensitivity: 1.0,
    threePointVolatility: 1.0,
    tempoMultiplier: 1.0,
  },
  womens: {
    baseVariance: 0.09,              // Less variance historically
    seedGapSensitivity: 1.15,        // Seeds more predictive
    threePointVolatility: 0.85,      // Slightly less 3PT variance
    tempoMultiplier: 0.95,           // Slightly slower tempo on average
  },
};
