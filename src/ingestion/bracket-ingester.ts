/**
 * Bracket Ingester — Pulls the official NCAA Tournament bracket from ESPN
 * and creates/updates the local team data file with seeds, regions, and records.
 *
 * Run manually:  tsx src/ingestion/bracket-ingester.ts [mens|womens] [year]
 * Or call via API: POST /api/ingest-bracket/:type
 *
 * ESPN endpoints used:
 *   1) Tournament bracket: /apis/site/v2/sports/basketball/{sport}/scoreboard
 *      with ?dates={year}0301-{year}0410&groups=100&limit=100
 *   2) Team details: /apis/site/v2/sports/basketball/{sport}/teams/{id}
 *   3) Standings (for win/loss): reuses stats-updater
 *
 * This is designed to run once on Selection Sunday (mid-March) when the
 * bracket is announced, and again if corrections are needed.
 */

import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config';
import { TournamentType, Region } from '../core/types';

// --- ESPN response types ---

interface ESPNTeamRef {
  id: string;
  displayName: string;
  shortDisplayName: string;
  abbreviation: string;
}

interface ESPNCompetitor {
  id: string;
  team: ESPNTeamRef;
  curatedRank?: { current: number };
  score?: string;
  winner?: boolean;
}

interface ESPNCompetition {
  id: string;
  competitors: ESPNCompetitor[];
  status: { type: { completed: boolean; description: string } };
  notes?: Array<{ headline: string }>;
}

interface ESPNEvent {
  id: string;
  name: string;
  season: { year: number };
  competitions: ESPNCompetition[];
}

interface ESPNScoreboardResponse {
  events: ESPNEvent[];
}

interface ESPNSeasonInfo {
  type: number;
  year: number;
}

interface ESPNTeamRecord {
  items: Array<{ summary: string; type: string }>;
}

interface ESPNTeamDetail {
  team: {
    id: string;
    displayName: string;
    shortDisplayName: string;
    abbreviation: string;
    conference?: { name: string; shortName: string };
    record?: { items: Array<{ summary: string; type: string }> };
  };
}

// --- Internal types ---

interface BracketTeamEntry {
  espnId: string;
  name: string;
  shortName: string;
  seed: number;
  region: Region;
  conference: string;
}

interface TeamDataEntry {
  id: string;
  name: string;
  shortName: string;
  seed: number;
  region: string;
  conference: string;
  metrics: Record<string, number>;
}

// Region mapping from ESPN bracket group names / notes
const REGION_KEYWORDS: Record<string, Region> = {
  east: 'east',
  west: 'west',
  south: 'south',
  midwest: 'midwest',
};

function inferRegion(eventName: string, notes: string[]): Region | null {
  const searchText = [eventName, ...notes].join(' ').toLowerCase();
  for (const [keyword, region] of Object.entries(REGION_KEYWORDS)) {
    if (searchText.includes(keyword)) return region;
  }
  return null;
}

function makeTeamId(shortName: string, year: number): string {
  return shortName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') + `-${year}`;
}

/**
 * Fetch the NCAA tournament scoreboard from ESPN and extract the 68-team bracket.
 */
async function fetchBracketFromESPN(
  tournamentType: TournamentType,
  year: number,
): Promise<BracketTeamEntry[]> {
  const sport = tournamentType === 'mens'
    ? 'mens-college-basketball'
    : 'womens-college-basketball';

  // ESPN groups=100 is the NCAA tournament group for bracket events
  // Try the tournament scoreboard endpoint first
  const seasonType = 3; // 3 = postseason
  const url = `${CONFIG.ESPN_ENDPOINT_BASE}/${sport}/scoreboard?dates=${year}0301-${year}0410&groups=100&limit=100&seasontype=${seasonType}`;

  console.log(`[Bracket Ingester] Fetching: ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`ESPN returned HTTP ${res.status} for scoreboard`);
  }

  const data = await res.json() as ESPNScoreboardResponse;
  if (!data.events || data.events.length === 0) {
    throw new Error('No tournament events found. The bracket may not be announced yet.');
  }

  console.log(`[Bracket Ingester] Found ${data.events.length} tournament events`);

  // Collect all unique teams with their seeds and regions
  const teamsMap = new Map<string, BracketTeamEntry>();

  for (const event of data.events) {
    const notes = (event.competitions[0]?.notes || []).map(n => n.headline);
    const region = inferRegion(event.name, notes);

    for (const comp of event.competitions) {
      for (const competitor of comp.competitors) {
        if (teamsMap.has(competitor.id)) continue;

        const seed = competitor.curatedRank?.current ?? 0;
        if (seed === 0) continue; // Skip unseeded / non-bracket teams

        teamsMap.set(competitor.id, {
          espnId: competitor.id,
          name: competitor.team.displayName,
          shortName: competitor.team.shortDisplayName,
          seed,
          region: region || 'east', // placeholder if region can't be inferred
          conference: '', // filled in later
        });
      }
    }
  }

  // If the scoreboard approach didn't yield enough teams, try the bracket-specific endpoint
  if (teamsMap.size < 60) {
    console.log(`[Bracket Ingester] Only found ${teamsMap.size} teams from scoreboard, trying bracket endpoint...`);
    await tryBracketEndpoint(sport, year, teamsMap);
  }

  console.log(`[Bracket Ingester] Extracted ${teamsMap.size} teams from ESPN bracket`);
  return Array.from(teamsMap.values());
}

/**
 * Fallback: Try the dedicated bracket/events endpoint.
 */
async function tryBracketEndpoint(
  sport: string,
  year: number,
  teamsMap: Map<string, BracketTeamEntry>,
): Promise<void> {
  // ESPN bracket endpoint
  const url = `${CONFIG.ESPN_ENDPOINT_BASE}/${sport}/scoreboard?season=${year}&seasontype=3&groups=100&limit=200`;

  try {
    const res = await fetch(url);
    if (!res.ok) return;

    const data = await res.json() as ESPNScoreboardResponse;
    if (!data.events) return;

    for (const event of data.events) {
      const notes = (event.competitions[0]?.notes || []).map(n => n.headline);
      const region = inferRegion(event.name, notes);

      for (const comp of event.competitions) {
        for (const competitor of comp.competitors) {
          if (teamsMap.has(competitor.id)) continue;

          const seed = competitor.curatedRank?.current ?? 0;
          if (seed === 0) continue;

          teamsMap.set(competitor.id, {
            espnId: competitor.id,
            name: competitor.team.displayName,
            shortName: competitor.team.shortDisplayName,
            seed,
            region: region || 'east',
            conference: '',
          });
        }
      }
    }
  } catch {
    console.warn('[Bracket Ingester] Bracket endpoint fallback failed');
  }
}

/**
 * Fetch team details (conference, record) from ESPN for each team.
 */
async function enrichTeamDetails(
  teams: BracketTeamEntry[],
  sport: string,
): Promise<Map<string, { conference: string; wins: number; losses: number }>> {
  const details = new Map<string, { conference: string; wins: number; losses: number }>();

  // Batch fetch team details (with rate limiting)
  const batchSize = 10;
  for (let i = 0; i < teams.length; i += batchSize) {
    const batch = teams.slice(i, i + batchSize);

    const results = await Promise.allSettled(
      batch.map(async (team) => {
        const url = `${CONFIG.ESPN_ENDPOINT_BASE}/${sport}/teams/${team.espnId}`;
        const res = await fetch(url);
        if (!res.ok) return null;

        const data = await res.json() as ESPNTeamDetail;
        const confName = data.team.conference?.shortName || data.team.conference?.name || '';

        let wins = 0;
        let losses = 0;
        if (data.team.record?.items) {
          const overall = data.team.record.items.find(r => r.type === 'total') || data.team.record.items[0];
          if (overall) {
            const parts = overall.summary.split('-').map(Number);
            if (parts.length >= 2) {
              wins = parts[0] || 0;
              losses = parts[1] || 0;
            }
          }
        }

        return { id: team.espnId, conference: confName, wins, losses };
      }),
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        details.set(result.value.id, {
          conference: result.value.conference,
          wins: result.value.wins,
          losses: result.value.losses,
        });
      }
    }

    // Small delay between batches to be polite to ESPN's API
    if (i + batchSize < teams.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  return details;
}

/**
 * Main ingestion function: fetch bracket from ESPN, enrich with team details,
 * merge with existing data (preserving advanced metrics), and write the JSON file.
 */
export async function ingestBracket(
  tournamentType: TournamentType = 'mens',
  year: number = CONFIG.DEFAULT_YEAR,
): Promise<{ created: number; updated: number; total: number }> {
  const sport = tournamentType === 'mens'
    ? 'mens-college-basketball'
    : 'womens-college-basketball';

  // Step 1: Fetch bracket teams from ESPN
  const bracketTeams = await fetchBracketFromESPN(tournamentType, year);

  if (bracketTeams.length === 0) {
    throw new Error('No bracket teams found. The bracket may not have been announced yet.');
  }

  // Step 2: Enrich with conference + record data
  console.log(`[Bracket Ingester] Enriching ${bracketTeams.length} teams with details...`);
  const details = await enrichTeamDetails(bracketTeams, sport);

  // Step 3: Load existing team data if it exists (to preserve advanced metrics)
  const filePath = path.join(CONFIG.TEAMS_DIR, `${year}-${tournamentType}.json`);
  let existingTeams: TeamDataEntry[] = [];
  const existingById = new Map<string, TeamDataEntry>();

  if (fs.existsSync(filePath)) {
    existingTeams = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    for (const team of existingTeams) {
      existingById.set(team.id, team);
      // Also index by short name for fuzzy matching
      existingById.set(team.shortName.toLowerCase(), team);
    }
  }

  // Step 4: Build final team list
  let created = 0;
  let updated = 0;
  const finalTeams: TeamDataEntry[] = [];

  for (const bt of bracketTeams) {
    const teamId = makeTeamId(bt.shortName, year);
    const detail = details.get(bt.espnId);
    const conference = detail?.conference || bt.conference || 'Unknown';
    const wins = detail?.wins ?? 20;
    const losses = detail?.losses ?? 10;

    // Try to find existing team data to preserve advanced metrics
    const existing = existingById.get(teamId) || existingById.get(bt.shortName.toLowerCase());

    if (existing) {
      // Update bracket info (seed, region, conference, record) but keep advanced metrics
      existing.seed = bt.seed;
      existing.region = bt.region;
      existing.conference = conference;
      existing.name = bt.name;
      existing.shortName = bt.shortName;
      existing.id = teamId;
      existing.metrics.wins = wins;
      existing.metrics.losses = losses;
      finalTeams.push(existing);
      updated++;
    } else {
      // New team — create with default metrics
      finalTeams.push({
        id: teamId,
        name: bt.name,
        shortName: bt.shortName,
        seed: bt.seed,
        region: bt.region,
        conference,
        metrics: {
          adjOffensiveEfficiency: 100,
          adjDefensiveEfficiency: 100,
          adjTempo: 67,
          strengthOfSchedule: 0,
          nonConferenceSOS: 0,
          effectiveFGPct: 0.500,
          threePointRate: 0.350,
          threePointPct: 0.340,
          freeThrowRate: 0.300,
          freeThrowPct: 0.700,
          offensiveReboundPct: 0.300,
          defensiveReboundPct: 0.700,
          turnoverPct: 0.180,
          stealPct: 0.090,
          averageHeight: 77,
          benchMinutesPct: 0.35,
          experienceRating: 2.0,
          wins,
          losses,
          conferenceWins: 0,
          conferenceLosses: 0,
          last10Wins: 7,
          last10Losses: 3,
          winStreak: 0,
        },
      });
      created++;
    }
  }

  // Sort by seed (ascending), then region
  finalTeams.sort((a, b) => a.seed - b.seed || a.region.localeCompare(b.region));

  // Step 5: Write updated team data
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(finalTeams, null, 2));

  console.log(`[Bracket Ingester] Wrote ${finalTeams.length} teams to ${filePath}`);
  console.log(`[Bracket Ingester] Created: ${created}, Updated: ${updated}`);

  return { created, updated, total: finalTeams.length };
}

// --- CLI entry point ---

if (require.main === module) {
  const type = (process.argv[2] || 'mens') as TournamentType;
  const year = parseInt(process.argv[3] || String(CONFIG.DEFAULT_YEAR));

  console.log(`[Bracket Ingester] Ingesting ${type} bracket for ${year}...`);
  console.log(`[Bracket Ingester] ESPN base: ${CONFIG.ESPN_ENDPOINT_BASE}`);

  ingestBracket(type, year)
    .then(result => {
      console.log(`[Bracket Ingester] Done!`);
      console.log(`  Total teams: ${result.total}`);
      console.log(`  Created (new): ${result.created}`);
      console.log(`  Updated (existing): ${result.updated}`);
    })
    .catch(err => {
      console.error('[Bracket Ingester] Failed:', err.message);
      process.exit(1);
    });
}
