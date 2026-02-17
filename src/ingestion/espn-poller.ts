import { TournamentType, LiveGameState, Round } from '../core/types';
import { CONFIG } from '../config';
import { GameStateTracker } from './game-state-tracker';
import { resolveEspnTeamId } from './espn-team-mapper';

// ESPN API response types (subset of what we need)
interface ESPNCompetitor {
  id: string;
  team: { id: string; displayName: string; abbreviation: string };
  homeAway: 'home' | 'away';
  score: string;
  statistics?: Array<{ name: string; displayValue: string }>;
}

interface ESPNStatus {
  type: { name: string; completed: boolean };
  period: number;
  displayClock: string;
}

interface ESPNCompetition {
  id: string;
  competitors: ESPNCompetitor[];
  status: ESPNStatus;
  situation?: { possession?: string };
}

interface ESPNEvent {
  id: string;
  competitions: ESPNCompetition[];
}

interface ESPNScoreboardResponse {
  events: ESPNEvent[];
}

export class ESPNPoller {
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private tracker: GameStateTracker;
  private tournamentType: TournamentType;
  private pollIntervalMs: number;
  private teamLookup: Map<string, { name: string; shortName: string }>;
  private _isActive = false;

  constructor(
    tracker: GameStateTracker,
    tournamentType: TournamentType,
    teamLookup: Map<string, { name: string; shortName: string }>,
    pollIntervalMs?: number,
  ) {
    this.tracker = tracker;
    this.tournamentType = tournamentType;
    this.teamLookup = teamLookup;
    this.pollIntervalMs = pollIntervalMs ?? CONFIG.POLL_INTERVAL_MS;
  }

  get isActive(): boolean {
    return this._isActive;
  }

  start(): void {
    if (this._isActive) return;
    this._isActive = true;

    // Poll immediately, then on interval
    this.pollOnce().catch(err => {
      console.warn('[ESPN Poller] Initial poll failed:', err.message);
    });

    this.intervalHandle = setInterval(() => {
      this.pollOnce().catch(err => {
        console.warn('[ESPN Poller] Poll failed:', err.message);
      });
    }, this.pollIntervalMs);

    console.log(`[ESPN Poller] Started (${this.tournamentType}, interval: ${this.pollIntervalMs}ms)`);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this._isActive = false;
    console.log('[ESPN Poller] Stopped');
  }

  /** Public for testing. Fetches and processes one poll cycle. */
  async pollOnce(): Promise<void> {
    const response = await this.fetchScoreboard();
    if (!response || !response.events) return;

    for (const event of response.events) {
      const state = this.parseGameState(event);
      if (state) {
        this.tracker.updateState(state);
      }
    }
  }

  private async fetchScoreboard(): Promise<ESPNScoreboardResponse | null> {
    const sport = this.tournamentType === 'mens'
      ? 'mens-college-basketball'
      : 'womens-college-basketball';

    const url = `${CONFIG.ESPN_ENDPOINT_BASE}/${sport}/scoreboard?groups=100`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[ESPN Poller] HTTP ${res.status} from ESPN API`);
        return null;
      }
      return await res.json() as ESPNScoreboardResponse;
    } catch (err: any) {
      console.warn(`[ESPN Poller] Network error: ${err.message}`);
      return null;
    }
  }

  private parseGameState(event: ESPNEvent): LiveGameState | null {
    const competition = event.competitions?.[0];
    if (!competition) return null;

    const homeCompetitor = competition.competitors.find(c => c.homeAway === 'home');
    const awayCompetitor = competition.competitors.find(c => c.homeAway === 'away');
    if (!homeCompetitor || !awayCompetitor) return null;

    // Resolve team IDs
    const homeTeamId = resolveEspnTeamId(
      homeCompetitor.team.id,
      homeCompetitor.team.displayName,
      this.teamLookup,
    );
    const awayTeamId = resolveEspnTeamId(
      awayCompetitor.team.id,
      awayCompetitor.team.displayName,
      this.teamLookup,
    );

    if (!homeTeamId || !awayTeamId) {
      // Can't map these teams to our internal IDs — skip
      return null;
    }

    const status = this.parseStatus(competition.status);
    const timeRemaining = this.parseClockToSeconds(competition.status.displayClock);

    return {
      gameId: event.id,
      homeTeamId,
      awayTeamId,
      round: 'round-of-64' as Round, // ESPN doesn't directly provide round; default for now
      homeScore: parseInt(homeCompetitor.score) || 0,
      awayScore: parseInt(awayCompetitor.score) || 0,
      period: competition.status.period || 1,
      timeRemainingSeconds: timeRemaining,
      possession: null, // ESPN scoreboard endpoint doesn't reliably provide this
      homeFouls: 0,
      awayFouls: 0,
      homeInBonus: false,
      awayInBonus: false,
      homeFGM: 0, homeFGA: 0, home3PM: 0, home3PA: 0, homeFTM: 0, homeFTA: 0,
      awayFGM: 0, awayFGA: 0, away3PM: 0, away3PA: 0, awayFTM: 0, awayFTA: 0,
      lastScoringRun: { team: 'home', points: 0 },
      timeoutsRemaining: { home: 4, away: 4 },
      status,
      lastUpdated: Date.now(),
    };
  }

  private parseStatus(
    espnStatus: ESPNStatus,
  ): 'pre-game' | 'in-progress' | 'halftime' | 'final' {
    const name = espnStatus.type.name;
    if (espnStatus.type.completed) return 'final';
    if (name === 'STATUS_SCHEDULED' || name === 'STATUS_DELAYED') return 'pre-game';
    if (name === 'STATUS_HALFTIME') return 'halftime';
    if (name === 'STATUS_IN_PROGRESS' || name === 'STATUS_END_PERIOD') return 'in-progress';
    if (name === 'STATUS_FINAL') return 'final';
    return 'pre-game';
  }

  private parseClockToSeconds(displayClock: string): number {
    if (!displayClock || displayClock === '0:00') return 0;
    const parts = displayClock.split(':');
    if (parts.length === 2) {
      return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    }
    return 0;
  }
}
