/**
 * Calibration metrics for evaluating prediction quality.
 * Computes Brier score, log loss, and reliability bucket data.
 */

export interface CalibrationResult {
  brierScore: number;
  logLoss: number;
  totalPredictions: number;
  buckets: CalibrationBucket[];
}

export interface CalibrationBucket {
  rangeStart: number;
  rangeEnd: number;
  predictedMean: number;
  actualWinRate: number;
  count: number;
}

interface PredictionRecord {
  predictedTeam1WinProb: number;
  team1Id: string;
  actualWinnerId: string;
}

/**
 * Compute calibration metrics from a list of predictions with known outcomes.
 */
export function computeCalibration(predictions: PredictionRecord[]): CalibrationResult {
  if (predictions.length === 0) {
    return {
      brierScore: 0,
      logLoss: 0,
      totalPredictions: 0,
      buckets: [],
    };
  }

  let brierSum = 0;
  let logLossSum = 0;
  const bucketSize = 0.1;
  const bucketData: Map<number, { predSum: number; wins: number; count: number }> = new Map();

  // Initialize buckets: 0-0.1, 0.1-0.2, ..., 0.9-1.0
  for (let i = 0; i < 10; i++) {
    bucketData.set(i, { predSum: 0, wins: 0, count: 0 });
  }

  for (const pred of predictions) {
    const p = pred.predictedTeam1WinProb;
    const actual = pred.actualWinnerId === pred.team1Id ? 1 : 0;

    // Brier score: mean squared error
    brierSum += (p - actual) ** 2;

    // Log loss: -[y*log(p) + (1-y)*log(1-p)]
    const clampedP = Math.max(1e-10, Math.min(1 - 1e-10, p));
    logLossSum += -(actual * Math.log(clampedP) + (1 - actual) * Math.log(1 - clampedP));

    // Bucket
    const bucketIdx = Math.min(9, Math.floor(p / bucketSize));
    const bucket = bucketData.get(bucketIdx)!;
    bucket.predSum += p;
    bucket.wins += actual;
    bucket.count++;
  }

  const n = predictions.length;
  const buckets: CalibrationBucket[] = [];
  for (let i = 0; i < 10; i++) {
    const b = bucketData.get(i)!;
    buckets.push({
      rangeStart: i * bucketSize,
      rangeEnd: (i + 1) * bucketSize,
      predictedMean: b.count > 0 ? b.predSum / b.count : (i + 0.5) * bucketSize,
      actualWinRate: b.count > 0 ? b.wins / b.count : 0,
      count: b.count,
    });
  }

  return {
    brierScore: brierSum / n,
    logLoss: logLossSum / n,
    totalPredictions: n,
    buckets,
  };
}

/**
 * Format calibration results as a human-readable string.
 */
export function formatCalibration(result: CalibrationResult): string {
  const lines: string[] = [];
  lines.push('=== Calibration Report ===');
  lines.push(`Total predictions: ${result.totalPredictions}`);
  lines.push(`Brier Score: ${result.brierScore.toFixed(4)} (lower is better, 0.25 = coin flip)`);
  lines.push(`Log Loss:    ${result.logLoss.toFixed(4)} (lower is better, 0.693 = coin flip)`);
  lines.push('');
  lines.push('Reliability Buckets:');
  lines.push('  Predicted   | Actual Win% | Count');
  lines.push('  ------------|-------------|------');
  for (const b of result.buckets) {
    if (b.count === 0) continue;
    const predStr = `${(b.rangeStart * 100).toFixed(0)}%-${(b.rangeEnd * 100).toFixed(0)}%`.padEnd(12);
    const actualStr = `${(b.actualWinRate * 100).toFixed(1)}%`.padStart(11);
    const countStr = String(b.count).padStart(5);
    lines.push(`  ${predStr} |${actualStr} |${countStr}`);
  }
  return lines.join('\n');
}
