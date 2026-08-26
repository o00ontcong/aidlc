# ECC and AIDLC Pipeline Responsibilities

`X` in the **ECC** column means the step belongs to the ECC engineering
protocol. `X` in the **AIDLC** column means AIDLC orchestrates, enforces, or
persists state for that step.

| Step | Human | Agent | ECC | AIDLC |
|---|---|---|:---:|:---:|
| **1. Start Idea** | Describe the problem, desired outcome, and constraints. | — | — | X |
| **2. Research** | Answer clarification questions. | Read project context, code, and patterns; identify risks and unknowns. | X | X |
| **3. Review Scope** | Approve or request changes to the scope, approach, and acceptance criteria. | Update the Shape or Specification from the feedback. | — | X |
| **4. Accept Shape** | Accept the exact Shape revision. | — | — | X |
| **5. Create Epic** | Select the workflow, provider, and execution mode. | — | — | X |
| **6. Create Plan** | — | Create `PLAN.md` with patterns, files, tasks, validation, and risks. | X | X |
| **7. Review Plan** | Annotate or request changes in Plan Canvas. | Apply feedback and create a new plan revision. | X | X |
| **8. Approve Plan** | Approve the exact plan revision and content hash. | — | X | X |
| **9. Test — RED** | Clarify acceptance criteria when the test target is unclear. | Write and run a test proving that the required behavior is missing. | X | X |
| **10. Implement — GREEN** | — | Make the smallest production-code change that makes the test pass. | X | X |
| **11. Refactor** | Reapprove if the refactor changes the approved scope or architecture. | Improve the code while keeping all tests green. | X | X |
| **12. Fresh-context Review** | Decide findings that affect product behavior or scope. | Review quality, regressions, security, and plan conformance from fresh context. | X | X |
| **13. Resolve Findings** | Approve a new plan revision if a finding changes the plan. | Add regression tests, fix defects, and restore GREEN. | X | X |
| **14. Verify** | — | Run tests, build, lint, type checking, and integration checks. | X | X |
| **15. Review Evidence** | Review `REVIEW.md`, `VERIFY.md`, and any unverified limitations. | Explain the evidence and record remaining blockers. | X | X |
| **16. Remember** | Confirm which decisions should be retained. | Store decisions, evidence, deviations, and follow-ups. | X | X |
| **17. Improve** | Accept or reject a proposed reusable rule. | Propose a lesson, skill, or workflow improvement. | X | X |
| **18. Ship Approval** | Approve the commit, pull request, release, or other external action. | Prepare the delivery preview. | — | X |
| **19. Ship and Complete** | — | Perform the approved delivery action. | — | X |
