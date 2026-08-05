---
description: Load and validate one approved work package against the frozen Feature Contract.
---

# Cohesive Work Package — Load Package

For worker run `$ARGUMENTS`, read `.aidlc/skills/cohesive-work-package-workflow.md`, then execute only `Phase: load-package`. Resolve `feature_id` and `package_id` from inputs, write `PACKAGE-CONTEXT.md`, stop on stale/blocked dependencies, then tell the user to Mark Step Done.

