import * as fs from 'fs';
import * as path from 'path';

export type ProjectDocumentId = 'agents';

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
    agents: `# ${name} — working agreement

## Before starting a task

1. Inspect the assigned task and the current implementation.
2. Summarize what is already complete before editing.
3. Keep changes inside the assigned task scope.

## Before finishing a task

1. Run the relevant tests and checks.
2. Report changed files, verification results, risks, and remaining work.
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
