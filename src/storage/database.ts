import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config';
import {
  Team,
  TournamentType,
  GameSimulationResult,
  TeamTournamentResult,
  Round,
} from '../core/types';

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (db) return db;

  const dir = path.dirname(CONFIG.DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(CONFIG.DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  initializeSchema(db);
  return db;
}

function initializeSchema(database: Database.Database): void {
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  database.exec(schema);
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// === Team Operations ===

export function upsertTeam(team: Team, year: number): void {
  const database = getDatabase();
  const stmt = database.prepare(`
    INSERT OR REPLACE INTO teams (id, name, short_name, seed, region, conference, tournament_type, metrics_json, mascot_json, coaching_json, year)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    team.id,
    team.name,
    team.shortName,
    team.seed,
    team.region,
    team.conference,
    team.tournamentType,
    JSON.stringify(team.metrics),
    team.mascot ? JSON.stringify(team.mascot) : null,
    team.coaching ? JSON.stringify(team.coaching) : null,
    year,
  );
}

export function upsertTeams(teams: Team[], year: number): void {
  const database = getDatabase();
  const upsert = database.transaction((teamList: Team[]) => {
    for (const team of teamList) {
      upsertTeam(team, year);
    }
  });
  upsert(teams);
}

export function getTeams(year: number, tournamentType: TournamentType): Team[] {
  const database = getDatabase();
  const rows = database.prepare(
    'SELECT * FROM teams WHERE year = ? AND tournament_type = ?'
  ).all(year, tournamentType) as any[];

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    seed: row.seed,
    region: row.region,
    conference: row.conference,
    tournamentType: row.tournament_type,
    metrics: JSON.parse(row.metrics_json),
    mascot: row.mascot_json ? JSON.parse(row.mascot_json) : undefined,
    coaching: row.coaching_json ? JSON.parse(row.coaching_json) : undefined,
  }));
}

// === Game Simulation Operations ===

export function insertGameSimulation(
  modeId: string,
  gameId: string,
  round: Round,
  result: GameSimulationResult,
): void {
  const database = getDatabase();
  database.prepare(`
    INSERT INTO game_simulations (mode_id, game_id, team1_id, team2_id, team1_win_prob, team2_win_prob, upset_prob, overtime_prob, expected_score_json, simulation_count, round, computed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    modeId,
    gameId,
    result.team1Id,
    result.team2Id,
    result.team1WinProbability,
    result.team2WinProbability,
    result.upsetProbability,
    result.overtimeProbability,
    JSON.stringify(result.expectedScore),
    result.simulationCount,
    round,
    Date.now(),
  );
}

// === Team Advancement Operations ===

export function upsertTeamAdvancement(
  modeId: string,
  year: number,
  tournamentType: TournamentType,
  result: TeamTournamentResult,
): void {
  const database = getDatabase();
  database.prepare(`
    INSERT OR REPLACE INTO team_advancement
      (team_id, mode_id, year, tournament_type, round_of_32_prob, sweet_16_prob, elite_8_prob, final_4_prob, championship_game_prob, champion_prob, expected_wins, computed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    result.teamId,
    modeId,
    year,
    tournamentType,
    result.roundProbabilities['round-of-32'] ?? 0,
    result.roundProbabilities['sweet-sixteen'] ?? 0,
    result.roundProbabilities['elite-eight'] ?? 0,
    result.roundProbabilities['final-four'] ?? 0,
    result.roundProbabilities['championship'] ?? 0,
    result.championshipProbability,
    result.expectedWins,
    Date.now(),
  );
}

export function upsertTeamAdvancements(
  modeId: string,
  year: number,
  tournamentType: TournamentType,
  results: TeamTournamentResult[],
): void {
  const database = getDatabase();
  const upsert = database.transaction((resultList: TeamTournamentResult[]) => {
    for (const result of resultList) {
      upsertTeamAdvancement(modeId, year, tournamentType, result);
    }
  });
  upsert(results);
}

export function getTeamAdvancements(
  modeId: string,
  year: number,
  tournamentType: TournamentType,
): TeamTournamentResult[] {
  const database = getDatabase();
  const rows = database.prepare(`
    SELECT ta.*, t.name, t.seed, t.region
    FROM team_advancement ta
    JOIN teams t ON ta.team_id = t.id AND t.year = ta.year AND t.tournament_type = ta.tournament_type
    WHERE ta.mode_id = ? AND ta.year = ? AND ta.tournament_type = ?
    ORDER BY ta.champion_prob DESC
  `).all(modeId, year, tournamentType) as any[];

  return rows.map(row => ({
    teamId: row.team_id,
    teamName: row.name,
    seed: row.seed,
    region: row.region,
    roundProbabilities: {
      'first-four': 1,
      'round-of-64': 1,
      'round-of-32': row.round_of_32_prob,
      'sweet-sixteen': row.sweet_16_prob,
      'elite-eight': row.elite_8_prob,
      'final-four': row.final_4_prob,
      'championship': row.championship_game_prob,
    } as Record<Round, number>,
    championshipProbability: row.champion_prob,
    expectedWins: row.expected_wins,
  }));
}

// === Live Game Operations ===

export function upsertLiveGame(
  gameId: string,
  slotId: string,
  year: number,
  tournamentType: TournamentType,
  state: import('../core/types').LiveGameState,
): void {
  const database = getDatabase();
  database.prepare(`
    INSERT OR REPLACE INTO live_games (game_id, slot_id, year, tournament_type, state_json, last_updated)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(gameId, slotId, year, tournamentType, JSON.stringify(state), Date.now());
}

export function getLiveGames(
  year: number,
  tournamentType: TournamentType,
): import('../core/types').LiveGameState[] {
  const database = getDatabase();
  const rows = database.prepare(
    'SELECT state_json FROM live_games WHERE year = ? AND tournament_type = ?'
  ).all(year, tournamentType) as any[];
  return rows.map(r => JSON.parse(r.state_json));
}

export function deleteLiveGame(gameId: string): void {
  const database = getDatabase();
  database.prepare('DELETE FROM live_games WHERE game_id = ?').run(gameId);
}

export function clearLiveGames(): void {
  const database = getDatabase();
  database.prepare('DELETE FROM live_games').run();
}

// === Prediction Log Operations ===

export function logPrediction(
  modeId: string,
  gameId: string,
  team1Id: string,
  team2Id: string,
  predictedTeam1WinProb: number,
  round: Round,
  year: number,
  tournamentType: TournamentType,
): void {
  const database = getDatabase();
  database.prepare(`
    INSERT INTO prediction_log (mode_id, game_id, team1_id, team2_id, predicted_team1_win_prob, round, year, tournament_type, logged_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(modeId, gameId, team1Id, team2Id, predictedTeam1WinProb, round, year, tournamentType, Date.now());
}

export function recordActualWinner(gameId: string, winnerId: string): void {
  const database = getDatabase();
  database.prepare(`
    UPDATE prediction_log SET actual_winner_id = ? WHERE game_id = ? AND actual_winner_id IS NULL
  `).run(winnerId, gameId);
}

export function getPredictionLogs(
  modeId: string,
  year: number,
  tournamentType: TournamentType,
): Array<{ predictedTeam1WinProb: number; team1Id: string; actualWinnerId: string | null }> {
  const database = getDatabase();
  return database.prepare(`
    SELECT predicted_team1_win_prob, team1_id, actual_winner_id
    FROM prediction_log
    WHERE mode_id = ? AND year = ? AND tournament_type = ? AND actual_winner_id IS NOT NULL
  `).all(modeId, year, tournamentType) as any[];
}

// === Feedback Operations ===

export function insertFeedback(
  type: string,
  message: string,
  modeId: string | null,
  view: string | null,
  userAgent: string | null,
): void {
  const database = getDatabase();
  database.prepare(`
    INSERT INTO feedback (type, message, mode_id, view, user_agent, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(type, message, modeId, view, userAgent, Date.now());
}

export function getFeedbackEntries(limit: number = 50): Array<{
  id: number;
  type: string;
  message: string;
  mode_id: string | null;
  view: string | null;
  created_at: number;
}> {
  const database = getDatabase();
  return database.prepare(
    'SELECT id, type, message, mode_id, view, created_at FROM feedback ORDER BY created_at DESC LIMIT ?'
  ).all(limit) as any[];
}

// === Bracket Challenge Operations ===

export function saveBracketChallenge(
  id: string,
  displayName: string,
  tournamentType: TournamentType,
  year: number,
  picks: Record<string, string>,
): void {
  const database = getDatabase();
  database.prepare(`
    INSERT OR REPLACE INTO bracket_challenges (id, display_name, tournament_type, year, picks_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, displayName, tournamentType, year, JSON.stringify(picks), Date.now());
}

export function getBracketChallenge(id: string): {
  id: string;
  display_name: string;
  tournament_type: string;
  year: number;
  picks_json: string;
  score: number | null;
  correct_picks: number;
  total_picks: number;
  created_at: number;
} | undefined {
  const database = getDatabase();
  return database.prepare(
    'SELECT * FROM bracket_challenges WHERE id = ?'
  ).get(id) as any;
}

export function getBracketChallengeLeaderboard(
  year: number,
  tournamentType: TournamentType,
  limit: number = 50,
): Array<{
  id: string;
  display_name: string;
  score: number | null;
  correct_picks: number;
  total_picks: number;
  created_at: number;
}> {
  const database = getDatabase();
  return database.prepare(`
    SELECT id, display_name, score, correct_picks, total_picks, created_at
    FROM bracket_challenges
    WHERE year = ? AND tournament_type = ?
    ORDER BY score DESC, correct_picks DESC
    LIMIT ?
  `).all(year, tournamentType, limit) as any[];
}

export function updateChallengeScore(
  id: string,
  score: number,
  correctPicks: number,
  totalPicks: number,
): void {
  const database = getDatabase();
  database.prepare(`
    UPDATE bracket_challenges SET score = ?, correct_picks = ?, total_picks = ? WHERE id = ?
  `).run(score, correctPicks, totalPicks, id);
}

// === Actual Results Operations ===

export function insertActualResult(
  gameId: string,
  year: number,
  tournamentType: TournamentType,
  round: Round,
  team1Id: string,
  team2Id: string,
  winnerId: string,
  team1Score?: number,
  team2Score?: number,
): void {
  const database = getDatabase();
  database.prepare(`
    INSERT OR REPLACE INTO actual_results (game_id, year, tournament_type, round, team1_id, team2_id, winner_id, team1_score, team2_score, recorded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(gameId, year, tournamentType, round, team1Id, team2Id, winnerId, team1Score ?? null, team2Score ?? null, Date.now());
}

export function getActualResults(
  year: number,
  tournamentType: TournamentType,
): Array<{
  game_id: string;
  round: string;
  team1_id: string;
  team2_id: string;
  winner_id: string;
  team1_score: number | null;
  team2_score: number | null;
}> {
  const database = getDatabase();
  return database.prepare(
    'SELECT game_id, round, team1_id, team2_id, winner_id, team1_score, team2_score FROM actual_results WHERE year = ? AND tournament_type = ? ORDER BY recorded_at'
  ).all(year, tournamentType) as any[];
}
