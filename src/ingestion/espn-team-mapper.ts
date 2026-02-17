import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config';

let espnMap: Record<string, string> | null = null;

function loadMap(): Record<string, string> {
  if (espnMap) return espnMap;

  const mapPath = path.join(CONFIG.DATA_DIR, 'espn-team-map.json');
  if (fs.existsSync(mapPath)) {
    espnMap = JSON.parse(fs.readFileSync(mapPath, 'utf-8'));
  } else {
    espnMap = {};
  }
  return espnMap!;
}

/**
 * Resolve an ESPN team ID to an internal team ID.
 * First tries the explicit mapping file, then falls back to fuzzy name matching.
 */
export function resolveEspnTeamId(
  espnId: string | number,
  espnTeamName: string,
  loadedTeams: Map<string, { name: string; shortName: string }>,
): string | null {
  const map = loadMap();
  const mapped = map[String(espnId)];
  if (mapped) return mapped;

  // Fuzzy fallback: match by name or shortName (case-insensitive)
  const lowerName = espnTeamName.toLowerCase();
  for (const [internalId, team] of loadedTeams) {
    if (
      team.name.toLowerCase() === lowerName ||
      team.shortName.toLowerCase() === lowerName
    ) {
      return internalId;
    }
    // Partial match: ESPN might say "Purdue" while internal is "Purdue Boilermakers"
    if (
      team.name.toLowerCase().startsWith(lowerName) ||
      team.shortName.toLowerCase().startsWith(lowerName) ||
      lowerName.startsWith(team.shortName.toLowerCase())
    ) {
      return internalId;
    }
  }

  return null;
}

/**
 * Save a new mapping to the persistent file (for future lookups).
 */
export function saveMapping(espnId: string | number, internalId: string): void {
  const map = loadMap();
  map[String(espnId)] = internalId;

  const mapPath = path.join(CONFIG.DATA_DIR, 'espn-team-map.json');
  fs.writeFileSync(mapPath, JSON.stringify(map, null, 2));
}

/** Reset the cached map (for testing). */
export function resetMapCache(): void {
  espnMap = null;
}
