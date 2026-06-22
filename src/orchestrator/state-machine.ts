import type { RunStatus } from '../core/schemas/index.js';

const VALID_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  pending: ['planning', 'executing', 'failed'],
  planning: ['executing', 'failed'],
  executing: ['awaiting_approval', 'validating', 'completed', 'failed'],
  awaiting_approval: ['executing', 'failed'],
  validating: ['completed', 'executing', 'failed'],
  completed: [],
  failed: [],
};

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: RunStatus, to: RunStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid state transition: ${from} -> ${to}`);
  }
}

export function transition(current: RunStatus, next: RunStatus): RunStatus {
  assertTransition(current, next);
  return next;
}
