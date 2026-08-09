/**
 * Adapter boundary for the already-bundled v2 AST graph implementation.
 * W3I injects the legacy command/scan bridge; this adapter never starts a
 * second scanner or makes AST graph a primary Epic state machine.
 */
export interface AstGraphStructuralFacts {
  readonly facts: readonly { kind: string; summary: string; confidence?: number }[];
}

export interface ExistingAstGraphIntegration {
  openReport(): Promise<void>;
  structuralFacts?(scope?: { epicId?: string; stageId?: string }): Promise<AstGraphStructuralFacts>;
}

export class AstGraphCapabilityAdapter {
  constructor(private readonly enabled: () => boolean, private readonly integration: ExistingAstGraphIntegration) {}

  async open(): Promise<boolean> {
    if (!this.enabled()) return false;
    await this.integration.openReport();
    return true;
  }

  async facts(scope?: { epicId?: string; stageId?: string }): Promise<AstGraphStructuralFacts | undefined> {
    if (!this.enabled() || !this.integration.structuralFacts) return undefined;
    return this.integration.structuralFacts(scope);
  }
}
