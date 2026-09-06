/**
 * `.aidlc/project-policy.yaml` (implementation plan §9.4, §D9, §18.2) —
 * versioned review policy AIDLC enforces in core; Git/branch-protection/
 * CODEOWNERS remain the real permission layer (§D9: "AIDLC khong dong vai
 * tro identity provider").
 */

import { z } from 'zod';

export const ProjectPolicySchema = z.object({
  schemaVersion: z.literal(1),
  contextReview: z.object({
    approvalsRequired: z.number().int().min(0),
    allowSelfApproval: z.boolean(),
    conflictResolutionRole: z.string().min(1),
  }),
  localFallback: z.object({
    ownerIds: z.array(z.string().min(1)).default([]),
  }),
});
export type ProjectPolicy = z.infer<typeof ProjectPolicySchema>;

/** Used read-only whenever `.aidlc/project-policy.yaml` is missing (plan §D9: "core dung dung default tren o che do read-only"). */
export const DEFAULT_PROJECT_POLICY: ProjectPolicy = {
  schemaVersion: 1,
  contextReview: {
    approvalsRequired: 1,
    allowSelfApproval: false,
    conflictResolutionRole: 'maintainer',
  },
  localFallback: {
    ownerIds: [],
  },
};

export function parseProjectPolicy(raw: unknown): ProjectPolicy {
  const result = ProjectPolicySchema.safeParse(raw);
  if (!result.success) {
    const summary = result.error.issues.slice(0, 5).map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Invalid .aidlc/project-policy.yaml:\n${summary}`);
  }
  return result.data;
}
