import { TournamentSimulationResult, TeamTournamentResult, Round } from '../core/types';

export interface OutputReport {
  title: string;
  modeId: string;
  modeName: string;
  confidenceTag: string;
  generatedAt: string;
  simulationCount: number;
  championshipOdds: ChampionshipOddsRow[];
  finalFourOdds: TeamOddsRow[];
  regionBreakdowns: RegionBreakdown[];
  biggestUpset: string | null;
  volatilityIndex: number;
}

export interface ChampionshipOddsRow {
  rank: number;
  teamId: string;
  seed: number;
  teamName: string;
  region: string;
  championPct: string;
  finalFourPct: string;
  eliteEightPct: string;
  sweetSixteenPct: string;
  expectedWins: string;
}

export interface TeamOddsRow {
  teamId: string;
  seed: number;
  teamName: string;
  region: string;
  probability: string;
}

export interface RegionBreakdown {
  region: string;
  teams: {
    teamId: string;
    seed: number;
    teamName: string;
    roundOf32Pct: string;
    sweetSixteenPct: string;
    eliteEightPct: string;
    finalFourPct: string;
  }[];
}
