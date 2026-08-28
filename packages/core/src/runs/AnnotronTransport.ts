/**
 * {@link ReviewTransport} backed by the local annotron review server.
 *
 * Deliberately thin. It registers the bundle and reads back a verdict; it does
 * not start the server, own a browser, or interpret the decision. Starting
 * annotron is the caller's business (the CLI spawns it, the extension manages it
 * as a capability), and interpreting the verdict is the state machine's — see
 * `applyTransportVerdict`, which re-checks everything this reports.
 *
 * ## What this is not
 *
 * `/verdict` is an unauthenticated loopback HTTP route. Anything that can reach
 * 127.0.0.1 on annotron's port can post a verdict, so the `reviewer` field this
 * carries is *attested by the transport*, not proven. Core treats it as
 * untrusted input for exactly that reason. Closing the gap needs a per-session
 * token in annotron's contract, which is not implemented; until then the honest
 * description of this layer is "the browser tells us who clicked", not "we know
 * a human clicked".
 */
import * as crypto from 'crypto';

import type { ReviewBundle } from './ArtifactReview';
import type { OpenResult, ReviewTransport, TransportVerdict } from './ReviewSession';

/** Where annotron listens unless told otherwise. Matches its own default. */
export const ANNOTRON_DEFAULT_BASE = 'http://127.0.0.1:7321';

export class AnnotronTransportError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'AnnotronTransportError';
  }
}

export class AnnotronTransport implements ReviewTransport {
  constructor(
    /** Absolute workspace root the bundle's relative paths resolve against. */
    private readonly workspaceRoot: string,
    private readonly baseUrl: string = ANNOTRON_DEFAULT_BASE,
    /** Injectable for tests; defaults to the platform fetch. */
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /**
   * Register every artifact in the bundle as a formal review session.
   *
   * One session per file, each carrying the same gate identity, because
   * annotron's unit of review is a file. Registration is idempotent on its side,
   * so reopening a gate re-registers harmlessly.
   */
  async open(bundle: ReviewBundle): Promise<OpenResult> {
    const artifacts = bundle.artifacts.map((a) => ({
      path: this.absolute(a.path),
      hash: a.hash,
    }));
    let supersededVerdict: TransportVerdict | null = null;
    // A capability for whoever gets handed the review link. The server keeps the
    // first token minted for a bundle, so reopening a gate does not lock out a
    // tab already holding one — which means the value we get back may not be the
    // one offered here.
    const offered = crypto.randomBytes(32).toString('hex');
    let token: string | null = null;

    for (const artifact of bundle.artifacts) {
      const res = await this.fetchImpl(`${this.baseUrl}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file: this.absolute(artifact.path),
          review: {
            runId: bundle.runId,
            stepIdx: bundle.stepIdx,
            stepRevision: bundle.stepRevision,
            reviewRevision: bundle.reviewRevision,
            bundleHash: bundle.bundleHash,
            token: offered,
            // The whole bundle, in every window: each one can then show what is
            // being decided and refuse an approval when *any* file drifted.
            artifacts,
          },
        }),
      });
      if (!res.ok) {
        throw new AnnotronTransportError(
          `annotron refused to open a review for ${artifact.path} (${res.status})`,
          res.status,
        );
      }
      // Registration reports a verdict it had to discard because the content
      // moved on. Any one file reporting it is enough — the bundle is one gate.
      const body = (await res.json().catch(() => ({}))) as {
        supersededVerdict?: TransportVerdict | null;
        token?: string | null;
      };
      if (body.supersededVerdict) { supersededVerdict = body.supersededVerdict; }
      if (body.token) { token = body.token; }
    }

    return { supersededVerdict, token };
  }

  /**
   * The verdict for this gate, or `null` while nobody has decided.
   *
   * A multi-file bundle is one decision, so the first recorded verdict closes
   * it: every session is bound to the same bundle hash, and a reviewer deciding
   * in one window has decided for the bundle. Conflicting verdicts are not
   * possible — once one lands, the others refuse a second.
   */
  async read(bundle: ReviewBundle): Promise<TransportVerdict | null> {
    for (const artifact of bundle.artifacts) {
      const url = `${this.baseUrl}/verdict?file=${encodeURIComponent(this.absolute(artifact.path))}`;
      const res = await this.fetchImpl(url);
      if (!res.ok) {
        throw new AnnotronTransportError(
          `annotron could not report the verdict for ${artifact.path} (${res.status})`,
          res.status,
        );
      }
      const body = (await res.json()) as {
        review?: { bundleHash?: string };
        verdict?: TransportVerdict | null;
      };

      // A verdict recorded against a different bundle belongs to another round.
      // Ignoring it is the safe reading: this gate is simply still undecided.
      if (body.review?.bundleHash !== bundle.bundleHash) { continue; }
      if (body.verdict) { return body.verdict; }
    }
    return null;
  }

  private absolute(relativePath: string): string {
    return relativePath.startsWith('/')
      ? relativePath
      : `${this.workspaceRoot.replace(/\/$/, '')}/${relativePath}`;
  }
}
