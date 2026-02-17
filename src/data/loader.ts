import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config';
import { Team, TournamentType, MascotProfile, CoachingProfile } from '../core/types';

interface RawTeamData {
  id: string;
  name: string;
  shortName: string;
  seed: number;
  region: string;
  conference: string;
  metrics: Record<string, number>;
}

export function loadTeams(year: number, tournamentType: TournamentType): Team[] {
  const filePath = path.join(CONFIG.TEAMS_DIR, `${year}-${tournamentType}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Team data file not found: ${filePath}`);
  }

  const raw: RawTeamData[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const mascots = loadMascotData();
  const coaching = loadCoachingData();

  return raw.map(team => ({
    id: team.id,
    name: team.name,
    shortName: team.shortName,
    seed: team.seed,
    region: team.region as Team['region'],
    conference: team.conference,
    tournamentType,
    metrics: {
      adjOffensiveEfficiency: team.metrics.adjOffensiveEfficiency ?? 100,
      adjDefensiveEfficiency: team.metrics.adjDefensiveEfficiency ?? 100,
      adjTempo: team.metrics.adjTempo ?? 67,
      strengthOfSchedule: team.metrics.strengthOfSchedule ?? 0,
      nonConferenceSOS: team.metrics.nonConferenceSOS ?? 0,
      effectiveFGPct: team.metrics.effectiveFGPct ?? 0.500,
      threePointRate: team.metrics.threePointRate ?? 0.350,
      threePointPct: team.metrics.threePointPct ?? 0.340,
      freeThrowRate: team.metrics.freeThrowRate ?? 0.300,
      freeThrowPct: team.metrics.freeThrowPct ?? 0.700,
      offensiveReboundPct: team.metrics.offensiveReboundPct ?? 0.300,
      defensiveReboundPct: team.metrics.defensiveReboundPct ?? 0.700,
      turnoverPct: team.metrics.turnoverPct ?? 0.180,
      stealPct: team.metrics.stealPct ?? 0.090,
      averageHeight: team.metrics.averageHeight ?? 77,
      benchMinutesPct: team.metrics.benchMinutesPct ?? 0.35,
      experienceRating: team.metrics.experienceRating ?? 2.0,
      wins: team.metrics.wins ?? 20,
      losses: team.metrics.losses ?? 10,
      conferenceWins: team.metrics.conferenceWins ?? 12,
      conferenceLosses: team.metrics.conferenceLosses ?? 6,
      last10Wins: team.metrics.last10Wins ?? 7,
      last10Losses: team.metrics.last10Losses ?? 3,
      winStreak: team.metrics.winStreak ?? 0,
    },
    mascot: mascots[team.name],
    coaching: coaching[team.name],
  }));
}

function loadMascotData(): Record<string, MascotProfile> {
  const filePath = path.join(CONFIG.DATA_DIR, 'mascots.json');
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function loadCoachingData(): Record<string, CoachingProfile> {
  const filePath = path.join(CONFIG.DATA_DIR, 'coaching-ratings.json');
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}
