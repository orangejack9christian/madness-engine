import { OutputReport } from './types';

/**
 * Render a tournament simulation report to the terminal.
 * Uses plain text formatting with aligned columns.
 */
export function renderReport(report: OutputReport): string {
  const lines: string[] = [];
  const divider = '═'.repeat(80);
  const thinDivider = '─'.repeat(80);

  // Header
  lines.push(divider);
  lines.push(centerText(`${report.title}`, 80));
  lines.push(centerText(`Mode: ${report.modeName} [${report.confidenceTag}]`, 80));
  lines.push(centerText(`${report.simulationCount.toLocaleString()} simulations | ${report.generatedAt}`, 80));
  lines.push(divider);
  lines.push('');

  // Championship Odds
  lines.push('  CHAMPIONSHIP ODDS');
  lines.push(thinDivider);
  lines.push(
    '  ' +
    pad('#', 4) +
    pad('Seed', 5) +
    pad('Team', 24) +
    pad('Region', 10) +
    pad('Champ', 8) +
    pad('FF', 8) +
    pad('E8', 8) +
    pad('S16', 8) +
    pad('E[W]', 6)
  );
  lines.push('  ' + '─'.repeat(78));

  for (const row of report.championshipOdds) {
    lines.push(
      '  ' +
      pad(String(row.rank), 4) +
      pad(`(${row.seed})`, 5) +
      pad(row.teamName, 24) +
      pad(row.region, 10) +
      pad(row.championPct, 8) +
      pad(row.finalFourPct, 8) +
      pad(row.eliteEightPct, 8) +
      pad(row.sweetSixteenPct, 8) +
      pad(row.expectedWins, 6)
    );
  }

  lines.push('');

  // Final Four Odds
  lines.push('  MOST LIKELY FINAL FOUR');
  lines.push(thinDivider);
  for (const row of report.finalFourOdds.slice(0, 8)) {
    lines.push(
      `  (${row.seed}) ${pad(row.teamName, 24)} ${pad(row.region, 10)} ${row.probability}`
    );
  }

  lines.push('');

  // Region Breakdowns
  for (const region of report.regionBreakdowns) {
    lines.push(`  ${region.region.toUpperCase()} REGION`);
    lines.push(
      '  ' +
      pad('Seed', 5) +
      pad('Team', 24) +
      pad('R32', 8) +
      pad('S16', 8) +
      pad('E8', 8) +
      pad('FF', 8)
    );
    lines.push('  ' + '─'.repeat(60));

    for (const team of region.teams) {
      lines.push(
        '  ' +
        pad(`(${team.seed})`, 5) +
        pad(team.teamName, 24) +
        pad(team.roundOf32Pct, 8) +
        pad(team.sweetSixteenPct, 8) +
        pad(team.eliteEightPct, 8) +
        pad(team.finalFourPct, 8)
      );
    }

    lines.push('');
  }

  // Biggest Upset & Volatility
  if (report.biggestUpset) {
    lines.push(`  Biggest Projected Upset: ${report.biggestUpset}`);
  }
  lines.push(`  Volatility Index: ${(report.volatilityIndex * 100).toFixed(3)}`);
  lines.push('');
  lines.push(divider);

  return lines.join('\n');
}

function pad(str: string, width: number): string {
  return str.padEnd(width);
}

function centerText(text: string, width: number): string {
  const padding = Math.max(0, Math.floor((width - text.length) / 2));
  return ' '.repeat(padding) + text;
}
