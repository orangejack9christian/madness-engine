import { Round } from '../core/types';
import { ROUNDS_IN_ORDER, ROUND_INDEX } from '../core/constants';
import { BracketSlot, SerializedBracket } from './types';

/**
 * Mutable bracket state for a single simulation run.
 * Tracks which teams are in each slot and who has won.
 */
export class BracketSimState {
  private slots: Map<string, BracketSlot>;
  private slotsByRound: Map<Round, BracketSlot[]>;

  constructor(bracket: SerializedBracket) {
    this.slots = new Map();
    this.slotsByRound = new Map();

    // Deep-copy slots so mutations don't affect the source
    for (const slot of bracket.slots) {
      const copy = { ...slot };
      this.slots.set(copy.slotId, copy);

      if (!this.slotsByRound.has(copy.round)) {
        this.slotsByRound.set(copy.round, []);
      }
      this.slotsByRound.get(copy.round)!.push(copy);
    }
  }

  getSlot(slotId: string): BracketSlot | undefined {
    return this.slots.get(slotId);
  }

  getSlotsForRound(round: Round): BracketSlot[] {
    return this.slotsByRound.get(round) ?? [];
  }

  /**
   * Record a game result: set the winner and advance them to the next slot.
   */
  setWinner(slotId: string, winnerId: string): void {
    const slot = this.slots.get(slotId);
    if (!slot) throw new Error(`Unknown slot: ${slotId}`);

    slot.winnerId = winnerId;

    // Advance winner to the next slot
    if (slot.nextSlotId) {
      const nextSlot = this.slots.get(slot.nextSlotId);
      if (nextSlot) {
        if (!nextSlot.team1Id) {
          nextSlot.team1Id = winnerId;
        } else {
          nextSlot.team2Id = winnerId;
        }
      }
    }
  }

  /**
   * Get all games that are ready to be played (both teams assigned, no winner yet).
   */
  getReadyGames(): BracketSlot[] {
    const ready: BracketSlot[] = [];
    for (const slot of this.slots.values()) {
      if (slot.team1Id && slot.team2Id && !slot.winnerId) {
        ready.push(slot);
      }
    }
    return ready;
  }

  /**
   * Get all games for a specific round that are ready to be played.
   */
  getReadyGamesForRound(round: Round): BracketSlot[] {
    return this.getSlotsForRound(round).filter(
      s => s.team1Id && s.team2Id && !s.winnerId
    );
  }

  /**
   * Get the champion (winner of the championship slot).
   */
  getChampion(): string | undefined {
    const champSlot = this.slots.get('championship');
    return champSlot?.winnerId;
  }

  /**
   * Get all rounds that still have unresolved games.
   */
  getActiveRounds(): Round[] {
    return ROUNDS_IN_ORDER.filter(round => {
      const slots = this.getSlotsForRound(round);
      return slots.some(s => s.team1Id && s.team2Id && !s.winnerId)
        || slots.some(s => (!s.team1Id || !s.team2Id) && !s.winnerId);
    });
  }

  /**
   * Collect all teams that reached at least the given round.
   * A team "reached" a round if they appear in any slot of that round.
   */
  getTeamsInRound(round: Round): string[] {
    const teams = new Set<string>();
    for (const slot of this.getSlotsForRound(round)) {
      if (slot.team1Id) teams.add(slot.team1Id);
      if (slot.team2Id) teams.add(slot.team2Id);
    }
    return [...teams];
  }
}
