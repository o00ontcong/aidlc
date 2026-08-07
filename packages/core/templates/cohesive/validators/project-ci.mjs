import path from 'node:path';
import { execSync } from 'node:child_process';
import {
  artifactDir, exists, formatError, loadCharter, markdownHasGo, pass, readJson,
  readText, reject,
} from './lib.mjs';

function resolveCommands(workspaceRoot) {
  const configFile = path.join(workspaceRoot, '.aidlc', 'cohesive-ci.json');
  if (exists(configFile)) {
    const config = readJson(configFile);
    return Array.isArray(config.commands) ? config.commands : [];
  }
  // Derive conservative project checks when no explicit config exists.
  const packageFile = path.join(workspaceRoot, 'package.json');
  const commands = [];
  if (exists(packageFile)) {
    const scripts = readJson(packageFile).scripts ?? {};
    const runner = exists(path.join(workspaceRoot, 'pnpm-lock.yaml'))
      ? 'pnpm' : exists(path.join(workspaceRoot, 'yarn.lock')) ? 'yarn' : 'npm run';
    for (const name of ['lint', 'typecheck', 'test', 'build']) {
      if (typeof scripts[name] !== 'string') continue;
      const command = runner === 'yarn' ? `yarn ${name}` : `${runner} ${name}`;
      commands.push({ name, command, timeoutMs: 300_000 });
    }
  }
  return commands;
}

export default async function projectCi(ctx) {
  try {
    const charter = loadCharter(ctx.workspaceRoot);
    const requiredGates = Array.isArray(charter?.requiredQualityGates)
      ? charter.requiredQualityGates.map((g) => String(g).toLowerCase())
      : [];

    let commands = resolveCommands(ctx.workspaceRoot);

    if (requiredGates.length) {
      const present = new Set(commands.map((c) => String(c?.name ?? '').toLowerCase()));
      const missing = requiredGates.filter((g) => !present.has(g));
      if (missing.length) {
        return reject(
          `Fail-closed quality gates: CHARTER.json requiredQualityGates missing command(s): ${missing.join(', ')}. `
          + 'Add them to .aidlc/cohesive-ci.json or package.json scripts.',
        );
      }
    }

    if (!commands.length) {
      return reject('No project CI commands found. Add .aidlc/cohesive-ci.json or package scripts for lint/typecheck/test/build.');
    }

    const failures = [];
    for (const check of commands) {
      if (!check?.name || !check?.command) { failures.push('CI entry missing name/command'); continue; }
      try {
        execSync(check.command, {
          cwd: ctx.workspaceRoot,
          shell: true,
          stdio: 'pipe',
          timeout: check.timeoutMs ?? 300_000,
          maxBuffer: 4 * 1024 * 1024,
        });
      } catch (error) {
        const stdout = error?.stdout?.toString?.() ?? '';
        const stderr = error?.stderr?.toString?.() ?? '';
        failures.push(`${check.name} failed (${check.command}):\n${(`${stdout}\n${stderr}`).trim().slice(-3000)}`);
      }
    }
    const report = readText(path.join(artifactDir(ctx.workspaceRoot, ctx.state.runId), 'SYSTEM-TEST-REPORT.md'));
    if (!markdownHasGo(report)) failures.push('SYSTEM-TEST-REPORT.md does not contain a GO verdict');
    for (const check of commands) if (check?.command && !report.includes(check.command)) failures.push(`system test report omits configured command: ${check.command}`);
    if (failures.length) return reject(`Project CI rejected the integrated feature:\n- ${failures.join('\n- ')}`);
    return pass(`All ${commands.length} configured project CI command(s) passed and are recorded in SYSTEM-TEST-REPORT.md.`);
  } catch (error) {
    return reject(`Project CI validator failed: ${formatError(error)}`);
  }
}
