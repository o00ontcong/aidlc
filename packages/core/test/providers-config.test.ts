import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as yaml from 'js-yaml';
import { afterEach, describe, expect, it } from 'vitest';

import { ModelProviderConfigStore } from '../src/models/ModelProviderConfigStore';

describe('providers.yaml v2', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('migrates v1 config in-memory on load', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-prov-v1-'));
    roots.push(root);
    fs.mkdirSync(path.join(root, '.aidlc'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.aidlc', 'providers.yaml'),
      yaml.dump({ schemaVersion: 1, defaultProvider: 'claude' }),
    );
    const store = new ModelProviderConfigStore(root);
    const config = store.load();
    expect(config?.schemaVersion).toBe(2);
    expect(config?.providers.claude.enabled).toBe(true);
    expect(config?.providers.cursor.enabled).toBe(false);
    expect(config?.modelMappings['claude-opus-5']?.cursor).toBe('claude-opus-4-8');
  });

  it('roundtrips v2 save/load and enableProvider', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-prov-v2-'));
    roots.push(root);
    const store = new ModelProviderConfigStore(root);
    store.enableProvider('cursor');
    store.setDefaultProvider('cursor');
    const reloaded = store.load();
    expect(reloaded?.defaultProvider).toBe('cursor');
    expect(reloaded?.providers.cursor.enabled).toBe(true);
    expect(fs.existsSync(store.file())).toBe(true);
  });

  it('allows default provider before Apply (enabled=false)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-prov-default-'));
    roots.push(root);
    const store = new ModelProviderConfigStore(root);
    store.setDefaultProvider('cursor');
    const reloaded = store.load();
    expect(reloaded?.defaultProvider).toBe('cursor');
    expect(reloaded?.providers.cursor.enabled).toBe(false);
    expect(reloaded?.providers.claude.enabled).toBe(true);
  });
});
