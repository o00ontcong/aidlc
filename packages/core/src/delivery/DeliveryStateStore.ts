import * as fs from 'fs';
import * as path from 'path';

import type { DeliveryState } from './DeliveryTypes';

const DELIVERY_DIR = path.join('.aidlc', 'deliveries');

export class DeliveryStateStore {
  static dir(workspaceRoot: string): string {
    return path.join(workspaceRoot, DELIVERY_DIR);
  }

  static file(workspaceRoot: string, deliveryId: string): string {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(deliveryId)) {
      throw new Error(`Invalid delivery id "${deliveryId}".`);
    }
    return path.join(this.dir(workspaceRoot), deliveryId, 'state.json');
  }

  static load(workspaceRoot: string, deliveryId: string): DeliveryState | null {
    const file = this.file(workspaceRoot, deliveryId);
    if (!fs.existsSync(file)) return null;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as DeliveryState;
      return parsed?.schemaVersion === 1 ? parsed : null;
    } catch {
      return null;
    }
  }

  static save(workspaceRoot: string, state: DeliveryState): void {
    const file = this.file(workspaceRoot, state.id);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    state.updatedAt = new Date().toISOString();
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    fs.renameSync(temp, file);
  }

  static list(workspaceRoot: string): DeliveryState[] {
    const dir = this.dir(workspaceRoot);
    if (!fs.existsSync(dir)) return [];
    const out: DeliveryState[] = [];
    for (const name of fs.readdirSync(dir)) {
      const state = this.load(workspaceRoot, name);
      if (state) out.push(state);
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
}
