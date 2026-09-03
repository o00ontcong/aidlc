/**
 * External-system integrations.
 *
 * Everything here is pure TypeScript, like the rest of core: no `vscode`
 * import, and network access confined to the `*Client` classes with an
 * injectable `fetch` so the logic around them stays unit-testable.
 */

// Jira — sprint reading and subtask creation.
export * from './jira/JiraTypes';
export * from './jira/JiraClient';
export * from './jira/adfToMarkdown';
export * from './jira/adfBuilder';
export * from './jira/sprintQuery';
export * from './jira/createMeta';
export * from './jira/subtaskTemplate';
export * from './jira/subtaskPlanner';
export * from './jira/subtaskPayload';

// Confluence — read-only, only to import the subtask template.
export * from './confluence/ConfluenceClient';
export * from './confluence/templateImporter';
