import { Team, TournamentType, Region, Round } from '../core/types';
import { REGIONS, SEED_MATCHUPS, BRACKET_PROGRESSION } from '../core/constants';
import { BracketSlot, SerializedBracket } from './types';

/**
 * Build a full 64-team tournament bracket from a list of seeded teams.
 * Returns a serializable bracket structure with all slots connected.
 *
 * Bracket slot naming convention:
 *   {region}-r{roundNum}-g{gameNum}  for regional rounds
 *   ff-g{1|2}                        for Final Four
 *   championship                     for the final
 */
export function buildBracket(
  teams: Team[],
  year: number,
  tournamentType: TournamentType,
): SerializedBracket {
  const slots: BracketSlot[] = [];
  const teamsByRegionAndSeed = new Map<string, Team>();

  for (const team of teams) {
    teamsByRegionAndSeed.set(`${team.region}-${team.seed}`, team);
  }

  // Build each region independently (rounds 1-4)
  for (const region of REGIONS) {
    buildRegion(region, teamsByRegionAndSeed, slots);
  }

  // Final Four (2 games)
  // East winner vs West winner, South winner vs Midwest winner (standard bracket)
  const ff1Id = 'ff-g1';
  const ff2Id = 'ff-g2';
  const champId = 'championship';

  // Connect Elite Eight winners to Final Four
  const eastE8 = `east-r4-g1`;
  const westE8 = `west-r4-g1`;
  const southE8 = `south-r4-g1`;
  const midwestE8 = `midwest-r4-g1`;

  updateSlotNextId(slots, eastE8, ff1Id);
  updateSlotNextId(slots, westE8, ff1Id);
  updateSlotNextId(slots, southE8, ff2Id);
  updateSlotNextId(slots, midwestE8, ff2Id);

  slots.push({
    slotId: ff1Id,
    round: 'final-four',
    region: 'final-four',
    nextSlotId: champId,
  });

  slots.push({
    slotId: ff2Id,
    round: 'final-four',
    region: 'final-four',
    nextSlotId: champId,
  });

  // Championship
  slots.push({
    slotId: champId,
    round: 'championship',
    region: 'final-four',
  });

  return { tournamentType, year, slots };
}

function buildRegion(
  region: Region,
  teamMap: Map<string, Team>,
  slots: BracketSlot[],
): void {
  // Round 1: Round of 64 (8 games per region)
  for (let g = 0; g < 8; g++) {
    const [seed1, seed2] = SEED_MATCHUPS[g];
    const team1 = teamMap.get(`${region}-${seed1}`);
    const team2 = teamMap.get(`${region}-${seed2}`);
    const slotId = `${region}-r1-g${g + 1}`;
    const nextSlotId = `${region}-r2-g${Math.floor(g / 2) + 1}`;

    slots.push({
      slotId,
      round: 'round-of-64',
      region,
      team1Id: team1?.id,
      team2Id: team2?.id,
      nextSlotId,
    });
  }

  // Round 2: Round of 32 (4 games per region)
  for (let g = 0; g < 4; g++) {
    const slotId = `${region}-r2-g${g + 1}`;
    const nextSlotId = `${region}-r3-g${Math.floor(g / 2) + 1}`;

    slots.push({
      slotId,
      round: 'round-of-32',
      region,
      nextSlotId,
    });
  }

  // Round 3: Sweet Sixteen (2 games per region)
  for (let g = 0; g < 2; g++) {
    const slotId = `${region}-r3-g${g + 1}`;
    const nextSlotId = `${region}-r4-g1`;

    slots.push({
      slotId,
      round: 'sweet-sixteen',
      region,
      nextSlotId,
    });
  }

  // Round 4: Elite Eight (1 game per region)
  slots.push({
    slotId: `${region}-r4-g1`,
    round: 'elite-eight',
    region,
    // nextSlotId set by Final Four construction
  });
}

function updateSlotNextId(slots: BracketSlot[], slotId: string, nextSlotId: string): void {
  const slot = slots.find(s => s.slotId === slotId);
  if (slot) slot.nextSlotId = nextSlotId;
}

/**
 * Create a lookup from teamId to the team's initial slot in the bracket.
 */
export function getTeamStartingSlots(bracket: SerializedBracket): Map<string, string> {
  const result = new Map<string, string>();
  for (const slot of bracket.slots) {
    if (slot.round === 'round-of-64') {
      if (slot.team1Id) result.set(slot.team1Id, slot.slotId);
      if (slot.team2Id) result.set(slot.team2Id, slot.slotId);
    }
  }
  return result;
}
