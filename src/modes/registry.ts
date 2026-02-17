import { SimulationMode } from './types';

const modeRegistry = new Map<string, () => SimulationMode>();

export function registerMode(id: string, factory: () => SimulationMode): void {
  if (modeRegistry.has(id)) {
    throw new Error(`Duplicate mode registration: "${id}"`);
  }
  modeRegistry.set(id, factory);
}

export function getMode(id: string): SimulationMode {
  const factory = modeRegistry.get(id);
  if (!factory) {
    const available = Array.from(modeRegistry.keys()).join(', ');
    throw new Error(`Unknown mode: "${id}". Available modes: ${available}`);
  }
  return factory();
}

export function getAllModes(): SimulationMode[] {
  return Array.from(modeRegistry.values()).map(f => f());
}

export function getModeIds(): string[] {
  return Array.from(modeRegistry.keys());
}

export function hasMode(id: string): boolean {
  return modeRegistry.has(id);
}
