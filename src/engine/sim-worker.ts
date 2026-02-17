/**
 * Piscina worker thread for running Monte Carlo bracket simulations.
 * Each invocation receives a serialized task and returns serialized results.
 * Runs in a separate thread — no shared state with main thread.
 */

import { Team } from '../core/types';
import { SimulationTask, BracketSimResult } from './types';
import { SerializedBracket } from '../bracket/types';
import { simulateFullBracket } from './bracket-propagator';
import { getMode } from '../modes/registry';

// Import mode implementations so they self-register
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

export default function runSimulation(task: SimulationTask): BracketSimResult {
  const mode = getMode(task.modeId);

  if (task.type === 'full-bracket') {
    const teams: Team[] = JSON.parse(task.teamsJson!);
    const bracket: SerializedBracket = JSON.parse(task.bracketJson!);

    return simulateFullBracket(
      bracket,
      teams,
      mode,
      task.simulationCount,
      task.seed,
    );
  }

  throw new Error(`Unsupported task type: ${task.type}`);
}
