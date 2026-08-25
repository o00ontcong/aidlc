import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, it, expect } from 'vitest';

import {
  BUILTIN_WORKFLOWS,
  assemblePipeline,
  builtinTemplatesRoot,
  collectWorkspaceRefIssues,
  getBuiltinWorkflow,
  getAllBuiltinPipelineSummaries,
  getBuiltinPipelineSummariesOf,
  getBuiltinRecipeSummaries,
  loadBuiltinPreset,
  pipelineCommandId,
  validateWorkspace,
  workflowCommandPhases,
  type WorkspaceConfig,
} from '../src';

/**
 * The iOS workflow is the first *bundle* built-in: one preset that installs a
 * parent pipeline (`aidlc-ios-foundation`, project-understanding base) plus a
 * per-epic child (`aidlc-ios-feature`), with recipes drawing from both. These
 * pin the parts a single-pipeline workflow never exercised — companion
 * pipelines in the picker, per-recipe `from`, and per-pipeline command
 * namespacing — and that the bundled markdown actually resolves on disk.
 */
const IOS = getBuiltinWorkflow('aidlc-ios')!;

function iosWorkspace(): WorkspaceConfig {
  const preset = loadBuiltinPreset(builtinTemplatesRoot(), IOS);
  return validateWorkspace({ name: IOS.name, ...preset.workspace }, 'aidlc-ios/workspace.yaml');
}

describe('aidlc-ios built-in workflow', () => {
  it('is registered without displacing the default workflow', () => {
    expect(IOS).toBeDefined();
    // The SDLC workflow stays index 0 — `BUILTIN_WORKFLOWS[0]` is the default
    // pipeline the Builder and artifact-template lookups fall back to.
    expect(BUILTIN_WORKFLOWS[0].id).toBe('aidlc-workflow');
    expect(BUILTIN_WORKFLOWS.map((w) => w.id)).toContain('aidlc-ios');
  });

  it('installs both pipelines and surfaces both in the picker', () => {
    const config = iosWorkspace();
    expect(config.pipelines.map((p) => String(p.id)))
      .toEqual(['aidlc-ios-foundation', 'aidlc-ios-feature']);
    expect(getBuiltinPipelineSummariesOf(IOS).map((s) => s.id))
      .toEqual(['aidlc-ios-foundation', 'aidlc-ios-feature']);
    // The no-workspace fallback must offer the companion too, not just primaries.
    expect(getAllBuiltinPipelineSummaries().map((s) => s.id))
      .toContain('aidlc-ios-feature');
  });

  it('resolves every reference in the generated workspace', () => {
    // Catches a recipe whose steps live in the *other* pipeline — the failure
    // mode when `RecipeDef.from` is dropped.
    expect(collectWorkspaceRefIssues(iosWorkspace())).toEqual([]);
  });

  it('routes each recipe to its own source pipeline', () => {
    const byId = new Map(getBuiltinRecipeSummaries().map((r) => [r.id, r]));
    expect(byId.get('ios-bootstrap')?.from).toBe('aidlc-ios-foundation');
    expect(byId.get('ios-feature')?.from).toBe('aidlc-ios-feature');
    // Agents resolve against the recipe's own pipeline, so no step drops out.
    expect(byId.get('ios-feature')?.agents).toEqual([
      'aidlc-ios-po', 'aidlc-ios-tech-lead', 'aidlc-ios-developer', 'aidlc-ios-developer',
    ]);
  });

  it('requires a build-only auto-review for implementation', () => {
    const config = iosWorkspace();
    const feature = config.pipelines.find((pipeline) => pipeline.id === 'aidlc-ios-feature')!;
    const implement = feature.steps.find((step) => step.name === 'implement')!;

    expect(implement.auto_review).toBe(true);
    expect(implement.auto_review_runner).toBe('.aidlc/validators/swift-build.mjs');
    expect(implement.produces_contains).toEqual(['## Build Evidence']);

    const validator = fs.readFileSync(
      path.join(builtinTemplatesRoot(), 'templates', 'ios', 'validators', 'swift-build.mjs'),
      'utf8',
    );
    expect(validator).toContain("['build']");
    expect(validator).not.toContain("['test']");
  });

  it('leaves no unsatisfiable gate when a recipe drops steps', () => {
    // `assemblePipeline` re-links `depends_on` for the reduced step set but
    // copies `requires` verbatim. So a phase that requires an artifact its own
    // pipeline produces would hard-block at markStepDone in any recipe that
    // dropped the producing step (`ios-small` drops `create-plan`, which is
    // the only producer of TASK-PLAN.md).
    const config = iosWorkspace();
    const ownPipelineProduces = new Set(
      config.pipelines.flatMap((p) => p.steps.flatMap((s) => s.produces ?? [])),
    );
    for (const recipe of config.recipes) {
      const assembled = assemblePipeline(config, {
        recipeId: recipe.id,
        pipelineId: `P-${recipe.id}`,
      });
      const producedHere = new Set(
        (assembled.steps as Array<{ produces?: string[] }>).flatMap((s) => s.produces ?? []),
      );
      const from = config.pipelines.find((p) => String(p.id) === recipe.from)!;
      const producedByRecipeSource = new Set(from.steps.flatMap((s) => s.produces ?? []));
      for (const step of assembled.steps as Array<{ name?: string; requires?: string[] }>) {
        for (const req of step.requires ?? []) {
          // Fine: satisfied inside this run, or an input from the *other*
          // pipeline (the CONTEXT-MANIFEST.json hand-off). Not fine: the
          // recipe's own source pipeline is the only producer and it got cut.
          const danglesInSource = producedByRecipeSource.has(req) && !producedHere.has(req);
          expect(
            danglesInSource,
            `recipe "${recipe.id}" step "${step.name}" requires "${req}", produced only by a dropped step`,
          ).toBe(false);
          expect(ownPipelineProduces.has(req) || producedHere.has(req)).toBe(true);
        }
      }
    }
  });

  it('namespaces slash commands per owning pipeline', () => {
    const commands = workflowCommandPhases(IOS)
      .map(({ pipelineId, phase }) => pipelineCommandId(pipelineId, phase.id));
    expect(commands).toContain('aidlc-ios-foundation-scan-project');
    expect(commands).toContain('aidlc-ios-feature-implement');
    expect(new Set(commands).size).toBe(commands.length);
  });

  it('ships every persona, skill and validator the phases reference', () => {
    const dir = path.join(builtinTemplatesRoot(), 'templates', IOS.templatesDir);
    for (const phase of IOS.phases) {
      expect(fs.existsSync(path.join(dir, 'agents', `${phase.persona}.md`)), phase.persona).toBe(true);
      for (const skill of phase.skillFiles) {
        expect(fs.existsSync(path.join(dir, 'skills', `${skill}.md`)), skill).toBe(true);
      }
      if (phase.autoReview && phase.autoReviewRunner) {
        const runner = path.basename(phase.autoReviewRunner);
        expect(fs.existsSync(path.join(dir, 'validators', runner)), runner).toBe(true);
      }
    }
    // Composed bodies must carry real content, not the missing-file placeholder.
    const preset = loadBuiltinPreset(builtinTemplatesRoot(), IOS);
    for (const [phaseId, body] of Object.entries(preset.skillContents)) {
      expect(body, phaseId).not.toContain('file missing:');
    }
  });

  it('cannot collide with another workflow in ~/.claude', () => {
    // globalDefaultsInstaller writes `aidlc-<source filename>.md`, so two
    // workflows sharing a persona/skill filename would overwrite each other.
    const filenames = (kind: 'agents' | 'skills') =>
      BUILTIN_WORKFLOWS.flatMap((w) => {
        const dir = path.join(builtinTemplatesRoot(), 'templates', w.templatesDir, kind);
        return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')) : [];
      });
    for (const kind of ['agents', 'skills'] as const) {
      const all = filenames(kind);
      const dupes = all.filter((f, i) => all.indexOf(f) !== i);
      expect(dupes, `${kind} installed to the same global path`).toEqual([]);
    }
  });
});
