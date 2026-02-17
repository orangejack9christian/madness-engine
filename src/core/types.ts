// === TOURNAMENT STRUCTURE ===

export type TournamentType = 'mens' | 'womens';

export type Round =
  | 'first-four'
  | 'round-of-64'
  | 'round-of-32'
  | 'sweet-sixteen'
  | 'elite-eight'
  | 'final-four'
  | 'championship';

export type Region = 'east' | 'west' | 'south' | 'midwest';

export interface TeamMetrics {
  adjOffensiveEfficiency: number;   // Points per 100 possessions, adjusted
  adjDefensiveEfficiency: number;   // Points allowed per 100 possessions, adjusted
  adjTempo: number;                 // Possessions per 40 minutes, adjusted

  strengthOfSchedule: number;       // SOS rating
  nonConferenceSOS: number;

  effectiveFGPct: number;           // eFG%
  threePointRate: number;           // 3PA / FGA
  threePointPct: number;            // 3P%
  freeThrowRate: number;            // FTA / FGA
  freeThrowPct: number;             // FT%

  offensiveReboundPct: number;      // OR%
  defensiveReboundPct: number;      // DR%

  turnoverPct: number;              // TO%
  stealPct: number;                 // STL%

  averageHeight: number;            // Inches, team average
  benchMinutesPct: number;          // % of minutes from non-starters
  experienceRating: number;         // Composite years of experience

  wins: number;
  losses: number;
  conferenceWins: number;
  conferenceLosses: number;

  last10Wins: number;
  last10Losses: number;
  winStreak: number;
}

export interface MascotProfile {
  name: string;
  combatRating: number;             // 1-100
  size: 'tiny' | 'small' | 'medium' | 'large' | 'massive';
  type: 'animal' | 'human' | 'mythical' | 'object' | 'abstract' | 'force-of-nature';
  specialAbility?: string;
  flightCapable: boolean;
  intimidationFactor: number;       // 1-10
}

export interface CoachingProfile {
  name: string;
  tournamentWins: number;
  tournamentLosses: number;
  finalFourAppearances: number;
  championships: number;
  yearsExperience: number;
  seedOverperformance: number;      // Average seed advancement vs expected
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  seed: number;
  region: Region;
  conference: string;
  tournamentType: TournamentType;
  metrics: TeamMetrics;
  mascot?: MascotProfile;
  coaching?: CoachingProfile;
}

// === LIVE GAME STATE ===

export interface LiveGameState {
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  round: Round;

  homeScore: number;
  awayScore: number;
  period: number;                   // 1 = first half, 2 = second half, 3+ = OT
  timeRemainingSeconds: number;

  possession: 'home' | 'away' | null;

  homeFouls: number;
  awayFouls: number;
  homeInBonus: boolean;
  awayInBonus: boolean;

  homeFGM: number;
  homeFGA: number;
  home3PM: number;
  home3PA: number;
  homeFTM: number;
  homeFTA: number;
  awayFGM: number;
  awayFGA: number;
  away3PM: number;
  away3PA: number;
  awayFTM: number;
  awayFTA: number;

  lastScoringRun: { team: 'home' | 'away'; points: number };
  timeoutsRemaining: { home: number; away: number };

  status: 'pre-game' | 'in-progress' | 'halftime' | 'final';
  lastUpdated: number;
}

// === BRACKET ===

export interface BracketSlot {
  slotId: string;                   // e.g., "east-r1-g1"
  round: Round;
  region: Region | 'final-four';
  team1Id?: string;
  team2Id?: string;
  winnerId?: string;
  liveGame?: LiveGameState;
  nextSlotId?: string;              // Winner advances here
}

export interface BracketState {
  tournamentType: TournamentType;
  year: number;
  slots: Map<string, BracketSlot>;
}

// === SIMULATION RESULTS ===

export interface GameSimulationResult {
  team1Id: string;
  team2Id: string;
  team1WinProbability: number;
  team2WinProbability: number;
  expectedScore: {
    team1Mean: number;
    team1StdDev: number;
    team2Mean: number;
    team2StdDev: number;
  };
  upsetProbability: number;
  overtimeProbability: number;
  simulationCount: number;
}

export interface TeamTournamentResult {
  teamId: string;
  teamName: string;
  seed: number;
  region: Region;

  roundProbabilities: Record<Round, number>;
  championshipProbability: number;
  expectedWins: number;
}

export interface TournamentSimulationResult {
  modeId: string;
  modeName: string;
  tournamentType: TournamentType;
  timestamp: number;
  simulationCount: number;

  teamResults: Map<string, TeamTournamentResult>;

  mostLikelyFinalFour: string[];
  mostLikelyChampion: string;
  biggestProjectedUpset: {
    round: Round;
    favoriteTeamId: string;
    underdogTeamId: string;
    favoriteSeed: number;
    underdogSeed: number;
    underdogWinPct: number;
  } | null;
  volatilityIndex: number;
}
