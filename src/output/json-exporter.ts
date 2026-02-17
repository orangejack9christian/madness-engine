import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config';
import { OutputReport } from './types';

/**
 * Export a simulation report to a JSON file.
 */
export function exportReportToJson(report: OutputReport, filename?: string): string {
  const outputDir = CONFIG.OUTPUT_DIR;
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const name = filename ?? `${report.modeId}-${Date.now()}.json`;
  const filePath = path.join(outputDir, name);

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf-8');
  return filePath;
}
