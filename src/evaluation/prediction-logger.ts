import { Round, TournamentType } from '../core/types';
import { logPrediction, recordActualWinner, getPredictionLogs } from '../storage/database';
import { computeCalibration, CalibrationResult } from './calibration';

/**
 * Log a win probability prediction for later calibration analysis.
 */
export function logGamePrediction(
  modeId: string,
  gameId: string,
  team1Id: string,
  team2Id: string,
  team1WinProb: number,
  round: Round,
  year: number,
  tournamentType: TournamentType,
): void {
  logPrediction(modeId, gameId, team1Id, team2Id, team1WinProb, round, year, tournamentType);
}

/**
 * Record the actual winner of a game, updating all prediction log entries for that game.
 */
export function recordGameResult(gameId: string, winnerId: string): void {
  recordActualWinner(gameId, winnerId);
}

/**
 * Compute calibration metrics for a mode's predictions in a tournament.
 */
export function evaluateMode(
  modeId: string,
  year: number,
  tournamentType: TournamentType,
): CalibrationResult {
  const logs = getPredictionLogs(modeId, year, tournamentType);

  const predictions = logs.map(log => ({
    predictedTeam1WinProb: log.predictedTeam1WinProb,
    team1Id: log.team1Id,
    actualWinnerId: log.actualWinnerId!,
  }));

  return computeCalibration(predictions);
}
