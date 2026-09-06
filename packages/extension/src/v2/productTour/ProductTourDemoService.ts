import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ChangeService, ContextBootstrapService } from '@aidlc/core';
import type { ProductTourId } from '../../shared/productTour';
import { productTourService } from './ProductTourService';
import { parseDemoMarker, PRODUCT_TOUR_DEMO_MARKER_KIND, type ProductTourDemoMarker } from './ProductTourDemoMarker';

const DEMO_DIR = 'project-lifecycle-v1';
const MARKER = '.aidlc-product-tour-demo.json';
/**
 * A disposable learning workspace lives under VS Code global storage, never
 * inside the user's project and never at a guessed home-directory path. The
 * marker is mandatory before reusing anything already at that location.
 */
export class ProductTourDemoService {
  private context: vscode.ExtensionContext | undefined;

  init(context: vscode.ExtensionContext): void { this.context = context; }

  resumeIfCurrentWorkspace(): void {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) return;
    const marker = this.markerAt(root);
    if (marker) productTourService.ensureDemoTour(marker.tourId);
  }

  async open(tourId: ProductTourId): Promise<void> {
    const context = this.context;
    if (!context) return;
    const root = path.join(context.globalStorageUri.fsPath, 'product-tours', DEMO_DIR);
    if (fs.existsSync(root)) {
      const marker = this.markerAt(root);
      if (!marker) {
        void vscode.window.showErrorMessage('AIDLC Product Tour: demo folder không có marker hợp lệ nên sẽ không bị ghi đè. Hãy kiểm tra thư mục Global Storage.');
        return;
      }
      if (marker.tourId !== tourId) {
        // This file is safe to update only after its marker proves that the
        // folder is extension-owned. It selects which coach resumes in the
        // newly opened window; no project artifact is touched.
        await vscode.workspace.fs.writeFile(
          vscode.Uri.file(path.join(root, MARKER)),
          Buffer.from(`${JSON.stringify({ kind: PRODUCT_TOUR_DEMO_MARKER_KIND, version: 1, tourId }, null, 2)}\n`, 'utf8'),
        );
      }
    } else {
      await this.seed(root, tourId);
    }
    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(root), true);
  }

  private async seed(root: string, tourId: ProductTourId): Promise<void> {
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.join(root, '.aidlc')));
    const write = async (relative: string, content: string) => {
      const uri = vscode.Uri.file(path.join(root, relative));
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(uri.fsPath)));
      await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
    };
    await write(MARKER, `${JSON.stringify({ kind: PRODUCT_TOUR_DEMO_MARKER_KIND, version: 1, tourId }, null, 2)}\n`);
    await write('README.md', '# AIDLC Product Tour demo\n\nThis folder is extension-owned. It is safe to experiment here; it is not your repository.\n');
    await write('.aidlc/workspace.yaml', [
      'version: "1.0"',
      'name: "AIDLC Product Tour Demo"',
      'agents: []',
      'skills: []',
      'pipelines: []',
      'environment: {}',
      'slash_commands: []',
      '',
    ].join('\n'));

    // Bootstrap an actual Context and Change so the tour can observe real
    // contracts from its first screen. No completed Epic, scan or proposal is
    // faked — users produce those facts through the ordinary UI.
    const bootstrap = new ContextBootstrapService(root);
    const preview = bootstrap.preview();
    if (preview.blockers.length > 0) throw new Error(`Demo Context blockers: ${preview.blockers.join(' | ')}`);
    bootstrap.apply({ actor: { kind: 'user', id: 'product-tour-demo' }, previewId: preview.previewId, sourceHashes: preview.sourceHashes });
    new ChangeService(root).create({
      commandId: 'product-tour-demo-seed-change',
      actor: { kind: 'user', id: 'product-tour-demo' },
      title: 'Demo: add a small project capability',
      type: 'feature',
      priority: 'medium',
      requirement: {
        problem: 'The demo needs one safe Change to teach the lifecycle.',
        desiredOutcome: 'Use this Change to practice Change → Epic → Context.',
        acceptanceCriteria: [{ id: 'AC-01', text: 'The learner can bind this Change in Product Tour.' }],
        inScope: ['Product Tour learning workspace'],
        outOfScope: ['The user’s real repository'],
        constraints: ['Do not pretend a delivery or Context proposal already exists'],
      },
      origin: { kind: 'user', entryPoint: 'project', actor: { kind: 'user', id: 'product-tour-demo' } },
    });
  }

  private markerAt(root: string): ProductTourDemoMarker | undefined {
    try { return parseDemoMarker(JSON.parse(fs.readFileSync(path.join(root, MARKER), 'utf8'))); } catch { return undefined; }
  }
}

export const productTourDemoService = new ProductTourDemoService();
