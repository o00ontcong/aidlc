import * as fs from 'fs';
import * as path from 'path';

export type ProjectDocumentId = 'agents' | 'project' | 'status' | 'decisions';

export interface ProjectDocumentSummary {
  id: ProjectDocumentId;
  label: string;
  description: string;
  path: string;
  exists: boolean;
  updatedAt?: string;
  excerpt?: string;
}

export interface ProjectWorkspaceSummary {
  initialized: boolean;
  readyCount: number;
  totalCount: number;
  documents: ProjectDocumentSummary[];
}

const DOCUMENTS: Array<{
  id: ProjectDocumentId;
  label: string;
  description: string;
  filename: string;
}> = [
  {
    id: 'agents',
    label: 'Working agreement',
    description: 'Persistent instructions every agent reads before and after a task.',
    filename: 'AGENTS.md',
  },
  {
    id: 'project',
    label: 'Project brief',
    description: 'Product goal, scope, architecture, and shared constraints.',
    filename: 'PROJECT.md',
  },
  {
    id: 'status',
    label: 'Current status',
    description: 'Completed work, active work, blockers, and the next priority.',
    filename: 'STATUS.md',
  },
  {
    id: 'decisions',
    label: 'Decision log',
    description: 'Durable technical and product decisions with their rationale.',
    filename: 'DECISIONS.md',
  },
];

function excerpt(markdown: string): string | undefined {
  const text = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('<!--'))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) { return undefined; }
  return text.length > 180 ? `${text.slice(0, 177).trimEnd()}…` : text;
}

export function readProjectWorkspace(workspaceRoot: string): ProjectWorkspaceSummary {
  const documents = DOCUMENTS.map((document): ProjectDocumentSummary => {
    const filePath = path.join(workspaceRoot, document.filename);
    if (!fs.existsSync(filePath)) {
      return { ...document, path: filePath, exists: false };
    }
    try {
      const stat = fs.statSync(filePath);
      const content = fs.readFileSync(filePath, 'utf8');
      return {
        ...document,
        path: filePath,
        exists: true,
        updatedAt: stat.mtime.toISOString(),
        excerpt: excerpt(content),
      };
    } catch {
      return { ...document, path: filePath, exists: true };
    }
  });
  const readyCount = documents.filter((document) => document.exists).length;
  return {
    initialized: readyCount === documents.length,
    readyCount,
    totalCount: documents.length,
    documents,
  };
}

function safeProjectName(value: string): string {
  const trimmed = value.trim();
  return trimmed || 'Project';
}

function templates(projectName: string): Record<ProjectDocumentId, string> {
  const name = safeProjectName(projectName);
  return {
    agents: `# Project working agreement

## Before starting a task

1. Read \`PROJECT.md\`, \`STATUS.md\`, and \`DECISIONS.md\`.
2. Inspect the assigned task and the current implementation.
3. Summarize what is already complete before editing.
4. Keep changes inside the assigned task scope.

## Before finishing a task

1. Run the relevant tests and checks.
2. Update \`STATUS.md\` with completed work, blockers, and next steps.
3. Record durable architectural or product decisions in \`DECISIONS.md\`.
4. Report changed files, verification results, risks, and remaining work.
`,
    project: `# ${name}

## Goal

Describe the outcome this project should achieve.

## Scope

- In scope:
- Out of scope:

## Architecture

Document the important components, boundaries, and integration points.

## Shared constraints

- Add constraints that every task must preserve.
`,
    status: `# Project status

## Completed

- Nothing recorded yet.

## In progress

- No active task recorded.

## Blocked

- No blockers recorded.

## Next

- Define the first task and its acceptance criteria.
`,
    decisions: `# Decision log

Record decisions that future tasks must understand. Do not rewrite history; add a new row when a decision changes.

| Date | Decision | Rationale | Affected tasks |
| --- | --- | --- | --- |
| YYYY-MM-DD | Initial project setup | Establish shared context for every task | All |
`,
  };
}

/** Create only missing shared-context files. Existing user content is never changed. */
export function initializeProjectWorkspace(workspaceRoot: string, projectName: string): string[] {
  const content = templates(projectName);
  const created: string[] = [];
  for (const document of DOCUMENTS) {
    const filePath = path.join(workspaceRoot, document.filename);
    if (fs.existsSync(filePath)) { continue; }
    fs.writeFileSync(filePath, content[document.id], { encoding: 'utf8', flag: 'wx' });
    created.push(filePath);
  }
  return created;
}
