/**
 * The Markdown contract for every Discover step — which files a step owns,
 * which `##` sections live in them, what shape their content takes, and what
 * "done" means. Purely declarative: nothing here reads or writes a file, so
 * both the parser (`mdParse.ts`) and the checker (`validate.ts`) can depend
 * on it without a cycle.
 *
 * Anything a doc contains that is NOT declared here is user territory — the
 * parser keeps it verbatim and the patcher never touches it (plan §2.1 rule 5).
 */

import type { DiscoverStepId } from '../contracts/discover';

export type SectionKind = 'prose' | 'items' | 'records';

export interface RecordFieldSpec {
  /** The literal label written as `- **Label:** value`. */
  label: string;
  /** Rendered as a nested bullet list rather than an inline value. */
  list?: boolean;
  /** Missing on a record makes that record incomplete for `recordFields` DoD rules. */
  required?: boolean;
}

export interface SectionSpec {
  /** Stable key used by ops, DoD rules and the UI. Never written to the file. */
  key: string;
  /** The literal `## ` heading text written into the Markdown. */
  heading: string;
  kind: SectionKind;
  /**
   * `ascii-tree` sections must be a fenced ```text block (Feature tree,
   * Layering, Folder tree, Skeleton tree, Data flow, Data overview).
   * `mermaid-flowchart` sections must be a fenced ```mermaid `flowchart TD`
   * (Screen flow). An essay or a missing heading here is a bug — scan/fill
   * rewrite it.
   */
  shape?: 'ascii-tree' | 'mermaid-flowchart';
  /** Prefix used when minting the next id, e.g. `FR` → `FR-03`. */
  idPrefix?: string;
  /**
   * Ids are minted per group rather than globally — `NFR-PERF-01`,
   * `F-VIDEO-02`. Callers supply the group; `nextId` slots it in.
   */
  grouped?: boolean;
  /** Full id shape. An id that fails this is reported, never silently rewritten. */
  idPattern?: RegExp;
  fields?: RecordFieldSpec[];
  hint?: string;
}

export interface DocFileSpec {
  /** Path relative to `docsRoot`, e.g. `product/REQUIREMENTS.md`. */
  path: string;
  /** The `# ` title written at the top of a freshly created file. */
  title: string;
  sections: SectionSpec[];
}

/** A sibling directory of free-form docs a step owns (today: ADRs). */
export interface ExtraDirSpec {
  path: string;
  pattern: RegExp;
  label: string;
}

export type DodRuleSpec =
  | { kind: 'proseFilled'; file: string; section: string }
  | { kind: 'minItems'; file: string; section: string; count: number }
  | { kind: 'minRecords'; file: string; section: string; count: number }
  | { kind: 'recordFields'; file: string; section: string; fields: string[] }
  | {
      /** Every id in `from` must be mentioned somewhere in `by`'s items/records. */
      kind: 'coverage';
      from: { file: string; section: string };
      by: { file: string; section: string };
    }
  | { kind: 'minExtraFiles'; count: number };

export interface DodRule {
  id: string;
  level: 'required' | 'optional';
  label: string;
  rule: DodRuleSpec;
}

export interface DiscoverStepSpec {
  id: DiscoverStepId;
  order: number;
  /** English title — written into `#` headings and the agent command. */
  label: string;
  /** Vietnamese title shown next to `label` in the Discover rail. */
  labelVi: string;
  /** One line of intent, reused by the agent command body and the UI. */
  goal: string;
  files: DocFileSpec[];
  extraDir?: ExtraDirSpec;
  dod: DodRule[];
}

// ── id shapes ──────────────────────────────────────────────────────────────

const plain = (prefix: string) => new RegExp(`^${prefix}-\\d{2,}$`);
const grouped = (prefix: string) => new RegExp(`^${prefix}-[A-Z0-9]+-\\d{2,}$`);

// ── file paths (also the keys DoD rules reference) ─────────────────────────

export const DOC_IDEA = 'product/IDEA.md';
export const DOC_PRODUCT = 'product/PRODUCT.md';
export const DOC_REQUIREMENTS = 'product/REQUIREMENTS.md';
export const DOC_FEATURES = 'product/FEATURES.md';
export const DOC_USE_CASES = 'product/USE_CASES.md';
export const DOC_USER_FLOWS = 'product/USER_FLOWS.md';
export const DOC_DATA_MODEL = 'architecture/DATA_MODEL.md';
export const DOC_ARCHITECTURE = 'architecture/ARCHITECTURE.md';
export const DOC_MODULES = 'architecture/MODULES.md';
export const DOC_DATA_FLOW = 'architecture/DATA_FLOW.md';
export const DOC_TECH_STACK = 'architecture/TECH_STACK.md';
export const DOC_PROJECT_STRUCTURE = 'architecture/PROJECT_STRUCTURE.md';
export const DOC_IMPLEMENTATION_PLAN = 'plans/IMPLEMENTATION_PLAN.md';
export const DOC_SKELETON = 'plans/SKELETON.md';

/** Free-form docs the pipeline can generate but no step owns as an output. */
export const DEV_DOC_PATHS = [
  'development/CODING_RULES.md',
  'development/TESTING_RULES.md',
  'development/GIT_WORKFLOW.md',
] as const;

export const DISCOVER_STEPS: DiscoverStepSpec[] = [
  {
    id: 'idea',
    order: 1,
    label: 'Idea',
    labelVi: 'Ý tưởng',
    goal: 'Pin down the problem, who has it, the core value, and the smallest MVP.',
    files: [{
      path: DOC_IDEA,
      title: 'Idea',
      sections: [
        { key: 'seed', heading: 'Original sentence', kind: 'prose' },
        { key: 'problem', heading: 'Problem', kind: 'prose' },
        { key: 'users', heading: 'Users', kind: 'items', idPrefix: 'U', idPattern: plain('U') },
        { key: 'value', heading: 'Core value', kind: 'prose' },
        { key: 'mvp', heading: 'Minimum MVP', kind: 'prose' },
      ],
    }],
    dod: [
      { id: 'problem', level: 'required', label: 'Problem', rule: { kind: 'proseFilled', file: DOC_IDEA, section: 'problem' } },
      { id: 'users', level: 'required', label: 'At least one user', rule: { kind: 'minItems', file: DOC_IDEA, section: 'users', count: 1 } },
      { id: 'value', level: 'required', label: 'Core value', rule: { kind: 'proseFilled', file: DOC_IDEA, section: 'value' } },
      { id: 'mvp', level: 'required', label: 'Minimum MVP', rule: { kind: 'proseFilled', file: DOC_IDEA, section: 'mvp' } },
    ],
  },
  {
    id: 'product',
    order: 2,
    label: 'Product Definition',
    labelVi: 'Định nghĩa sản phẩm',
    goal: 'Turn the idea into a product definition: problem, users, value, platforms, MVP scope, non-goals.',
    files: [{
      path: DOC_PRODUCT,
      title: 'Product',
      sections: [
        { key: 'problem', heading: 'Problem', kind: 'prose' },
        { key: 'targetUsers', heading: 'Target users', kind: 'items', idPrefix: 'TU', idPattern: plain('TU') },
        { key: 'value', heading: 'Core value', kind: 'prose' },
        { key: 'platforms', heading: 'Platforms', kind: 'items', idPrefix: 'PLAT', idPattern: plain('PLAT') },
        { key: 'mvpScope', heading: 'MVP scope', kind: 'items', idPrefix: 'MVP', idPattern: plain('MVP') },
        { key: 'outOfScope', heading: 'Out of scope', kind: 'items', idPrefix: 'OOS', idPattern: plain('OOS') },
        { key: 'future', heading: 'Future features', kind: 'items', idPrefix: 'FUT', idPattern: plain('FUT') },
      ],
    }],
    dod: [
      { id: 'problem', level: 'required', label: 'Problem', rule: { kind: 'proseFilled', file: DOC_PRODUCT, section: 'problem' } },
      { id: 'targetUsers', level: 'required', label: 'At least one target user', rule: { kind: 'minItems', file: DOC_PRODUCT, section: 'targetUsers', count: 1 } },
      { id: 'value', level: 'required', label: 'Core value', rule: { kind: 'proseFilled', file: DOC_PRODUCT, section: 'value' } },
      { id: 'mvpScope', level: 'required', label: 'At least one MVP scope item', rule: { kind: 'minItems', file: DOC_PRODUCT, section: 'mvpScope', count: 1 } },
      { id: 'outOfScope', level: 'optional', label: 'Out of scope', rule: { kind: 'minItems', file: DOC_PRODUCT, section: 'outOfScope', count: 1 } },
      { id: 'platforms', level: 'optional', label: 'Platforms', rule: { kind: 'minItems', file: DOC_PRODUCT, section: 'platforms', count: 1 } },
    ],
  },
  {
    id: 'requirements',
    order: 3,
    label: 'Requirements',
    labelVi: 'Yêu cầu',
    goal: 'State verifiable functional requirements plus the non-functional ones that constrain them.',
    files: [{
      path: DOC_REQUIREMENTS,
      title: 'Requirements',
      sections: [
        { key: 'functional', heading: 'Functional requirements', kind: 'items', idPrefix: 'FR', idPattern: plain('FR'), hint: 'One checkable behaviour per line.' },
        { key: 'nonFunctional', heading: 'Non-functional requirements', kind: 'items', idPrefix: 'NFR', grouped: true, idPattern: grouped('NFR'), hint: 'Group by category: NFR-PERF-01, NFR-A11Y-01, …' },
      ],
    }],
    dod: [
      { id: 'functional', level: 'required', label: 'At least 3 functional requirements', rule: { kind: 'minItems', file: DOC_REQUIREMENTS, section: 'functional', count: 3 } },
      { id: 'nonFunctional', level: 'required', label: 'At least one non-functional requirement', rule: { kind: 'minItems', file: DOC_REQUIREMENTS, section: 'nonFunctional', count: 1 } },
    ],
  },
  {
    id: 'features',
    order: 4,
    label: 'Feature Breakdown',
    labelVi: 'Chia feature',
    goal: 'Break the requirements into feature groups; every requirement must land in one.',
    files: [{
      path: DOC_FEATURES,
      title: 'Feature breakdown',
      sections: [
        { key: 'tree', heading: 'Feature tree', kind: 'prose', shape: 'ascii-tree', hint: 'A fenced ```text ASCII tree. Kept verbatim.' },
        { key: 'features', heading: 'Features', kind: 'items', idPrefix: 'F', grouped: true, idPattern: grouped('F'), hint: 'Group in the id: F-VIDEO-01. Cite the FR ids the feature covers.' },
      ],
    }],
    dod: [
      { id: 'tree', level: 'required', label: 'Feature tree', rule: { kind: 'proseFilled', file: DOC_FEATURES, section: 'tree' } },
      { id: 'features', level: 'required', label: 'At least one feature', rule: { kind: 'minItems', file: DOC_FEATURES, section: 'features', count: 1 } },
      {
        id: 'coversFr',
        level: 'required',
        label: 'Every functional requirement is covered by a feature',
        rule: { kind: 'coverage', from: { file: DOC_REQUIREMENTS, section: 'functional' }, by: { file: DOC_FEATURES, section: 'features' } },
      },
    ],
  },
  {
    id: 'usecases',
    order: 5,
    label: 'Use Cases',
    labelVi: 'Luồng nghiệp vụ',
    goal: 'Turn each important feature into system behaviour: actor, trigger, main flow.',
    files: [{
      path: DOC_USE_CASES,
      title: 'Use cases',
      sections: [
        {
          key: 'useCases',
          heading: 'Use cases',
          kind: 'records',
          idPrefix: 'UC',
          idPattern: plain('UC'),
          fields: [
            { label: 'Actor', required: true },
            { label: 'Trigger', required: true },
            { label: 'Preconditions', list: true },
            { label: 'Main flow', list: true, required: true },
            { label: 'Alternate flows', list: true },
            { label: 'Postconditions', list: true },
          ],
        },
      ],
    }],
    dod: [
      { id: 'useCases', level: 'required', label: 'At least one use case', rule: { kind: 'minRecords', file: DOC_USE_CASES, section: 'useCases', count: 1 } },
      {
        id: 'useCaseFields',
        level: 'required',
        label: 'Every use case has Actor, Trigger and Main flow',
        rule: { kind: 'recordFields', file: DOC_USE_CASES, section: 'useCases', fields: ['Actor', 'Trigger', 'Main flow'] },
      },
      {
        id: 'coversFeatures',
        level: 'optional',
        label: 'Every feature has a use case',
        rule: { kind: 'coverage', from: { file: DOC_FEATURES, section: 'features' }, by: { file: DOC_USE_CASES, section: 'useCases' } },
      },
    ],
  },
  {
    id: 'userflows',
    order: 6,
    label: 'User Flow / Screen Flow',
    labelVi: 'Luồng màn hình',
    goal: 'Lay out the screens and the paths a user takes through them.',
    files: [{
      path: DOC_USER_FLOWS,
      title: 'User flow / Screen flow',
      sections: [
        { key: 'screenFlow', heading: 'Screen flow', kind: 'prose', shape: 'mermaid-flowchart', hint: 'A fenced ```mermaid flowchart TD. Each node is a screen. Kept verbatim.' },
        { key: 'screens', heading: 'Screens', kind: 'items', idPrefix: 'SCR', idPattern: plain('SCR') },
        {
          key: 'flows',
          heading: 'Flows',
          kind: 'records',
          idPrefix: 'FLOW',
          idPattern: plain('FLOW'),
          fields: [
            { label: 'Use cases', required: true },
            { label: 'Steps', list: true, required: true },
          ],
          hint: 'A mermaid block under a flow is kept verbatim.',
        },
      ],
    }],
    dod: [
      { id: 'screenFlow', level: 'required', label: 'Screen flow', rule: { kind: 'proseFilled', file: DOC_USER_FLOWS, section: 'screenFlow' } },
      { id: 'screens', level: 'required', label: 'At least one screen', rule: { kind: 'minItems', file: DOC_USER_FLOWS, section: 'screens', count: 1 } },
      { id: 'flows', level: 'required', label: 'At least one flow', rule: { kind: 'minRecords', file: DOC_USER_FLOWS, section: 'flows', count: 1 } },
      {
        id: 'coversUseCases',
        level: 'required',
        label: 'Every use case appears in a flow',
        rule: { kind: 'coverage', from: { file: DOC_USE_CASES, section: 'useCases' }, by: { file: DOC_USER_FLOWS, section: 'flows' } },
      },
    ],
  },
  {
    id: 'architecture',
    order: 7,
    label: 'Architecture',
    labelVi: 'Kiến trúc',
    goal: 'Choose the layering and modules the use cases actually need — never the other way round.',
    files: [
      {
        path: DOC_ARCHITECTURE,
        title: 'Architecture',
        sections: [
          { key: 'layering', heading: 'Layering', kind: 'prose', shape: 'ascii-tree', hint: 'A fenced ```text ASCII stack. Kept verbatim.' },
          { key: 'layers', heading: 'Layers', kind: 'items', idPrefix: 'L', idPattern: plain('L') },
          { key: 'patterns', heading: 'Patterns', kind: 'items', idPrefix: 'PAT', idPattern: plain('PAT') },
          { key: 'rationale', heading: 'Rationale', kind: 'prose', hint: 'Why this shape fits these use cases.' },
        ],
      },
      {
        path: DOC_MODULES,
        title: 'Modules',
        sections: [
          {
            key: 'modules',
            heading: 'Modules',
            kind: 'records',
            idPrefix: 'M',
            idPattern: plain('M'),
            fields: [
              { label: 'Responsibility', required: true },
              { label: 'Depends on', list: true },
              { label: 'Folder' },
            ],
          },
        ],
      },
      {
        path: DOC_DATA_FLOW,
        title: 'Data flow',
        sections: [{ key: 'dataFlow', heading: 'Data flow', kind: 'prose', shape: 'ascii-tree', hint: 'A fenced ```text ASCII flow. Kept verbatim.' }],
      },
    ],
    dod: [
      { id: 'layering', level: 'required', label: 'Layering', rule: { kind: 'proseFilled', file: DOC_ARCHITECTURE, section: 'layering' } },
      { id: 'layers', level: 'required', label: 'At least 2 layers', rule: { kind: 'minItems', file: DOC_ARCHITECTURE, section: 'layers', count: 2 } },
      { id: 'rationale', level: 'required', label: 'Rationale', rule: { kind: 'proseFilled', file: DOC_ARCHITECTURE, section: 'rationale' } },
      { id: 'modules', level: 'required', label: 'At least 2 modules', rule: { kind: 'minRecords', file: DOC_MODULES, section: 'modules', count: 2 } },
      { id: 'moduleResponsibility', level: 'required', label: 'Every module has a responsibility', rule: { kind: 'recordFields', file: DOC_MODULES, section: 'modules', fields: ['Responsibility'] } },
      { id: 'dataFlow', level: 'optional', label: 'Data flow', rule: { kind: 'proseFilled', file: DOC_DATA_FLOW, section: 'dataFlow' } },
    ],
  },
  {
    id: 'datamodel',
    order: 8,
    label: 'Data / API / Storage',
    labelVi: 'Dữ liệu / API / Storage',
    goal: 'Sketch the data layer as a general structure — entities, repositories, API and storage — without listing fields or every endpoint.',
    files: [{
      path: DOC_DATA_MODEL,
      title: 'Data / API / Storage',
      sections: [
        { key: 'overview', heading: 'Overview', kind: 'prose', shape: 'ascii-tree', hint: 'A fenced ```text tree of the data layer. Areas, not fields or every endpoint.' },
        { key: 'entities', heading: 'Entities', kind: 'items', idPrefix: 'E', idPattern: plain('E'), hint: 'One line per concept or area. Do not list fields.' },
        { key: 'repositories', heading: 'Repositories', kind: 'items', idPrefix: 'REPO', idPattern: plain('REPO'), hint: 'One line per area, not every protocol.' },
        { key: 'api', heading: 'API endpoints', kind: 'items', idPrefix: 'API', idPattern: plain('API'), hint: 'Group by area — not every path.' },
        { key: 'storage', heading: 'Storage', kind: 'prose' },
      ],
    }],
    dod: [
      { id: 'overview', level: 'required', label: 'Overview', rule: { kind: 'proseFilled', file: DOC_DATA_MODEL, section: 'overview' } },
      { id: 'entities', level: 'required', label: 'At least one entity', rule: { kind: 'minItems', file: DOC_DATA_MODEL, section: 'entities', count: 1 } },
      { id: 'storage', level: 'optional', label: 'Storage', rule: { kind: 'proseFilled', file: DOC_DATA_MODEL, section: 'storage' } },
    ],
  },
  {
    id: 'techdecisions',
    order: 9,
    label: 'Technical Decisions',
    labelVi: 'Quyết định kỹ thuật',
    goal: 'Record the stack and — the part that matters — why each piece was chosen.',
    files: [{
      path: DOC_TECH_STACK,
      title: 'Technical decisions',
      sections: [
        {
          key: 'stack',
          heading: 'Stack',
          kind: 'records',
          idPrefix: 'TECH',
          idPattern: plain('TECH'),
          fields: [
            { label: 'Choice', required: true },
            { label: 'Why', required: true },
            { label: 'Alternatives considered', list: true },
          ],
        },
        { key: 'openQuestions', heading: 'Open questions', kind: 'items', idPrefix: 'TQ', idPattern: plain('TQ') },
      ],
    }],
    extraDir: { path: 'architecture/ADR', pattern: /^ADR-\d{3,}.*\.md$/i, label: 'ADR' },
    dod: [
      { id: 'stack', level: 'required', label: 'At least 3 stack decisions', rule: { kind: 'minRecords', file: DOC_TECH_STACK, section: 'stack', count: 3 } },
      { id: 'stackWhy', level: 'required', label: 'Every stack entry has a Choice and a Why', rule: { kind: 'recordFields', file: DOC_TECH_STACK, section: 'stack', fields: ['Choice', 'Why'] } },
      { id: 'adr', level: 'required', label: 'At least one ADR', rule: { kind: 'minExtraFiles', count: 1 } },
    ],
  },
  {
    id: 'structure',
    order: 10,
    label: 'Project Structure',
    labelVi: 'Cấu trúc project',
    goal: 'Design the folder tree the modules map onto — after the modules exist, not before.',
    files: [{
      path: DOC_PROJECT_STRUCTURE,
      title: 'Project structure',
      sections: [
        { key: 'tree', heading: 'Folder tree', kind: 'prose', shape: 'ascii-tree', hint: 'A fenced ```text ASCII tree. Kept verbatim.' },
        { key: 'naming', heading: 'Naming conventions', kind: 'items', idPrefix: 'NC', idPattern: plain('NC') },
        { key: 'mapping', heading: 'Module mapping', kind: 'items', idPrefix: 'MAP', idPattern: plain('MAP'), hint: 'One line per module: cite its M-id and the folder it owns.' },
      ],
    }],
    dod: [
      { id: 'tree', level: 'required', label: 'Folder tree', rule: { kind: 'proseFilled', file: DOC_PROJECT_STRUCTURE, section: 'tree' } },
      {
        id: 'mapsModules',
        level: 'required',
        label: 'Every module is mapped to a folder',
        rule: { kind: 'coverage', from: { file: DOC_MODULES, section: 'modules' }, by: { file: DOC_PROJECT_STRUCTURE, section: 'mapping' } },
      },
      { id: 'naming', level: 'optional', label: 'Naming conventions', rule: { kind: 'minItems', file: DOC_PROJECT_STRUCTURE, section: 'naming', count: 1 } },
    ],
  },
  {
    id: 'plan',
    order: 11,
    label: 'Implementation Plan',
    labelVi: 'Kế hoạch triển khai',
    goal: 'Slice the build into phases in dependency order — never hand the whole project over at once.',
    files: [{
      path: DOC_IMPLEMENTATION_PLAN,
      title: 'Implementation plan',
      sections: [
        {
          key: 'phases',
          heading: 'Phases',
          kind: 'records',
          idPrefix: 'PH',
          idPattern: plain('PH'),
          fields: [
            { label: 'Goal', required: true },
            { label: 'Depends on', list: true },
            { label: 'Deliverables', list: true, required: true },
            { label: 'Definition of done', list: true },
          ],
          hint: 'Cite F- / FR- ids. After a scan, phases still cover every existing feature (they are the record) — the handoff UI will not offer those as new implement-epics.',
        },
      ],
    }],
    dod: [
      { id: 'phases', level: 'required', label: 'At least 3 phases', rule: { kind: 'minRecords', file: DOC_IMPLEMENTATION_PLAN, section: 'phases', count: 3 } },
      { id: 'phaseFields', level: 'required', label: 'Every phase has a Goal and Deliverables', rule: { kind: 'recordFields', file: DOC_IMPLEMENTATION_PLAN, section: 'phases', fields: ['Goal', 'Deliverables'] } },
      {
        id: 'coversFeatures',
        level: 'optional',
        label: 'Every feature is scheduled into a phase',
        rule: { kind: 'coverage', from: { file: DOC_FEATURES, section: 'features' }, by: { file: DOC_IMPLEMENTATION_PLAN, section: 'phases' } },
      },
    ],
  },
  {
    id: 'skeleton',
    order: 12,
    label: 'Generate Skeleton',
    labelVi: 'Sinh skeleton',
    goal: 'List the real files, interfaces, config and tests phase 1 has to create.',
    files: [{
      path: DOC_SKELETON,
      title: 'Generate skeleton',
      sections: [
        { key: 'tree', heading: 'Skeleton tree', kind: 'prose', shape: 'ascii-tree', hint: 'A fenced ```text ASCII tree. Kept verbatim.' },
        { key: 'files', heading: 'Files and folders', kind: 'items', idPrefix: 'SK', idPattern: plain('SK') },
        { key: 'interfaces', heading: 'Interfaces', kind: 'items', idPrefix: 'IF', idPattern: plain('IF') },
        { key: 'config', heading: 'Config', kind: 'items', idPrefix: 'CFG', idPattern: plain('CFG') },
        { key: 'tests', heading: 'Tests', kind: 'items', idPrefix: 'TST', idPattern: plain('TST') },
      ],
    }],
    dod: [
      { id: 'tree', level: 'required', label: 'Skeleton tree', rule: { kind: 'proseFilled', file: DOC_SKELETON, section: 'tree' } },
      { id: 'files', level: 'required', label: 'At least one file or folder', rule: { kind: 'minItems', file: DOC_SKELETON, section: 'files', count: 1 } },
      { id: 'tests', level: 'optional', label: 'Tests', rule: { kind: 'minItems', file: DOC_SKELETON, section: 'tests', count: 1 } },
      { id: 'interfaces', level: 'optional', label: 'Interfaces', rule: { kind: 'minItems', file: DOC_SKELETON, section: 'interfaces', count: 1 } },
    ],
  },
];

const STEP_BY_ID = new Map(DISCOVER_STEPS.map((s) => [s.id, s]));

export function getStepSpec(id: DiscoverStepId): DiscoverStepSpec {
  const spec = STEP_BY_ID.get(id);
  if (!spec) { throw new Error(`Unknown Discover step "${id}".`); }
  return spec;
}

/** Every doc path the pipeline owns, in step order. */
export function allDocPaths(): string[] {
  return DISCOVER_STEPS.flatMap((step) => step.files.map((f) => f.path));
}

const FILE_BY_PATH = new Map(DISCOVER_STEPS.flatMap((s) => s.files.map((f) => [f.path, f] as const)));

export function getFileSpec(docPath: string): DocFileSpec | undefined {
  return FILE_BY_PATH.get(docPath);
}

const STEP_BY_PATH = new Map(DISCOVER_STEPS.flatMap((s) => s.files.map((f) => [f.path, s] as const)));

export function stepForDoc(docPath: string): DiscoverStepSpec | undefined {
  return STEP_BY_PATH.get(docPath);
}

export function getSectionSpec(docPath: string, sectionKey: string): SectionSpec | undefined {
  return getFileSpec(docPath)?.sections.find((s) => s.key === sectionKey);
}

/** Next step in pipeline order, or null at the end. */
export function nextStepId(id: DiscoverStepId): DiscoverStepId | null {
  const idx = DISCOVER_STEPS.findIndex((s) => s.id === id);
  if (idx < 0 || idx >= DISCOVER_STEPS.length - 1) { return null; }
  return DISCOVER_STEPS[idx + 1]!.id;
}
