/* Dev-only bridge server for the Ideas harness (not a build input, not shipped).
 *
 * Hosts the REAL @aidlc/core IdeaService (no mocking) against a scratch
 * workspace root, and speaks the same `{type:'state', state}` / postMessage
 * protocol the real VS Code extension host uses with the webview — so
 * harness/ideas.html can render the actual WorkspaceShell/IdeasView React
 * tree wired to real backend behavior, without VS Code.
 *
 * Run:
 *   node packages/extension/harness/ideas-bridge.cjs --root <dir> --port 5175
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const core = require('../../core/dist/index.js');
const {
  IdeaService,
  IdeaRevisionConflictError,
  docsIdeaDir,
  syncAllIdeaDeliveries,
  resolveChildCanvasStepIndex,
  getStageStatus,
  buildStagePrompt,
  CofofoFoundationService,
  validateWorkspace,
  assemblePipeline,
  recipePipelineId,
  PipelineAssembleError,
  IDEA_AGENT_COMMAND_NAME,
  syncIdeaAgentCommandForProvider,
} = core;

const args = process.argv.slice(2);
function argVal(name, def) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
const ROOT = path.resolve(argVal('root', path.join(__dirname, '.ideas-scratch')));
const PORT = parseInt(argVal('port', '5175'), 10);

fs.mkdirSync(ROOT, { recursive: true });
console.log(`[ideas-bridge] workspace root: ${ROOT}`);

// ── tiny .aidlc/workspace.yaml IO (mirrors extension's v2/yamlIO.ts) ───────
function workspaceYamlPath(root) { return path.join(root, '.aidlc', 'workspace.yaml'); }
function readYaml(root) {
  const p = workspaceYamlPath(root);
  if (!fs.existsSync(p)) return null;
  const parsed = yaml.load(fs.readFileSync(p, 'utf8'));
  if (!parsed || typeof parsed !== 'object') throw new Error(`workspace.yaml at ${p} did not parse to an object`);
  parsed.agents = parsed.agents ?? [];
  parsed.skills = parsed.skills ?? [];
  parsed.pipelines = parsed.pipelines ?? [];
  parsed.recipes = parsed.recipes ?? [];
  parsed.slash_commands = parsed.slash_commands ?? [];
  return parsed;
}
function writeYaml(root, doc) {
  const p = workspaceYamlPath(root);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, yaml.dump(doc, { lineWidth: -1, noRefs: true, sortKeys: false }));
}

// ── build the ideas slice of WorkspaceState, exactly like buildIdeasUi() ───
function listIdeaAgentNotesFiles(root, ideaId, stage) {
  const dir = docsIdeaDir(root, ideaId);
  if (!fs.existsSync(dir)) return [];
  const re = /^(UNDERSTAND|RESEARCH|EXPLORE|DECIDE)[-_]NOTES\.md$/i;
  return fs.readdirSync(dir)
    .filter((fileName) => {
      const m = re.exec(fileName);
      const fileStage = m ? m[1].toLowerCase() : undefined;
      return !!fileStage && (!stage || fileStage === stage);
    })
    .sort();
}

function buildIdeasUi(root, doc) {
  const service = new IdeaService(root);
  syncAllIdeaDeliveries(root, doc);
  return service.list().map((idea) => ({
    ...idea,
    foundationStale: service.isFoundationStale(idea),
    stageStatus: getStageStatus(idea),
    agentNotesFiles: listIdeaAgentNotesFiles(root, idea.id),
    children: idea.children.map((child) => ({
      ...child,
      canvasStepIdx: resolveChildCanvasStepIndex(root, child.epicId, doc),
    })),
  }));
}

function buildState() {
  const doc = (() => { try { return readYaml(ROOT); } catch { return null; } })();
  const ideas = buildIdeasUi(ROOT, doc);
  const corruptedIdeas = new IdeaService(ROOT).listLoadErrors();
  return {
    hasFolder: true,
    workspaceName: path.basename(ROOT),
    configExists: !!doc,
    ideas,
    corruptedIdeas,
    agents: [], skills: [], pipelines: [], recipes: [], epics: [],
    agentMeta: {}, slashCommandsByAgent: {},
    agentsCount: 0, skillsCount: 0, pipelinesCount: 0, epicsCount: 0,
    runIds: [],
    skillTemplates: [],
    nextEpicId: 'EPIC-001',
    existingEpicIds: [],
    requirementRuns: [],
    initialView: 'discovery',
    testAgentConfigExists: false,
    testAgentTargets: [],
    epicMemoryHookEnabled: false,
    epicsDir: 'docs/epics',
    epicsViewUi: { followOpen: true, noFollowOpen: true, followedIds: [] },
    architecture: { available: false, revision: '0', generatedAt: '', freshness: 'stale', sourcePaths: [], warnings: [], nodes: [], edges: [], features: [], screens: [], screenEdges: [], structuralNodes: [], structuralEdges: [], featureFlows: {} },
    displayLanguage: 'vi',
    providerConfig: { defaultProvider: 'claude', providers: [] },
  };
}

// ── SSE broadcast ───────────────────────────────────────────────────────
const clients = new Set();
function broadcast(message) {
  const line = `data: ${JSON.stringify(message)}\n\n`;
  for (const res of clients) { try { res.write(line); } catch { /* client gone */ } }
}
function broadcastState() { broadcast({ type: 'state', state: buildState() }); }

const actor = { kind: 'user', id: 'harness-user' };

function handleAction(msg) {
  const id = typeof msg.ideaId === 'string' ? msg.ideaId : '';
  const revision = Number(msg.revision);

  switch (msg.type) {
    case 'ready':
      return { ok: true };

    case 'createIdea': {
      const idea = new IdeaService(ROOT).create({
        seedSentence: typeof msg.seedSentence === 'string' ? msg.seedSentence : '',
        actor,
      });
      broadcast({ type: 'selectIdea', ideaId: idea.id });
      return { ok: true, ideaId: idea.id };
    }

    case 'updateIdeaUnderstand':
    case 'updateIdeaResearch':
    case 'updateIdeaExplore':
    case 'updateIdeaDecision': {
      const ideas = new IdeaService(ROOT);
      const patch = msg.patch;
      if (msg.type === 'updateIdeaUnderstand') ideas.updateUnderstand(id, revision, patch, actor);
      if (msg.type === 'updateIdeaResearch') ideas.updateResearch(id, revision, patch, actor);
      if (msg.type === 'updateIdeaExplore') ideas.updateExplore(id, revision, patch, actor);
      if (msg.type === 'updateIdeaDecision') ideas.updateDecision(id, revision, patch, actor);
      return { ok: true };
    }

    case 'advanceIdeaStage': {
      new IdeaService(ROOT).advanceStage(id, revision, actor);
      return { ok: true };
    }

    case 'markIdeaReady': {
      const recipeId = String(msg.recipeId || '');
      const epicTitle = String(msg.epicTitle || '');
      new IdeaService(ROOT).markReady(id, revision, recipeId, epicTitle, actor);
      return { ok: true };
    }

    case 'scaffoldIdea': {
      const ideas = new IdeaService(ROOT);
      const idea = ideas.require(id);
      if (idea.stage !== 'ready' || !idea.readyRecipeId) {
        return { ok: false, error: 'mark the idea ready with a recipe before scaffolding.' };
      }
      const recipeId = idea.readyRecipeId;
      const epicTitle = (idea.readyEpicTitle || idea.title).trim();

      new CofofoFoundationService(ROOT).ensureRecipesRegistered();
      let doc = readYaml(ROOT);
      if (!doc) return { ok: false, error: 'no workspace.yaml after ensureRecipesRegistered().' };

      const config = validateWorkspace(doc, '.aidlc/workspace.yaml');
      const taken = new Set((doc.pipelines || []).map((p) => String(p.id)));
      const pipelineId = recipePipelineId({ recipeId, epicId: 'PENDING', taken });
      let pipeline;
      try {
        pipeline = assemblePipeline(config, { recipeId, pipelineId });
      } catch (err) {
        if (err instanceof PipelineAssembleError) return { ok: false, error: err.message };
        throw err;
      }
      doc.pipelines.push(pipeline);
      validateWorkspace(doc, '.aidlc/workspace.yaml');
      writeYaml(ROOT, doc);

      const epicsDirs = fs.existsSync(path.join(ROOT, 'docs/epics'))
        ? fs.readdirSync(path.join(ROOT, 'docs/epics'))
        : [];
      let n = 1;
      while (epicsDirs.includes(`EPIC-${String(n).padStart(3, '0')}`)) n += 1;
      const epicId = `EPIC-${String(n).padStart(3, '0')}`;

      const resolved = [{
        recipeId,
        epicId,
        epicTitle,
        pipeline,
        scaffold: { agents: pipeline.steps.map((s) => (typeof s === 'string' ? s : s.agent)), inputs: {} },
      }];
      ideas.scaffoldFromIdea(id, revision, resolved, readYaml(ROOT), actor);
      return { ok: true, epicId };
    }

    case 'copyIdeaAgentPrompt': {
      const idea = new IdeaService(ROOT).require(id);
      const stage = msg.stage;
      const text = buildStagePrompt(idea, stage, msg.userMessage);
      return { ok: true, text };
    }

    case 'copyIdeaAgentCommand': {
      syncIdeaAgentCommandForProvider(ROOT, 'claude');
      const stage = msg.stage;
      const userMessage = typeof msg.userMessage === 'string' ? msg.userMessage.trim() : '';
      const command = `/${IDEA_AGENT_COMMAND_NAME} ${id} ${stage}${userMessage ? ` ${userMessage}` : ''}`;
      return { ok: true, text: command };
    }

    case 'importIdeaAgentProposal': {
      const stage = msg.stage;
      const markdown = String(msg.markdown || '');
      const { unparsed } = new IdeaService(ROOT).importAgentProposal(id, revision, stage, markdown, actor);
      broadcast({ type: 'ideaAgentImportResult', ideaId: id, unparsed });
      return { ok: true, unparsed };
    }

    case 'resolveIdeaPendingAction': {
      const actionId = String(msg.actionId || '');
      const verdict = msg.verdict === 'accept' ? 'accept' : 'reject';
      new IdeaService(ROOT).resolvePendingAction(id, revision, actionId, verdict, actor);
      return { ok: true };
    }

    case 'openIdeaArtifact':
    case 'reloadIdeasState':
      return { ok: true, note: 'no-op in harness' };

    case 'repairCorruptedIdea': {
      new IdeaService(ROOT).repairCorrupted(id, actor);
      return { ok: true };
    }

    case 'deleteCorruptedIdea': {
      const file = new IdeaService(ROOT).store.stateFile(id);
      if (fs.existsSync(file)) fs.rmSync(file);
      return { ok: true };
    }

    default:
      console.log(`[ideas-bridge] unhandled message type: ${msg.type}`);
      return { ok: false, error: `unhandled message type: ${msg.type}` };
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (url.pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write(': hello\n\n');
    res.write(`data: ${JSON.stringify({ type: 'state', state: buildState() })}\n\n`);
    clients.add(res);
    const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch { /* ignore */ } }, 15000);
    req.on('close', () => { clearInterval(hb); clients.delete(res); });
    return;
  }

  if (url.pathname === '/rpc' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let msg;
      try { msg = JSON.parse(body); } catch { res.writeHead(400); res.end('bad json'); return; }
      let result;
      try {
        result = handleAction(msg);
      } catch (error) {
        if (error instanceof IdeaRevisionConflictError) {
          broadcast({ type: 'ideaRevisionConflict', ideaId: error.ideaId, actualRevision: error.actualRevision });
          result = { ok: false, error: error.message };
        } else {
          console.error(`[ideas-bridge] ${msg.type} failed:`, error);
          result = { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      if (result && result.ok) broadcastState();
    });
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[ideas-bridge] listening on http://127.0.0.1:${PORT}`);
});
