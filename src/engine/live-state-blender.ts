import { Team, LiveGameState } from '../core/types';
import { BracketSlot, SerializedBracket } from '../bracket/types';

export interface LiveAdjustedBracket {
  /** Bracket with live games and completed results filled in */
  bracket: SerializedBracket;
  /** Slot IDs of games currently in progress */
  activeGameSlots: string[];
  /** Slot IDs of games that have been completed and locked */
  completedGameSlots: string[];
}

/**
 * Manages attaching live game states to bracket slots and locking completed results.
 * The actual probability math is done in bracket-propagator.ts which reads slot.liveGame.
 */
export class LiveStateBlender {
  private baseBracket: SerializedBracket;
  private teams: Team[];
  private lockedSlots: Set<string> = new Set();

  constructor(baseBracket: SerializedBracket, teams: Team[]) {
    this.baseBracket = baseBracket;
    this.teams = teams;
  }

  /**
   * Apply all current live game states to produce a bracket with liveGame fields attached.
   * Called by the real-time loop on every meaningful state change.
   */
  blend(liveGames: Map<string, LiveGameState>): LiveAdjustedBracket {
    const activeGameSlots: string[] = [];
    const completedGameSlots: string[] = [];

    const adjustedSlots: BracketSlot[] = this.baseBracket.slots.map(slot => {
      // Skip locked slots — their winnerId is already set
      if (this.lockedSlots.has(slot.slotId)) {
        completedGameSlots.push(slot.slotId);
        return { ...slot };
      }

      // Try to find a live game for this slot
      const liveGame = this.findLiveGameForSlot(slot, liveGames);
      if (!liveGame) {
        return { ...slot };
      }

      if (liveGame.status === 'final') {
        // Game is done — lock the result
        const winnerId = liveGame.homeScore > liveGame.awayScore
          ? liveGame.homeTeamId
          : liveGame.awayTeamId;

        completedGameSlots.push(slot.slotId);
        return { ...slot, winnerId, liveGame };
      }

      if (liveGame.status === 'in-progress' || liveGame.status === 'halftime') {
        activeGameSlots.push(slot.slotId);
        return { ...slot, liveGame };
      }

      return { ...slot, liveGame };
    });

    return {
      bracket: {
        ...this.baseBracket,
        slots: adjustedSlots,
      },
      activeGameSlots,
      completedGameSlots,
    };
  }

  /**
   * Lock a completed game's result into the bracket permanently.
   * This modifies the base bracket so future blends already have the result.
   */
  lockResult(slotId: string, winnerId: string): void {
    this.lockedSlots.add(slotId);

    // Update the base bracket
    const slot = this.baseBracket.slots.find(s => s.slotId === slotId);
    if (slot) {
      slot.winnerId = winnerId;
      delete slot.liveGame;

      // Advance winner to next slot
      if (slot.nextSlotId) {
        const nextSlot = this.baseBracket.slots.find(s => s.slotId === slot.nextSlotId);
        if (nextSlot) {
          if (!nextSlot.team1Id) {
            nextSlot.team1Id = winnerId;
          } else {
            nextSlot.team2Id = winnerId;
          }
        }
      }
    }
  }

  /**
   * Find a live game that matches a bracket slot by team IDs.
   */
  private findLiveGameForSlot(
    slot: BracketSlot,
    liveGames: Map<string, LiveGameState>,
  ): LiveGameState | null {
    if (!slot.team1Id || !slot.team2Id) return null;

    for (const game of liveGames.values()) {
      const teams = new Set([game.homeTeamId, game.awayTeamId]);
      if (teams.has(slot.team1Id) && teams.has(slot.team2Id)) {
        return game;
      }
    }

    return null;
  }
}
