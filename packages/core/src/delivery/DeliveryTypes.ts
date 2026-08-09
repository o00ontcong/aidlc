export type DeliverySourceType = 'manual' | 'file' | 'jira' | 'github' | 'other';

export interface DeliveryRequest {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria?: string[];
  constraints?: string[];
  source?: { type: DeliverySourceType; reference?: string };
}

export interface DeliveryProfile {
  id: string;
  projectContextMode: 'interactive' | 'infer-or-refresh';
  reviewStrategy: 'per-step' | 'aggregate';
  maxParallelWorkers: number;
  openFeaturePullRequest: true;
  mergePolicy: 'human-only';
}

export type DeliveryStatus =
  | 'pending'
  | 'project-context'
  | 'feature-contract'
  | 'executing-workers'
  | 'integrating'
  | 'awaiting-aggregate-review'
  | 'awaiting-merge'
  | 'project-sync'
  | 'completed'
  | 'blocked'
  | 'failed';

export interface DeliveryReviewTaskTarget {
  runId?: string;
  step?: string;
}

export interface DeliveryReviewTask {
  id: string;
  title: string;
  acceptanceCriteria: string[];
  severity: 'blocking' | 'follow-up';
  status: 'pending' | 'running' | 'done' | 'cancelled';
  target?: DeliveryReviewTaskTarget;
  createdAt: string;
  completedAt?: string;
}

export interface DeliveryEvent {
  at: string;
  kind: string;
  detail?: string;
}

export interface DeliveryFailureRef extends ExecutionFailureRef {
  runId: string;
  resumeCommand: string;
}

export interface DeliveryState {
  schemaVersion: 1;
  id: string;
  profile: DeliveryProfile;
  request: DeliveryRequest;
  status: DeliveryStatus;
  projectContextRunId?: string;
  featureRunId?: string;
  workerRunIds: string[];
  completedStages: string[];
  reviewRevision: number;
  reviewTasks: DeliveryReviewTask[];
  events: DeliveryEvent[];
  createdAt: string;
  updatedAt: string;
  lastError?: string;
  /** Current retryable execution failure, cleared once resume passes it. */
  lastFailure?: DeliveryFailureRef;
  /** Append-only delivery-level links to run failure logs. */
  failureHistory?: DeliveryFailureRef[];
}

export const DEFAULT_EXISTING_PROJECT_PROFILE: DeliveryProfile = {
  id: 'existing-project-autonomous',
  projectContextMode: 'infer-or-refresh',
  reviewStrategy: 'aggregate',
  maxParallelWorkers: 3,
  openFeaturePullRequest: true,
  mergePolicy: 'human-only',
};

export function validateDeliveryRequest(request: DeliveryRequest): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(request.id)) {
    throw new Error(`Invalid delivery id "${request.id}".`);
  }
  if (!request.title.trim()) throw new Error('Delivery title is required.');
  if (request.description.trim().length < 20) {
    throw new Error('Delivery description must contain at least 20 characters.');
  }
  if (request.source && !['manual', 'file', 'jira', 'github', 'other'].includes(request.source.type)) {
    throw new Error(`Unsupported delivery source type "${String(request.source.type)}".`);
  }
}
import type { ExecutionFailureRef } from '../runs/RunState';
