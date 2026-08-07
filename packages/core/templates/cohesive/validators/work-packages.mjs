import path from 'node:path';
import {
  artifactDir, formatError, fullCommitExists, loadCharter, pass, readJson,
  readText, reject, scopesOverlap, taskIdsFromMarkdown,
} from './lib.mjs';

function taskBlocks(taskText) {
  // Split on headings or bullets that introduce a task id.
  const ids = taskIdsFromMarkdown(taskText);
  const blocks = new Map();
  for (const id of ids) {
    const idx = taskText.indexOf(id);
    if (idx < 0) continue;
    const nextCandidates = ids
      .map((other) => (other === id ? -1 : taskText.indexOf(other, idx + id.length)))
      .filter((n) => n > idx);
    const end = nextCandidates.length ? Math.min(...nextCandidates) : taskText.length;
    blocks.set(id, taskText.slice(idx, end));
  }
  return blocks;
}

export default async function workPackages(ctx) {
  try {
    const artifacts = artifactDir(ctx.workspaceRoot, ctx.state.runId);
    const manifest = readJson(path.join(artifacts, 'WORK-PACKAGES.json'));
    const taskText = readText(path.join(artifacts, 'TASKS.md'));
    const taskIds = taskIdsFromMarkdown(taskText);
    const packages = Array.isArray(manifest.packages) ? manifest.packages : [];
    const problems = [];
    const charter = loadCharter(ctx.workspaceRoot);

    if (manifest.schemaVersion !== 1) problems.push('schemaVersion must be 1');
    if (manifest.feature !== ctx.state.runId) problems.push('manifest feature must equal the feature run id');
    if (!Number.isInteger(manifest.projectContextRevision) || manifest.projectContextRevision < 1) problems.push('projectContextRevision must be a positive integer');
    if (!Number.isInteger(manifest.featureContractRevision) || manifest.featureContractRevision < 1) problems.push('featureContractRevision must be a positive integer');
    if (!fullCommitExists(ctx.workspaceRoot, manifest.baseCommit)) problems.push('baseCommit is missing or invalid');
    if (!packages.length) problems.push('at least one cohesive work package is required');

    const blocks = taskBlocks(taskText);
    for (const id of taskIds) {
      const block = blocks.get(id) ?? '';
      if (!/Implements:\s*[^\n]*\b(?:[A-Z][A-Z0-9_-]*-)?FR\d{2,}\b/i.test(block)) {
        problems.push(`${id} is missing Implements: FR-x`);
      }
      if (!/\bAC:\s*\S/i.test(block) && !/\*\*AC:\*\*\s*\S/i.test(block)) {
        problems.push(`${id} is missing AC: (task-level acceptance criteria)`);
      }
    }

    const packageIds = new Set();
    const assignmentCount = new Map(taskIds.map((id) => [id, 0]));
    for (const pkg of packages) {
      if (!/^WP-\d{2,}$/.test(pkg.id ?? '')) problems.push(`invalid package id: ${pkg.id ?? '(missing)'}`);
      if (packageIds.has(pkg.id)) problems.push(`duplicate package id: ${pkg.id}`);
      packageIds.add(pkg.id);
      if (pkg.runId !== `${manifest.feature}-${pkg.id}`) problems.push(`${pkg.id} has invalid runId ${pkg.runId}`);
      if (!['planned', 'blocked', 'ready'].includes(pkg.status)) problems.push(`${pkg.id} has invalid planning status ${pkg.status}`);
      if (!Array.isArray(pkg.tasks) || !pkg.tasks.length) problems.push(`${pkg.id} has no tasks`);
      if (!Array.isArray(pkg.writeScope) || !pkg.writeScope.length) problems.push(`${pkg.id} has no writeScope`);
      if (!Array.isArray(pkg.acceptanceCriteria) || !pkg.acceptanceCriteria.length) problems.push(`${pkg.id} has no acceptanceCriteria`);
      for (const task of pkg.tasks ?? []) {
        if (!assignmentCount.has(task)) problems.push(`${pkg.id} references unknown task ${task}`);
        else assignmentCount.set(task, assignmentCount.get(task) + 1);
      }

      if (charter?.deliveryBudget) {
        const maxTasks = charter.deliveryBudget.maxTasksPerPackage;
        const maxFiles = charter.deliveryBudget.maxFilesPerPackage;
        if (Number.isInteger(maxTasks) && (pkg.tasks?.length ?? 0) > maxTasks) {
          problems.push(`${pkg.id} exceeds deliveryBudget.maxTasksPerPackage (${pkg.tasks.length} > ${maxTasks})`);
        }
        if (Number.isInteger(maxFiles)) {
          const fileCount = Array.isArray(pkg.ownedPaths)
            ? pkg.ownedPaths.length
            : Array.isArray(pkg.writeScope)
              ? pkg.writeScope.length
              : 0;
          // writeScope globs are a proxy when ownedPaths is absent
          if (fileCount > maxFiles) {
            problems.push(`${pkg.id} exceeds deliveryBudget.maxFilesPerPackage (${fileCount} > ${maxFiles})`);
          }
        }
      }
    }
    for (const [id, count] of assignmentCount) {
      if (count !== 1) problems.push(`${id} is assigned ${count} times (expected exactly once)`);
    }

    const byId = new Map(packages.map((pkg) => [pkg.id, pkg]));
    const visiting = new Set();
    const visited = new Set();
    const visit = (id) => {
      if (visiting.has(id)) { problems.push(`package dependency cycle includes ${id}`); return; }
      if (visited.has(id)) return;
      visiting.add(id);
      for (const dep of byId.get(id)?.dependsOn ?? []) {
        if (!byId.has(dep)) problems.push(`${id} depends on unknown package ${dep}`);
        else visit(dep);
      }
      visiting.delete(id);
      visited.add(id);
    };
    for (const id of byId.keys()) visit(id);

    const transitivelyDepends = (from, target, seen = new Set()) => {
      if (seen.has(from)) return false;
      seen.add(from);
      for (const dep of byId.get(from)?.dependsOn ?? []) {
        if (dep === target || transitivelyDepends(dep, target, seen)) return true;
      }
      return false;
    };
    for (let i = 0; i < packages.length; i++) {
      for (let j = i + 1; j < packages.length; j++) {
        const a = packages[i];
        const b = packages[j];
        const ordered = transitivelyDepends(a.id, b.id) || transitivelyDepends(b.id, a.id);
        if (ordered) continue;
        for (const sa of a.writeScope ?? []) {
          for (const sb of b.writeScope ?? []) {
            if (scopesOverlap(sa, sb)) problems.push(`parallel packages ${a.id}/${b.id} overlap write scopes: ${sa} ↔ ${sb}`);
          }
        }
        const changes = (pkg) => new Set((pkg.contracts ?? []).filter((c) => c.mode === 'change').map((c) => c.name));
        const ac = changes(a);
        for (const name of changes(b)) if (ac.has(name)) problems.push(`parallel packages ${a.id}/${b.id} both change contract ${name}`);
      }
    }

    if (problems.length) return reject(`Invalid work-package plan:\n- ${[...new Set(problems)].join('\n- ')}`);
    return pass(`${taskIds.length} tasks are assigned exactly once across ${packages.length} cohesive packages with a valid dependency graph.`);
  } catch (error) {
    return reject(`Work-package validator failed: ${formatError(error)}`);
  }
}
