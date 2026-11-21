import { UserError } from './db';
import { isValidDate } from './schedule';
import type { Criticality } from './types';

export function cleanName(value: unknown, what: string, max = 100): string {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s) throw new UserError(`${what} can't be empty.`);
  if (s.length > max) throw new UserError(`${what} can be at most ${max} characters.`);
  return s;
}

export function cleanDate(value: unknown): string {
  if (typeof value !== 'string' || !isValidDate(value)) throw new UserError('Dates must be YYYY-MM-DD.');
  return value;
}

export function cleanCriticality(value: unknown): Criticality {
  if (value !== 'HIGH' && value !== 'MEDIUM' && value !== 'LOW') throw new UserError('Invalid criticality.');
  return value;
}

export const normEmail = (e: string) => e.trim().toLowerCase();
