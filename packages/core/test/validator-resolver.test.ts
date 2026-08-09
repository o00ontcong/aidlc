import { describe, expect, it } from 'vitest';
import { ValidatorResolver, lockValidator, validatorResult, type BundledValidator } from '../src/validators';

const validator: BundledValidator = { id: 'ci', packId: 'sdlc-core', version: '1.0.0', description: 'CI', source: 'export default 1;\n' };

describe('ValidatorResolver', () => {
  it('resolves bundled validators by pack/version without creating project files', () => {
    const resolved = new ValidatorResolver([validator]).resolve('sdlc-core', '1.0.0', 'ci');
    expect(resolved.kind).toBe('bundled');
    expect(resolved.lock).toEqual(lockValidator(validator));
  });

  it('uses an explicit override only when its base lock agrees', () => {
    const resolver = new ValidatorResolver([validator]);
    const resolved = resolver.resolve('sdlc-core', '1.0.0', 'ci', { validatorId: 'ci', source: 'export default 2;\n', basedOn: lockValidator(validator) });
    expect(resolved.kind).toBe('override');
  });

  it('returns a structured reconciliation task with diff and actions on version mismatch', () => {
    const resolver = new ValidatorResolver([validator]);
    const resolved = resolver.resolve('sdlc-core', '1.0.0', 'ci', { validatorId: 'ci', source: 'export default custom;\n', basedOn: { ...lockValidator(validator), hash: 'sha256:old', version: '0.9.0' } });
    expect(resolved.kind).toBe('reconciliation');
    if (resolved.kind === 'reconciliation') {
      expect(resolved.task.error.code).toBe('validator.reconciliation_required');
      expect(resolved.task.diff).toContain('-export default custom;');
      expect(resolved.task.actions.map((action) => action.kind)).toContain('open-diff');
    }
  });

  it('normalizes a rejected result to typed evidence/error contracts', () => {
    const result = validatorResult({ validatorId: 'ci', decision: 'reject', summary: 'CI failed', evidence: [{ kind: 'test', ref: 'npm-test', status: 'failed' }] });
    expect(result.schemaVersion).toBe(1);
    expect(result.error?.code).toBe('validator.rejected');
  });
});
