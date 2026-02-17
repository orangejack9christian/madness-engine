import { Router } from 'express';
import { LiveGameState, Round } from '../core/types';
import { GameStateTracker } from './game-state-tracker';

/**
 * Creates an Express router for manual live game score entry.
 * Mounted at /api/live in the server.
 */
export function createManualInputRouter(tracker: GameStateTracker): Router {
  const router = Router();

  /**
   * POST /api/live/start
   * Start a new game. Creates initial LiveGameState.
   * Body: { gameId, homeTeamId, awayTeamId, round? }
   */
  router.post('/start', (req, res) => {
    const { gameId, homeTeamId, awayTeamId, round } = req.body;

    if (!gameId || !homeTeamId || !awayTeamId) {
      res.status(400).json({ error: 'gameId, homeTeamId, and awayTeamId are required' });
      return;
    }

    const existing = tracker.getState(gameId);
    if (existing && existing.status === 'in-progress') {
      res.status(409).json({ error: 'Game is already in progress' });
      return;
    }

    const state: LiveGameState = {
      gameId,
      homeTeamId,
      awayTeamId,
      round: (round as Round) ?? 'round-of-64',
      homeScore: 0,
      awayScore: 0,
      period: 1,
      timeRemainingSeconds: 1200, // 20-minute half
      possession: null,
      homeFouls: 0,
      awayFouls: 0,
      homeInBonus: false,
      awayInBonus: false,
      homeFGM: 0, homeFGA: 0, home3PM: 0, home3PA: 0, homeFTM: 0, homeFTA: 0,
      awayFGM: 0, awayFGA: 0, away3PM: 0, away3PA: 0, awayFTM: 0, awayFTA: 0,
      lastScoringRun: { team: 'home', points: 0 },
      timeoutsRemaining: { home: 4, away: 4 },
      status: 'in-progress',
      lastUpdated: Date.now(),
    };

    tracker.updateState(state);
    res.status(201).json(state);
  });

  /**
   * POST /api/live/update
   * Push a partial LiveGameState update.
   * Body: Partial<LiveGameState> with required gameId
   */
  router.post('/update', (req, res) => {
    const { gameId, ...updates } = req.body;

    if (!gameId) {
      res.status(400).json({ error: 'gameId is required' });
      return;
    }

    const existing = tracker.getState(gameId);
    if (!existing) {
      res.status(404).json({ error: `Game ${gameId} not found. Start it first with POST /api/live/start` });
      return;
    }

    // Merge updates into existing state
    const merged: LiveGameState = {
      ...existing,
      ...updates,
      gameId, // ensure gameId can't be overwritten
      lastUpdated: Date.now(),
    };

    // Handle nested objects carefully
    if (updates.lastScoringRun) {
      merged.lastScoringRun = { ...existing.lastScoringRun, ...updates.lastScoringRun };
    }
    if (updates.timeoutsRemaining) {
      merged.timeoutsRemaining = { ...existing.timeoutsRemaining, ...updates.timeoutsRemaining };
    }

    const diff = tracker.updateState(merged);
    res.json({
      state: merged,
      changed: diff ? diff.changedFields : [],
    });
  });

  /**
   * POST /api/live/complete
   * Mark a game as final.
   * Body: { gameId, homeScore?, awayScore? }
   */
  router.post('/complete', (req, res) => {
    const { gameId, homeScore, awayScore } = req.body;

    if (!gameId) {
      res.status(400).json({ error: 'gameId is required' });
      return;
    }

    const existing = tracker.getState(gameId);
    if (!existing) {
      res.status(404).json({ error: `Game ${gameId} not found` });
      return;
    }

    const finalState: LiveGameState = {
      ...existing,
      homeScore: homeScore ?? existing.homeScore,
      awayScore: awayScore ?? existing.awayScore,
      status: 'final',
      timeRemainingSeconds: 0,
      lastUpdated: Date.now(),
    };

    tracker.updateState(finalState);

    const winnerId = finalState.homeScore > finalState.awayScore
      ? finalState.homeTeamId
      : finalState.awayTeamId;

    res.json({
      state: finalState,
      winnerId,
    });
  });

  /**
   * GET /api/live/games
   * List all tracked games.
   */
  router.get('/games', (_req, res) => {
    const games = tracker.getAllGames();
    res.json({
      total: games.length,
      active: games.filter(g => g.status === 'in-progress' || g.status === 'halftime').length,
      games,
    });
  });

  /**
   * GET /api/live/games/:gameId
   * Get a single game's state.
   */
  router.get('/games/:gameId', (req, res) => {
    const state = tracker.getState(req.params.gameId);
    if (!state) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }
    res.json(state);
  });

  return router;
}
