---
name: architecture-studio-generate
description: Analyze the current project and generate the standalone Architecture Studio diagram manifest. This command never reads or writes Epic data.
---

# Generate Architecture Studio diagrams

Analyze the current repository and write one canonical artifact:

`docs/project/architecture/ARCHITECTURE-STUDIO.json`

This is a standalone project-architecture job. It is not an Epic, is not part
of an Epic pipeline, and must not infer delivery status from task history.

## Hard isolation boundary

- Do not read anything under `docs/epics/**`.
- Do not read anything under `.aidlc/runs/**`.
- Do not read Epic state, Epic memory, feature-impact artifacts, task status,
  or generated Mermaid files.
- Do not write anywhere under `docs/epics/**` or `.aidlc/runs/**`.
- Read source code, source-adjacent config, manifests, routes, package files,
  and project-level instructions such as `AGENTS.md` or `PROJECT.md`.
- Write only `docs/project/architecture/ARCHITECTURE-STUDIO.json`. Creating its
  parent directory is allowed. Do not modify source code or other docs.

## Analysis rules

1. Inspect the real repository. Prefer AST/symbol tools when available, then
   targeted source reads. Do not invent components, screens, or relationships.
2. Every non-virtual node should include workspace-relative source evidence.
3. Keep ids stable across reruns: lowercase kebab-case derived from durable
   package, module, feature, route, or screen names.
4. Keep diagrams curated and human-scale:
   - system: 5-24 nodes;
   - layers: 3-16 nodes;
   - features: 3-36 entries;
   - screens: up to 48 entries when UI surfaces exist;
   - each flow: 3-18 nodes, at most 12 representative flows.
5. Prefer semantic roles: `focal`, `backend`, `store`, `external`, `input`,
   `security`, or `optional`.
6. Use orthogonal-friendly relationships. Keep edge labels short; put HTTP,
   queue, event, IPC, database, or framework mechanisms in `protocol`.
7. Do not generate Mermaid, SVG, HTML, Markdown diagrams, or layout coordinates.
   Architecture Studio owns deterministic diagram-design rendering.

## Required JSON contract

Write valid UTF-8 JSON with this exact top-level shape. Optional metadata may
be omitted, but do not rename the required keys.

```json
{
  "schemaVersion": 1,
  "revision": "2026-08-23T00:00:00.000Z",
  "generatedAt": "2026-08-23T00:00:00.000Z",
  "system": {
    "nodes": [
      {
        "id": "web-app",
        "label": "Web App",
        "kind": "application",
        "layer": "interface",
        "role": "focal",
        "summary": "Primary user-facing application.",
        "file": "apps/web/src/main.tsx",
        "symbol": "App",
        "confidence": "high",
        "evidence": ["apps/web/src/main.tsx"]
      }
    ],
    "edges": [
      {
        "id": "web-to-api",
        "source": "web-app",
        "target": "api",
        "label": "requests",
        "protocol": "HTTPS",
        "role": "integration",
        "confidence": "high",
        "evidence": ["apps/web/src/api/client.ts"]
      }
    ]
  },
  "layers": {
    "nodes": [],
    "edges": []
  },
  "features": [
    {
      "id": "authentication",
      "name": "Authentication",
      "kind": "capability",
      "module": "identity",
      "summary": "Signs users in and maintains their session.",
      "confidence": "high",
      "evidence": ["src/auth"],
      "entrypoints": [
        {
          "label": "signIn",
          "file": "src/auth/sign-in.ts",
          "symbol": "signIn"
        }
      ],
      "layers": ["interface", "domain", "data"]
    }
  ],
  "screens": [
    {
      "id": "sign-in",
      "name": "Sign in",
      "kind": "screen",
      "area": "Authentication",
      "summary": "Collects credentials.",
      "evidence": ["src/screens/SignIn.tsx"]
    }
  ],
  "screenEdges": [
    {
      "id": "sign-in-to-home",
      "source": "sign-in",
      "target": "home",
      "label": "success",
      "role": "navigation",
      "evidence": ["src/router.ts"]
    }
  ],
  "flows": [
    {
      "featureId": "authentication",
      "title": "Sign-in flow",
      "nodes": [],
      "edges": []
    }
  ]
}
```

Node fields accepted by `system.nodes`, `layers.nodes`, and `flows[].nodes`:
`id`, `label`, `kind`, `layer`, `role`, `summary`, `file`, `symbol`,
`confidence`, `evidence`.

Edge fields accepted by all graph edge arrays: `id`, `source`, `target`,
`label`, `protocol`, `role`, `confidence`, `evidence`.

Feature and screen parent relationships may use `parent`; grouping may use
`area` or `module`. Every `flows[].featureId` must match an id in `features`.
Use empty arrays when the repository genuinely has no screens or focused
flows. Never add placeholder example data.

## Completion

- Use the current UTC timestamp for both `revision` and `generatedAt`.
- Validate the final file by parsing it as JSON.
- Confirm that no path in `evidence`, `file`, or `entrypoints[].file` points
  into `docs/epics` or `.aidlc/runs`.
- Finish with a concise summary containing the output path and counts for
  system nodes, layer nodes, features, screens, and flows.
