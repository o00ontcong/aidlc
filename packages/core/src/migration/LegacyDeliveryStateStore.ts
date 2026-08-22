import * as fs from 'fs';
import * as path from 'path';

/**
 * Minimal read-only view of the retired Cohesive Delivery checkpoint format.
 *
 * Project Workspace no longer creates or mutates `.aidlc/deliveries` state,
 * but existing workspaces still need this metadata while their task history is
 * being displayed or migrated.
 */
export interface LegacyDeliveryState {
  schemaVersion: 1;
  id: string;
  featureRunId?: string;
}

const LEGACY_DELIVERY_DIR = path.join('.aidlc', 'deliveries');
const VALID_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export class LegacyDeliveryStateStore {
  static load(workspaceRoot: string, deliveryId: string): LegacyDeliveryState | null {
    if (!VALID_ID.test(deliveryId)) return null;

    const file = path.join(workspaceRoot, LEGACY_DELIVERY_DIR, deliveryId, 'state.json');
    if (!fs.existsSync(file)) return null;

    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!parsed || typeof parsed !== 'object') return null;
      const state = parsed as Record<string, unknown>;
      if (state.schemaVersion !== 1 || state.id !== deliveryId) return null;
      if (state.featureRunId !== undefined && typeof state.featureRunId !== 'string') return null;
      return state as unknown as LegacyDeliveryState;
    } catch {
      return null;
    }
  }
}
