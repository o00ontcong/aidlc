import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import { autonomousDeliveryReadiness } from '../src/webview/lib/autonomousDelivery';

const complete = [
  { id: 'project-context', steps: Array(7) },
  { id: 'cohesive-feature', steps: Array(14) },
  { id: 'cohesive-work-package', steps: Array(7) },
];

describe('Autonomous Delivery UI', () => {
  it('accepts the current three-pipeline Cohesive Delivery bundle', () => {
    expect(autonomousDeliveryReadiness(complete)).toEqual({
      ready: true,
      missingOrOutdated: [],
    });
  });

  it('rejects the legacy four-step project-context pipeline', () => {
    const pipelines = complete.map((pipeline) =>
      pipeline.id === 'project-context' ? { ...pipeline, steps: Array(4) } : pipeline,
    );
    expect(autonomousDeliveryReadiness(pipelines)).toEqual({
      ready: false,
      missingOrOutdated: ['project-context (4/7 steps)'],
    });
  });

  it('wires every lifecycle action from the modal to a host command', () => {
    const root = path.resolve(process.cwd());
    const modal = fs.readFileSync(path.join(root, 'src/webview/components/AutonomousDeliveryModal.tsx'), 'utf8');
    const host = fs.readFileSync(path.join(root, 'src/v2/workspaceWebview.ts'), 'utf8');
    const messages = [
      'startAutonomousDelivery',
      'startAutonomousDeliveryInline',
      'resumeAutonomousDelivery',
      'openAutonomousReviewSummary',
      'addAutonomousReviewTask',
      'editInferredProjectContext',
      'resumeAutonomousAfterMerge',
      'applyCohesiveDelivery',
    ];
    for (const message of messages) {
      expect(modal).toContain(message);
      expect(host).toContain(`case '${message}'`);
    }
    expect(host).toContain('await startAutonomousDeliveryFromRequest');
    expect(host).toContain('await resumeAutonomousDeliveryCommand');
    expect(host).not.toContain("case 'startAutonomousDelivery':\n        await vscode.commands.executeCommand");
  });
});
