/**
 * Calls the existing annotation/Annotron integration through an injected
 * bridge. Structured feedback is returned to the unified Epic review action,
 * never stored in a separate annotation review state machine.
 */
export interface ExistingAnnotationIntegration {
  openArtifact(input: { epicId: string; artifactPath: string }): Promise<void>;
}

export interface AnnotationFeedback {
  readonly artifactId: string;
  readonly feedback: string;
}

export class AnnotationCapabilityAdapter {
  constructor(private readonly enabled: () => boolean, private readonly integration: ExistingAnnotationIntegration) {}

  async open(input: { epicId: string; artifactPath: string }): Promise<boolean> {
    if (!this.enabled()) return false;
    await this.integration.openArtifact(input);
    return true;
  }

  toReviewFeedback(artifactId: string, feedback: string): AnnotationFeedback | undefined {
    const normalized = feedback.trim();
    return normalized ? { artifactId, feedback: normalized } : undefined;
  }
}
