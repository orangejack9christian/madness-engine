-- Teams with full metrics
CREATE TABLE IF NOT EXISTS teams (
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  seed INTEGER NOT NULL,
  region TEXT NOT NULL,
  conference TEXT NOT NULL,
  tournament_type TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  mascot_json TEXT,
  coaching_json TEXT,
  year INTEGER NOT NULL,
  PRIMARY KEY (id, year, tournament_type)
);

CREATE INDEX IF NOT EXISTS idx_teams_year_type ON teams(year, tournament_type);

-- Bracket structure and game results
CREATE TABLE IF NOT EXISTS bracket_slots (
  slot_id TEXT NOT NULL,
  year INTEGER NOT NULL,
  tournament_type TEXT NOT NULL,
  round TEXT NOT NULL,
  region TEXT NOT NULL,
  team1_id TEXT,
  team2_id TEXT,
  winner_id TEXT,
  next_slot_id TEXT,
  PRIMARY KEY (slot_id, year, tournament_type)
);

-- Live game snapshots (latest per game)
CREATE TABLE IF NOT EXISTS live_games (
  game_id TEXT PRIMARY KEY,
  slot_id TEXT NOT NULL,
  year INTEGER NOT NULL,
  tournament_type TEXT NOT NULL,
  state_json TEXT NOT NULL,
  last_updated INTEGER NOT NULL
);

-- Per-game simulation results (append-only history)
CREATE TABLE IF NOT EXISTS game_simulations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mode_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  team1_id TEXT NOT NULL,
  team2_id TEXT NOT NULL,
  team1_win_prob REAL NOT NULL,
  team2_win_prob REAL NOT NULL,
  upset_prob REAL NOT NULL,
  overtime_prob REAL NOT NULL,
  expected_score_json TEXT NOT NULL,
  simulation_count INTEGER NOT NULL,
  round TEXT NOT NULL,
  computed_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_game_sims_mode_game ON game_simulations(mode_id, game_id);
CREATE INDEX IF NOT EXISTS idx_game_sims_time ON game_simulations(computed_at);

-- Per-team advancement probabilities (upserted per mode)
CREATE TABLE IF NOT EXISTS team_advancement (
  team_id TEXT NOT NULL,
  mode_id TEXT NOT NULL,
  year INTEGER NOT NULL,
  tournament_type TEXT NOT NULL,
  round_of_32_prob REAL,
  sweet_16_prob REAL,
  elite_8_prob REAL,
  final_4_prob REAL,
  championship_game_prob REAL,
  champion_prob REAL,
  expected_wins REAL,
  computed_at INTEGER NOT NULL,
  PRIMARY KEY (team_id, mode_id, year, tournament_type)
);

-- Tournament-level simulation snapshots
CREATE TABLE IF NOT EXISTS tournament_simulations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mode_id TEXT NOT NULL,
  tournament_type TEXT NOT NULL,
  year INTEGER NOT NULL,
  results_json TEXT NOT NULL,
  simulation_count INTEGER NOT NULL,
  computed_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tourney_sims_mode ON tournament_simulations(mode_id, tournament_type, year);

-- Prediction audit log (every prediction for calibration)
CREATE TABLE IF NOT EXISTS prediction_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mode_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  team1_id TEXT NOT NULL,
  team2_id TEXT NOT NULL,
  predicted_team1_win_prob REAL NOT NULL,
  actual_winner_id TEXT,
  round TEXT NOT NULL,
  year INTEGER NOT NULL,
  tournament_type TEXT NOT NULL,
  logged_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_prediction_log_mode ON prediction_log(mode_id, year);
CREATE INDEX IF NOT EXISTS idx_prediction_log_game ON prediction_log(game_id);

-- User feedback submissions
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  mode_id TEXT,
  view TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_feedback_time ON feedback(created_at);

-- Saved bracket challenges (user picks)
CREATE TABLE IF NOT EXISTS bracket_challenges (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  tournament_type TEXT NOT NULL,
  year INTEGER NOT NULL,
  picks_json TEXT NOT NULL,
  score REAL,
  correct_picks INTEGER DEFAULT 0,
  total_picks INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_challenges_year ON bracket_challenges(year, tournament_type);
CREATE INDEX IF NOT EXISTS idx_challenges_score ON bracket_challenges(score DESC);

-- Actual tournament results (for accuracy tracking)
CREATE TABLE IF NOT EXISTS actual_results (
  game_id TEXT NOT NULL,
  year INTEGER NOT NULL,
  tournament_type TEXT NOT NULL,
  round TEXT NOT NULL,
  team1_id TEXT NOT NULL,
  team2_id TEXT NOT NULL,
  winner_id TEXT NOT NULL,
  team1_score INTEGER,
  team2_score INTEGER,
  recorded_at INTEGER NOT NULL,
  PRIMARY KEY (game_id, year, tournament_type)
);

CREATE INDEX IF NOT EXISTS idx_actual_results_year ON actual_results(year, tournament_type);
