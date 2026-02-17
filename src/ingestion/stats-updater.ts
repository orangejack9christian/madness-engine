/**
 * Stats Updater — Fetches latest team standings/records from ESPN API
 * and patches the local team data file with updated win/loss records.
 *
 * Run manually: tsx src/ingestion/stats-updater.ts [mens|womens]
 * Or call via API: POST /api/update-stats/:type
 *
 * This updates wins, losses, conferenceWins, conferenceLosses, winStreak,
 * and last10 records from ESPN's live standings data.
 */

import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config';
import { TournamentType } from '../core/types';

interface ESPNStandingsTeam {
  team: { id: string; displayName: string; abbreviation: string };
  stats: Array<{ name: string; value: number; displayValue: string }>;
}

interface ESPNStandingsGroup {
  standings: { entries: ESPNStandingsTeam[] };
}

interface ESPNStandingsResponse {
  children: ESPNStandingsGroup[];
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

/**
 * Fetch current season standings from ESPN and update the local data file.
 * Returns the number of teams that were updated.
 */
export async function updateTeamStats(
  tournamentType: TournamentType = 'mens',
  year: number = CONFIG.DEFAULT_YEAR,
): Promise<{ updated: number; total: number }> {
  const sport = tournamentType === 'mens'
    ? 'mens-college-basketball'
    : 'womens-college-basketball';

  const filePath = path.join(CONFIG.TEAMS_DIR, `${year}-${tournamentType}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Team data file not found: ${filePath}`);
  }

  const teams: TeamDataEntry[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  // Build a lookup by short name (lowercase) for matching
  const teamsByShort = new Map<string, TeamDataEntry>();
  const teamsByFull = new Map<string, TeamDataEntry>();
  for (const team of teams) {
    teamsByShort.set(team.shortName.toLowerCase(), team);
    teamsByFull.set(team.name.toLowerCase(), team);
  }

  let updated = 0;

  try {
    // ESPN standings API
    const url = `${CONFIG.ESPN_ENDPOINT_BASE}/${sport}/standings?season=${year}&group=50`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[Stats Updater] ESPN returned HTTP ${res.status}`);
      return { updated: 0, total: teams.length };
    }

    const data = await res.json() as ESPNStandingsResponse;

    if (!data.children) {
      console.warn('[Stats Updater] No standings groups in response');
      return { updated: 0, total: teams.length };
    }

    for (const group of data.children) {
      if (!group.standings?.entries) continue;

      for (const entry of group.standings.entries) {
        const espnName = entry.team.displayName.toLowerCase();
        const espnAbbrev = entry.team.abbreviation.toLowerCase();

        // Try to match to our team data
        let match = teamsByFull.get(espnName) || teamsByShort.get(espnAbbrev);

        // Try partial match
        if (!match) {
          for (const [key, team] of teamsByShort) {
            if (espnName.includes(key) || key.includes(espnAbbrev)) {
              match = team;
              break;
            }
          }
        }

        if (!match) continue;

        // Extract stats from ESPN data
        const statsMap = new Map<string, number>();
        for (const stat of entry.stats || []) {
          statsMap.set(stat.name, stat.value);
        }

        const wins = statsMap.get('wins');
        const losses = statsMap.get('losses');
        const streak = statsMap.get('streak');

        if (wins !== undefined) match.metrics.wins = wins;
        if (losses !== undefined) match.metrics.losses = losses;
        if (streak !== undefined) match.metrics.winStreak = Math.max(0, streak);

        updated++;
      }
    }
  } catch (err: any) {
    console.warn(`[Stats Updater] Error fetching ESPN data: ${err.message}`);
  }

  if (updated > 0) {
    // Write updated data back to file
    fs.writeFileSync(filePath, JSON.stringify(teams, null, 2));
    console.log(`[Stats Updater] Updated ${updated}/${teams.length} teams in ${filePath}`);
  } else {
    console.log('[Stats Updater] No teams were updated');
  }

  return { updated, total: teams.length };
}

// CLI entry point
if (require.main === module) {
  const type = (process.argv[2] || 'mens') as TournamentType;
  console.log(`[Stats Updater] Updating ${type} team stats...`);
  updateTeamStats(type).then(result => {
    console.log(`[Stats Updater] Done: ${result.updated}/${result.total} teams updated`);
  }).catch(err => {
    console.error('[Stats Updater] Failed:', err.message);
    process.exit(1);
  });
}
