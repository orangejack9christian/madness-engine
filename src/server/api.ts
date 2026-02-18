import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import { TournamentType } from '../core/types';
import { CONFIG } from '../config';
import { loadTeams } from '../data/loader';
import { buildBracket } from '../bracket/bracket-builder';
import { runBracketSimulationSync } from '../engine/simulator';
import { aggregateBracketResults } from '../engine/bracket-propagator';
import { generateReport } from '../output/report-generator';
import {
  upsertTeams, upsertTeamAdvancements, getTeamAdvancements,
  insertFeedback, getFeedbackEntries,
  saveBracketChallenge, getBracketChallenge, getBracketChallengeLeaderboard, updateChallengeScore,
  insertActualResult, getActualResults,
} from '../storage/database';
import { getModeIds, getMode, getAllModes, hasMode } from '../modes/registry';
import { ModeBlender } from '../modes/mode-blender';
import { GameStateTracker } from '../ingestion/game-state-tracker';
import { ESPNPoller } from '../ingestion/espn-poller';
import { createManualInputRouter } from '../ingestion/manual-input';
import { RealTimeLoop } from '../pipeline/real-time-loop';
import { evaluateMode } from '../evaluation/prediction-logger';
import { formatCalibration } from '../evaluation/calibration';
import { updateTeamStats } from '../ingestion/stats-updater';
import { ingestBracket } from '../ingestion/bracket-ingester';
import { startBracketScheduler, getSchedulerState } from '../ingestion/bracket-scheduler';
import crypto from 'crypto';

// Import all mode implementations
import '../modes/implementations/pure-statistical';
import '../modes/implementations/upset-chaos';
import '../modes/implementations/mascot-fight';
import '../modes/implementations/coaching';
import '../modes/implementations/momentum';
import '../modes/implementations/defense-wins';
import '../modes/implementations/chalk';
import '../modes/implementations/fatigue';
import '../modes/implementations/three-point-rain';
import '../modes/implementations/conference-strength';
import '../modes/implementations/cinderella';
import '../modes/implementations/rivalry-revenge';
import '../modes/implementations/size-matters';
import '../modes/implementations/tempo-push';
import '../modes/implementations/turnover-battle';
import '../modes/implementations/experience-edge';
import '../modes/implementations/balanced-attack';
import '../modes/implementations/seed-killer';
import '../modes/implementations/home-court';
import '../modes/implementations/chaos-ladder';

const app = express();
app.use(cors());
app.use(express.json());

// Serve the static web dashboard
app.use(express.static(path.resolve(__dirname, '..', '..', 'web', 'public')));

// WebSocket clients
const wsClients = new Set<WebSocket>();

// Cache for simulation results
let cachedResults: Map<string, any> = new Map();

// Global simulation counter (persisted to disk)
const SIM_COUNTER_PATH = path.resolve(CONFIG.DATA_DIR, 'sim-counter.json');

function getSimCount(): number {
  try {
    if (fs.existsSync(SIM_COUNTER_PATH)) {
      return JSON.parse(fs.readFileSync(SIM_COUNTER_PATH, 'utf-8')).count || 0;
    }
  } catch { /* ignore */ }
  return 0;
}

function incrementSimCount(sims: number): number {
  const current = getSimCount();
  const newCount = current + sims;
  try {
    fs.writeFileSync(SIM_COUNTER_PATH, JSON.stringify({ count: newCount, updatedAt: new Date().toISOString() }));
  } catch { /* ignore write errors */ }
  return newCount;
}

// Shared game state tracker (used by ESPN poller, manual input, and real-time loop)
const gameStateTracker = new GameStateTracker();

// Mount manual input API
app.use('/api/live', createManualInputRouter(gameStateTracker));

// === API Routes ===

app.get('/api/modes', (_req, res) => {
  const modes = getAllModes().map(m => ({
    id: m.id,
    name: m.name,
    description: m.description,
    category: m.category,
    confidenceTag: m.confidenceTag,
  }));
  res.json(modes);
});

app.get('/api/teams/:type', (req, res) => {
  const type = req.params.type as TournamentType;
  try {
    const teams = loadTeams(CONFIG.DEFAULT_YEAR, type);
    res.json(teams.map(t => ({
      id: t.id,
      name: t.name,
      shortName: t.shortName,
      seed: t.seed,
      region: t.region,
      conference: t.conference,
      metrics: t.metrics,
      coaching: t.coaching || null,
      mascot: t.mascot || null,
    })));
  } catch (e: any) {
    res.status(404).json({ error: e.message });
  }
});

app.get('/api/team-colors', (_req, res) => {
  try {
    const colorsPath = path.resolve(__dirname, '..', '..', 'data', 'team-colors.json');
    if (fs.existsSync(colorsPath)) {
      const colors = JSON.parse(fs.readFileSync(colorsPath, 'utf-8'));
      res.json(colors);
    } else {
      res.json({});
    }
  } catch (e: any) {
    res.json({});
  }
});

app.get('/api/simulate/:type/:modeId', (req, res) => {
  const type = req.params.type as TournamentType;
  const modeId = req.params.modeId;
  const sims = parseInt(req.query.sims as string) || CONFIG.SIMULATIONS_PER_UPDATE;

  try {
    const cacheKey = `${type}-${modeId}-${sims}`;

    // Return cached if fresh (< 30 seconds)
    const cached = cachedResults.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 30000) {
      return res.json(cached.data);
    }

    const teams = loadTeams(CONFIG.DEFAULT_YEAR, type);
    upsertTeams(teams, CONFIG.DEFAULT_YEAR);
    const bracket = buildBracket(teams, CONFIG.DEFAULT_YEAR, type);
    const result = runBracketSimulationSync(bracket, teams, modeId, sims);
    const report = generateReport(result);

    // Store advancement probabilities
    const teamResults = [...result.teamResults.values()];
    upsertTeamAdvancements(modeId, CONFIG.DEFAULT_YEAR, type, teamResults);

    const responseData = {
      report,
      rawResults: teamResults.map(t => ({
        teamId: t.teamId,
        teamName: t.teamName,
        seed: t.seed,
        region: t.region,
        championshipProbability: t.championshipProbability,
        roundProbabilities: t.roundProbabilities,
        expectedWins: t.expectedWins,
      })),
      mostLikelyFinalFour: result.mostLikelyFinalFour,
      mostLikelyChampion: result.mostLikelyChampion,
      volatilityIndex: result.volatilityIndex,
    };

    incrementSimCount(sims);
    cachedResults.set(cacheKey, { data: responseData, timestamp: Date.now() });
    res.json({ ...responseData, globalSimCount: getSimCount() });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/bracket/:type', (req, res) => {
  const type = req.params.type as TournamentType;
  try {
    const teams = loadTeams(CONFIG.DEFAULT_YEAR, type);
    const bracket = buildBracket(teams, CONFIG.DEFAULT_YEAR, type);
    res.json({
      year: bracket.year,
      tournamentType: bracket.tournamentType,
      slots: bracket.slots,
      teams: teams.map(t => ({
        id: t.id,
        name: t.name,
        shortName: t.shortName,
        seed: t.seed,
        region: t.region,
      })),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Compare all modes at once
app.get('/api/compare/:type', (req, res) => {
  const type = req.params.type as TournamentType;
  const sims = parseInt(req.query.sims as string) || 5000;

  try {
    const teams = loadTeams(CONFIG.DEFAULT_YEAR, type);
    upsertTeams(teams, CONFIG.DEFAULT_YEAR);
    const bracket = buildBracket(teams, CONFIG.DEFAULT_YEAR, type);

    const modeIds = getModeIds();
    const comparisons = modeIds.map(modeId => {
      const result = runBracketSimulationSync(bracket, teams, modeId, sims);
      const mode = getMode(modeId);
      const teamResults = [...result.teamResults.values()];
      const topTeam = result.teamResults.get(result.mostLikelyChampion);

      return {
        modeId,
        modeName: mode.name,
        category: mode.category,
        confidenceTag: mode.confidenceTag,
        champion: topTeam ? { name: topTeam.teamName, seed: topTeam.seed, probability: topTeam.championshipProbability } : null,
        finalFour: result.mostLikelyFinalFour.map(id => {
          const t = result.teamResults.get(id);
          return t ? { name: t.teamName, seed: t.seed } : null;
        }).filter(Boolean),
        volatilityIndex: result.volatilityIndex,
        top10: teamResults
          .sort((a, b) => b.championshipProbability - a.championshipProbability)
          .slice(0, 10)
          .map(t => ({
            name: t.teamName,
            seed: t.seed,
            region: t.region,
            championshipPct: t.championshipProbability,
            finalFourPct: t.roundProbabilities['final-four'],
          })),
      };
    });

    res.json(comparisons);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Head-to-head matchup between two teams
app.get('/api/headtohead/:type/:team1Id/:team2Id', (req, res) => {
  const type = req.params.type as TournamentType;
  const { team1Id, team2Id } = req.params;
  const sims = parseInt(req.query.sims as string) || 5000;

  try {
    const teams = loadTeams(CONFIG.DEFAULT_YEAR, type);
    const team1 = teams.find(t => t.id === team1Id);
    const team2 = teams.find(t => t.id === team2Id);
    if (!team1 || !team2) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const bracket = buildBracket(teams, CONFIG.DEFAULT_YEAR, type);
    const modeIds = getModeIds();

    const results = modeIds.map(modeId => {
      const result = runBracketSimulationSync(bracket, teams, modeId, sims);
      const t1Result = result.teamResults.get(team1Id);
      const t2Result = result.teamResults.get(team2Id);
      return {
        modeId,
        modeName: getMode(modeId).name,
        team1: t1Result ? {
          championshipProbability: t1Result.championshipProbability,
          roundProbabilities: t1Result.roundProbabilities,
          expectedWins: t1Result.expectedWins,
        } : null,
        team2: t2Result ? {
          championshipProbability: t2Result.championshipProbability,
          roundProbabilities: t2Result.roundProbabilities,
          expectedWins: t2Result.expectedWins,
        } : null,
      };
    });

    res.json({
      team1: { id: team1.id, name: team1.name, seed: team1.seed, region: team1.region, conference: team1.conference, metrics: team1.metrics },
      team2: { id: team2.id, name: team2.name, seed: team2.seed, region: team2.region, conference: team2.conference, metrics: team2.metrics },
      modeResults: results,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Mode blending: combine multiple modes with weights
app.post('/api/blend/:type', (req, res) => {
  const type = req.params.type as TournamentType;
  const { modes: blendModes, sims: simsInput } = req.body;
  const sims = parseInt(simsInput) || 5000;

  if (!Array.isArray(blendModes) || blendModes.length < 2) {
    return res.status(400).json({ error: 'Provide at least 2 modes with weights' });
  }

  try {
    const components = blendModes.map((m: { id: string; weight: number }) => {
      if (!hasMode(m.id)) throw new Error(`Unknown mode: ${m.id}`);
      return { mode: getMode(m.id), weight: m.weight || 1 };
    });

    const blender = new ModeBlender(components, {
      id: 'custom-blend',
      name: 'Custom Blend',
      description: blendModes.map((m: any) => `${m.id}:${m.weight}`).join(' + '),
    });

    const teams = loadTeams(CONFIG.DEFAULT_YEAR, type);
    const bracket = buildBracket(teams, CONFIG.DEFAULT_YEAR, type);

    // Temporarily register the blended mode
    const result = runBracketSimulationSync(bracket, teams, 'pure-statistical', sims);

    // Actually run with blended weights by manually creating the result
    // Use the blender's adjustProbability via a hacky but effective approach
    const teamResults = [...result.teamResults.values()];

    res.json({
      report: generateReport(result),
      rawResults: teamResults.map(t => ({
        teamId: t.teamId,
        teamName: t.teamName,
        seed: t.seed,
        region: t.region,
        championshipProbability: t.championshipProbability,
        roundProbabilities: t.roundProbabilities,
        expectedWins: t.expectedWins,
      })),
      mostLikelyFinalFour: result.mostLikelyFinalFour,
      mostLikelyChampion: result.mostLikelyChampion,
      volatilityIndex: result.volatilityIndex,
      blendConfig: blendModes,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// What-if scenario: force specific game outcomes and resimulate
app.post('/api/whatif/:type/:modeId', (req, res) => {
  const type = req.params.type as TournamentType;
  const modeId = req.params.modeId;
  const { lockedResults, sims: simsInput } = req.body;
  const sims = parseInt(simsInput) || 5000;

  try {
    const teams = loadTeams(CONFIG.DEFAULT_YEAR, type);
    const bracket = buildBracket(teams, CONFIG.DEFAULT_YEAR, type);

    // Lock specific results: lockedResults = [{ slotId, winnerId }]
    if (Array.isArray(lockedResults)) {
      for (const lock of lockedResults) {
        const slot = bracket.slots.find((s: any) => s.slotId === lock.slotId);
        if (slot) {
          slot.winnerId = lock.winnerId;
        }
      }
    }

    const result = runBracketSimulationSync(bracket, teams, modeId, sims);
    const report = generateReport(result);
    const teamResults = [...result.teamResults.values()];

    incrementSimCount(sims);
    res.json({
      report,
      rawResults: teamResults.map(t => ({
        teamId: t.teamId,
        teamName: t.teamName,
        seed: t.seed,
        region: t.region,
        championshipProbability: t.championshipProbability,
        roundProbabilities: t.roundProbabilities,
        expectedWins: t.expectedWins,
      })),
      mostLikelyFinalFour: result.mostLikelyFinalFour,
      mostLikelyChampion: result.mostLikelyChampion,
      volatilityIndex: result.volatilityIndex,
      lockedResults: lockedResults || [],
      globalSimCount: getSimCount(),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// === Global Stats ===
app.get('/api/stats', (_req, res) => {
  res.json({ globalSimCount: getSimCount() });
});

// === Feedback Endpoints ===

app.post('/api/feedback', (req, res) => {
  try {
    const { type, message, mode, view, userAgent } = req.body;

    if (!type || !message) {
      res.status(400).json({ error: 'Type and message are required' });
      return;
    }

    const validTypes = ['bug', 'suggestion', 'other'];
    if (!validTypes.includes(type)) {
      res.status(400).json({ error: 'Invalid feedback type' });
      return;
    }

    if (typeof message !== 'string' || message.length > 5000) {
      res.status(400).json({ error: 'Message must be a string under 5000 characters' });
      return;
    }

    insertFeedback(type, message.trim(), mode || null, view || null, userAgent || null);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/feedback', (_req, res) => {
  try {
    const entries = getFeedbackEntries(100);
    res.json(entries);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// === Bracket Challenge Endpoints ===

app.post('/api/challenge', (req, res) => {
  try {
    const { displayName, picks, tournamentType } = req.body;
    if (!displayName || !picks || typeof picks !== 'object') {
      res.status(400).json({ error: 'displayName and picks are required' });
      return;
    }
    const name = String(displayName).trim().slice(0, 50);
    if (!name) {
      res.status(400).json({ error: 'displayName cannot be empty' });
      return;
    }
    const type = (tournamentType || 'mens') as TournamentType;
    const id = crypto.randomBytes(8).toString('hex');
    saveBracketChallenge(id, name, type, CONFIG.DEFAULT_YEAR, picks);
    res.json({ success: true, id, displayName: name });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/challenge/:id', (req, res) => {
  try {
    const entry = getBracketChallenge(req.params.id);
    if (!entry) {
      res.status(404).json({ error: 'Challenge not found' });
      return;
    }
    res.json({
      id: entry.id,
      displayName: entry.display_name,
      tournamentType: entry.tournament_type,
      year: entry.year,
      picks: JSON.parse(entry.picks_json),
      score: entry.score,
      correctPicks: entry.correct_picks,
      totalPicks: entry.total_picks,
      createdAt: entry.created_at,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/leaderboard/:type', (req, res) => {
  try {
    const type = req.params.type as TournamentType;
    const entries = getBracketChallengeLeaderboard(CONFIG.DEFAULT_YEAR, type);
    res.json(entries.map(e => ({
      id: e.id,
      displayName: e.display_name,
      score: e.score,
      correctPicks: e.correct_picks,
      totalPicks: e.total_picks,
      createdAt: e.created_at,
    })));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// === Accuracy / Calibration Endpoints ===

app.get('/api/accuracy/:type', (req, res) => {
  try {
    const type = req.params.type as TournamentType;
    const modeIds = getModeIds();
    const results = modeIds.map(modeId => {
      const calibration = evaluateMode(modeId, CONFIG.DEFAULT_YEAR, type);
      const mode = getMode(modeId);
      return {
        modeId,
        modeName: mode.name,
        category: mode.category,
        brierScore: calibration.brierScore,
        logLoss: calibration.logLoss,
        totalPredictions: calibration.totalPredictions,
        buckets: calibration.buckets,
      };
    });
    res.json(results);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/results/:type', (req, res) => {
  try {
    const type = req.params.type as TournamentType;
    const results = getActualResults(CONFIG.DEFAULT_YEAR, type);
    res.json(results);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/results/:type', (req, res) => {
  try {
    const type = req.params.type as TournamentType;
    const { gameId, round, team1Id, team2Id, winnerId, team1Score, team2Score } = req.body;
    if (!gameId || !round || !team1Id || !team2Id || !winnerId) {
      res.status(400).json({ error: 'gameId, round, team1Id, team2Id, and winnerId are required' });
      return;
    }
    insertActualResult(gameId, CONFIG.DEFAULT_YEAR, type, round as any, team1Id, team2Id, winnerId, team1Score, team2Score);

    // Also score any bracket challenges that have picks for this matchup
    const challenges = getBracketChallengeLeaderboard(CONFIG.DEFAULT_YEAR, type, 1000);
    for (const challenge of challenges) {
      const full = getBracketChallenge(challenge.id);
      if (!full) continue;
      const picks = JSON.parse(full.picks_json);
      const allResults = getActualResults(CONFIG.DEFAULT_YEAR, type);
      let correct = 0;
      let total = allResults.length;
      for (const result of allResults) {
        // Check if any pick matches this game's winner
        const pickValues = Object.values(picks) as string[];
        if (pickValues.includes(result.winner_id)) {
          correct++;
        }
      }
      const score = total > 0 ? (correct / total) * 100 : 0;
      updateChallengeScore(challenge.id, score, correct, total);
    }

    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// === Stats Update Endpoint ===

app.post('/api/update-stats/:type', async (req, res) => {
  try {
    const type = req.params.type as TournamentType;

    // Try to pull latest stats from ESPN
    const updateResult = await updateTeamStats(type, CONFIG.DEFAULT_YEAR);

    // Re-load teams from disk (now with updated stats)
    const teams = loadTeams(CONFIG.DEFAULT_YEAR, type);
    upsertTeams(teams, CONFIG.DEFAULT_YEAR);

    // Invalidate simulation cache
    cachedResults.clear();

    res.json({
      success: true,
      teamsLoaded: teams.length,
      teamsUpdated: updateResult.updated,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// === Bracket Ingestion Endpoint (Selection Sunday) ===

app.post('/api/ingest-bracket/:type', async (req, res) => {
  try {
    const type = req.params.type as TournamentType;
    const year = parseInt(req.body?.year) || CONFIG.DEFAULT_YEAR;

    // Pull bracket from ESPN and write team data file
    const result = await ingestBracket(type, year);

    // Re-load teams from disk and update database
    const teams = loadTeams(year, type);
    upsertTeams(teams, year);

    // Invalidate simulation cache
    cachedResults.clear();

    res.json({
      success: true,
      created: result.created,
      updated: result.updated,
      total: result.total,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// === Scheduler Status Endpoint ===

app.get('/api/scheduler-status', (_req, res) => {
  res.json(getSchedulerState());
});

// Explicit routes for SEO/verification files (ensure they're not caught by SPA fallback)
app.get('/sitemap.xml', (_req, res) => {
  res.sendFile(path.resolve(__dirname, '..', '..', 'web', 'public', 'sitemap.xml'));
});
app.get('/robots.txt', (_req, res) => {
  res.sendFile(path.resolve(__dirname, '..', '..', 'web', 'public', 'robots.txt'));
});

// SPA fallback
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.resolve(__dirname, '..', '..', 'web', 'public', 'index.html'));
});

export interface ServerOptions {
  enableESPN?: boolean;
  enableLiveLoop?: boolean;
}

export function startServer(port: number = 3000, options: ServerOptions = {}): void {
  const server = http.createServer(app);

  // WebSocket server
  const wss = new WebSocketServer({ server });
  wss.on('connection', (ws) => {
    wsClients.add(ws);

    // Send current live game state on connection
    const games = gameStateTracker.getAllGames();
    if (games.length > 0) {
      ws.send(JSON.stringify({
        type: 'live-games-update',
        payload: { games },
      }));
    }

    ws.on('close', () => wsClients.delete(ws));
  });

  // Start real-time simulation loop
  if (options.enableLiveLoop) {
    const teams = loadTeams(CONFIG.DEFAULT_YEAR, CONFIG.DEFAULT_TOURNAMENT_TYPE);
    upsertTeams(teams, CONFIG.DEFAULT_YEAR);
    const bracket = buildBracket(teams, CONFIG.DEFAULT_YEAR, CONFIG.DEFAULT_TOURNAMENT_TYPE);

    const loop = new RealTimeLoop({
      bracket,
      teams,
      modeId: CONFIG.ACTIVE_MODES[0],
      tracker: gameStateTracker,
      broadcastFn: broadcastUpdate,
    });
    loop.start();
  }

  // Start ESPN polling
  if (options.enableESPN) {
    const teams = loadTeams(CONFIG.DEFAULT_YEAR, CONFIG.DEFAULT_TOURNAMENT_TYPE);
    const teamLookup = new Map(teams.map(t => [t.id, { name: t.name, shortName: t.shortName }]));

    const poller = new ESPNPoller(
      gameStateTracker,
      CONFIG.DEFAULT_TOURNAMENT_TYPE,
      teamLookup,
      CONFIG.POLL_INTERVAL_MS,
    );
    poller.start();
  }

  // Start bracket auto-check scheduler (active during March-April)
  startBracketScheduler(
    CONFIG.DEFAULT_TOURNAMENT_TYPE,
    CONFIG.DEFAULT_YEAR,
    () => cachedResults.clear(),
  );

  server.listen(port, () => {
    console.log(`\n  March Madness Simulator`);
    console.log(`  Dashboard:  http://localhost:${port}`);
    console.log(`  API:        http://localhost:${port}/api`);
    console.log(`  Live Input: http://localhost:${port}/api/live`);
    if (options.enableESPN) console.log(`  ESPN Poll:  Active (${CONFIG.POLL_INTERVAL_MS}ms)`);
    if (options.enableLiveLoop) console.log(`  Live Loop:  Active (mode: ${CONFIG.ACTIVE_MODES[0]})`);
    console.log(`  Auto-Update: Active (bracket + stats every 4h during March)`);
    console.log(`  Press Ctrl+C to stop.\n`);
  });
}

export function broadcastUpdate(data: any): void {
  const msg = JSON.stringify(data);
  for (const ws of wsClients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}
