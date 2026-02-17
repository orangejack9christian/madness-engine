import { TournamentType } from './core/types';
import { runSimulation } from './pipeline/runner';
import { runAllModes } from './pipeline/batch-runner';
import { evaluateMode } from './evaluation/prediction-logger';
import { formatCalibration } from './evaluation/calibration';
import { getModeIds } from './modes/registry';
import { closeDatabase } from './storage/database';
import { CONFIG } from './config';

// Import all mode implementations
import './modes/implementations/pure-statistical';
import './modes/implementations/upset-chaos';
import './modes/implementations/mascot-fight';
import './modes/implementations/coaching';
import './modes/implementations/momentum';
import './modes/implementations/defense-wins';
import './modes/implementations/chalk';
import './modes/implementations/fatigue';
import './modes/implementations/three-point-rain';
import './modes/implementations/conference-strength';
import './modes/implementations/cinderella';
import './modes/implementations/rivalry-revenge';
import './modes/implementations/size-matters';
import './modes/implementations/tempo-push';
import './modes/implementations/turnover-battle';
import './modes/implementations/experience-edge';
import './modes/implementations/balanced-attack';
import './modes/implementations/seed-killer';
import './modes/implementations/home-court';
import './modes/implementations/chaos-ladder';

function printUsage(): void {
  console.log(`
March Madness Simulator — Real-Time Probabilistic Tournament Engine

Usage:
  npm run dev -- simulate [options]      Run tournament simulation
  npm run dev -- batch [options]         Run all modes and compare
  npm run dev -- evaluate [options]      Show calibration metrics
  npm run dev -- modes                   List available modes

Simulate options:
  --year <year>               Tournament year (default: ${CONFIG.DEFAULT_YEAR})
  --type <mens|womens>        Tournament type (default: ${CONFIG.DEFAULT_TOURNAMENT_TYPE})
  --mode <modeId>             Simulation mode (default: ${CONFIG.ACTIVE_MODES.join(',')})
  --sims <count>              Number of simulations (default: ${CONFIG.SIMULATIONS_PER_UPDATE})
  --export                    Export results to JSON
  --seed <number>             RNG seed for reproducibility

Examples:
  npm run dev -- simulate --mode pure-statistical --sims 10000
  npm run dev -- batch --type mens --sims 5000
  npm run dev -- evaluate --mode pure-statistical
  npm run dev -- modes
  `);
}

function parseArgs(args: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        parsed[key] = next;
        i++;
      } else {
        parsed[key] = 'true';
      }
    }
  }
  return parsed;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  const flags = parseArgs(args.slice(1));

  try {
    switch (command) {
      case 'simulate': {
        const results = runSimulation({
          year: flags.year ? parseInt(flags.year) : undefined,
          tournamentType: flags.type as TournamentType | undefined,
          modeIds: flags.mode ? flags.mode.split(',') : undefined,
          simulations: flags.sims ? parseInt(flags.sims) : undefined,
          exportJson: flags.export === 'true',
          seed: flags.seed ? parseInt(flags.seed) : undefined,
        });
        break;
      }

      case 'batch': {
        runAllModes(
          flags.year ? parseInt(flags.year) : undefined,
          flags.type as TournamentType | undefined,
          flags.sims ? parseInt(flags.sims) : undefined,
        );
        break;
      }

      case 'evaluate': {
        const modeId = flags.mode ?? 'pure-statistical';
        const year = flags.year ? parseInt(flags.year) : CONFIG.DEFAULT_YEAR;
        const type = (flags.type ?? CONFIG.DEFAULT_TOURNAMENT_TYPE) as TournamentType;

        const result = evaluateMode(modeId, year, type);
        console.log(formatCalibration(result));
        break;
      }

      case 'modes': {
        const ids = getModeIds();
        console.log('\nAvailable simulation modes:');
        for (const id of ids) {
          const { getMode } = require('./modes/registry');
          const mode = getMode(id);
          console.log(`  ${id.padEnd(25)} [${mode.confidenceTag}] ${mode.description}`);
        }
        console.log('');
        break;
      }

      default:
        printUsage();
    }
  } finally {
    closeDatabase();
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  closeDatabase();
  process.exit(1);
});
