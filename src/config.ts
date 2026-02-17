import os from 'os';
import path from 'path';
import { TournamentType } from './core/types';

export const CONFIG = {
  // Simulation settings
  SIMULATIONS_PER_UPDATE: parseInt(process.env.SIMULATIONS_PER_UPDATE || '1000'),
  BATCH_SIMULATIONS: parseInt(process.env.BATCH_SIMULATIONS || '1000'),
  WORKER_THREADS: parseInt(process.env.WORKER_THREADS || String(Math.max(1, os.cpus().length - 1))),

  // Live data settings
  POLL_INTERVAL_MS: parseInt(process.env.POLL_INTERVAL_MS || '15000'),
  LIVE_STATE_GAMMA: parseFloat(process.env.LIVE_STATE_GAMMA || '0.7'),
  ESPN_POLLING_ENABLED: process.env.ESPN_POLLING === 'true',
  ESPN_ENDPOINT_BASE: process.env.ESPN_ENDPOINT || 'https://site.api.espn.com/apis/site/v2/sports/basketball',

  // Paths
  ROOT_DIR: path.resolve(__dirname, '..'),
  DATA_DIR: path.resolve(__dirname, '..', 'data'),
  TEAMS_DIR: path.resolve(__dirname, '..', 'data', 'teams'),
  OUTPUT_DIR: path.resolve(__dirname, '..', 'output'),
  DB_PATH: path.resolve(__dirname, '..', 'data', 'march-madness.db'),

  // Tournament defaults
  DEFAULT_YEAR: parseInt(process.env.DEFAULT_YEAR || '2026'),
  DEFAULT_TOURNAMENT_TYPE: (process.env.DEFAULT_TOURNAMENT_TYPE || 'mens') as TournamentType,

  // Active modes (comma-separated mode IDs to run on each update)
  ACTIVE_MODES: (process.env.ACTIVE_MODES || 'pure-statistical').split(',').map(s => s.trim()),
};
