export { extractManagedDocument, renderManagedDocument } from './ContextMarkdownBridge';
export type { ExtractedManagedSection, ExtractedManagedDocument } from './ContextMarkdownBridge';

export { ProjectContextRepository } from './ProjectContextRepository';

export { ProjectPolicyStore } from './ProjectPolicyStore';

export { ContextBootstrapService } from './ContextBootstrapService';
export type { ContextBootstrapPreview } from './ContextBootstrapService';

export { ContextProposalStore } from './ContextProposalStore';

export { ContextProjectionRenderer } from './ContextProjectionRenderer';
export type { LoadedManagedDocument } from './ContextProjectionRenderer';

export { ContextApplyTransaction } from './ContextApplyTransaction';
export type { ContextApplyTransactionResult } from './ContextApplyTransaction';

export { ContextProposalService } from './ContextProposalService';
export type {
  ContextOperationInput,
  ContextProposalGroupInput,
  StartContextProposalInput,
  FinishContextProposalInput,
  ApproveContextProposalInput,
  ApplyContextProposalInput,
  RebaseContextProposalInput,
  RequestProposalChangesInput,
  DiscardProposalInput,
} from './ContextProposalService';
