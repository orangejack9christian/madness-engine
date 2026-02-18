import { Round, Region, TournamentType, LiveGameState } from '../core/types';

export interface BracketSlot {
  slotId: string;
  round: Round;
  region: Region | 'final-four';
  team1Id?: string;
  team2Id?: string;
  winnerId?: string;
  liveGame?: LiveGameState;
  nextSlotId?: string;
  metadata?: Record<string, any>;
}

export interface SerializedBracket {
  tournamentType: TournamentType;
  year: number;
  slots: BracketSlot[];
}
