/* Idea Research Workspace — one shared action bar, the complete Idea→Epic
 * flow, and the selected step's output/detail below it.
 */

import { useEffect, useState } from 'react';
import { FileText, Languages, Play } from 'lucide-react';
import type { IdeaStage, IdeaSummary } from '@/lib/types';
import { postMessage } from '@/lib/bridge';
import { ideasCopy, type IdeasLanguage } from '@/lib/ideasI18n';
import { Btn, Card, CardHeader, CardNote, CardTitle, Chip, Mono } from '../epic-v3/primitives';
import { V3Callout } from '../epic-v3/V3Modal';
import { DeliveryPanel } from './IdeaDeliveryPanel';
import { AiCopilotPanel } from './AiCopilotPanel';
import { currentIdeaFlowNode, StageBar, type IdeaFlowNode } from './StageBar';
import { UnderstandStage } from './stages/UnderstandStage';
import { ResearchStage } from './stages/ResearchStage';
import { ExploreStage } from './stages/ExploreStage';
import { DecideStage } from './stages/DecideStage';
import { ReadyStage } from './stages/ReadyStage';

const RESEARCH_STAGES: Exclude<IdeaStage, 'ready'>[] = ['understand', 'research', 'explore', 'decide'];

function isResearchStage(node: IdeaFlowNode): node is Exclude<IdeaStage, 'ready'> {
  return RESEARCH_STAGES.includes(node as Exclude<IdeaStage, 'ready'>);
}

function nodeLabel(node: IdeaFlowNode, language: IdeasLanguage): string {
  const copy = ideasCopy(language);
  if (node === 'capture') return language === 'vi' ? 'Idea ban đầu' : 'New Idea';
  if (node === 'delivery') return language === 'vi' ? 'Đang delivery' : 'In delivery';
  if (node === 'completed') return language === 'vi' ? 'Hoàn tất' : 'Completed';
  return copy.stages.labels[node];
}

function nodeDescription(node: IdeaFlowNode, language: IdeasLanguage): string {
  const vi: Record<IdeaFlowNode, string> = {
    capture: 'Đầu vào gốc và metadata được lưu khi tạo Idea.',
    understand: 'Làm rõ problem, context, users, assumptions và unknowns.',
    research: 'Tổng hợp findings, nguồn tham khảo và giải pháp đang tồn tại.',
    explore: 'So sánh các solution option, trade-off, risk và cách validation.',
    decide: 'Chốt hướng đi, scope, success criteria và recipe cho Epic.',
    ready: 'Kiểm tra output cuối và scaffold Epic từ Idea đã sẵn sàng.',
    delivery: 'Theo dõi Epic con và mở Canvas tại step đang chạy.',
    completed: 'Kết quả cuối sau khi delivery hoàn tất.',
  };
  const en: Record<IdeaFlowNode, string> = {
    capture: 'The original input and metadata captured with this Idea.',
    understand: 'Clarify the problem, context, users, assumptions, and unknowns.',
    research: 'Collect findings, sources, and existing solutions.',
    explore: 'Compare solution options, trade-offs, risks, and validation.',
    decide: 'Choose the direction, scope, success criteria, and Epic recipe.',
    ready: 'Review the final output and scaffold an Epic from the ready Idea.',
    delivery: 'Track child Epics and open the currently running Canvas step.',
    completed: 'The final result after delivery has completed.',
  };
  return (language === 'vi' ? vi : en)[node];
}

export function IdeaWorkspaceDetail({ idea, language }: { idea: IdeaSummary; language: IdeasLanguage }) {
  const copy = ideasCopy(language);
  const readOnly = ['in_delivery', 'completed', 'closed'].includes(idea.checkpoint);
  const [viewing, setViewing] = useState<IdeaFlowNode>(() => currentIdeaFlowNode(idea));

  // Follow a newly selected Idea and real workflow transitions. Selecting a
  // node in the graph remains a local navigation action and never advances it.
  useEffect(() => { setViewing(currentIdeaFlowNode(idea)); }, [idea.id, idea.stage, idea.checkpoint]);

  return (
    <main className="idea-workspace-main">
      <Header idea={idea} language={language} />

      <StageBar idea={idea} viewing={viewing} language={language} onSelect={setViewing} />

      {idea.needsReview && (
        <V3Callout tone="warn">{copy.stages.needsReviewBanner(idea.needsReview.reason)}</V3Callout>
      )}

      <section className="idea-step-detail" aria-labelledby="idea-step-detail-title">
        <div className="idea-step-detail-heading">
          <div>
            <div className="idea-step-kicker">{language === 'vi' ? 'STEP ĐANG CHỌN' : 'SELECTED STEP'}</div>
            <h2 id="idea-step-detail-title">{nodeLabel(viewing, language)}</h2>
            <p>{nodeDescription(viewing, language)}</p>
          </div>
          {viewing === currentIdeaFlowNode(idea) && (
            <Chip label={language === 'vi' ? 'Đang chạy' : 'Current'} bg="var(--warn-bg)" fg="var(--warn)" />
          )}
        </div>

        <IdeaArtifactsBar idea={idea} viewing={viewing} language={language} />

        <div className={`idea-detail-grid${!readOnly && isResearchStage(viewing) ? ' has-copilot' : ''}`}>
          <div className="idea-detail-content">
            {viewing === 'capture' && <CaptureDetail idea={idea} language={language} />}
            {viewing === 'understand' && <UnderstandStage idea={idea} language={language} readOnly={readOnly} isCurrent={idea.stage === 'understand'} />}
            {viewing === 'research' && <ResearchStage idea={idea} language={language} readOnly={readOnly} isCurrent={idea.stage === 'research'} />}
            {viewing === 'explore' && <ExploreStage idea={idea} language={language} readOnly={readOnly} isCurrent={idea.stage === 'explore'} />}
            {viewing === 'decide' && <DecideStage idea={idea} language={language} readOnly={readOnly} isCurrent={idea.stage === 'decide'} />}
            {viewing === 'ready' && <ReadyStage idea={idea} language={language} readOnly={readOnly} />}
            {(viewing === 'delivery' || viewing === 'completed') && (
              <DeliveryDetail idea={idea} language={language} completed={viewing === 'completed'} />
            )}
          </div>

          {!readOnly && isResearchStage(viewing) && (
            <AiCopilotPanel idea={idea} language={language} stage={viewing} />
          )}
        </div>
      </section>
    </main>
  );
}

function Header({ idea, language }: { idea: IdeaSummary; language: IdeasLanguage }) {
  const copy = ideasCopy(language);
  const readOnly = ['in_delivery', 'completed', 'closed'].includes(idea.checkpoint);
  const current = currentIdeaFlowNode(idea);
  return (
    <header className="idea-common-header">
      <div className="idea-common-title">
        <div className="idea-title-row">
          <Mono style={{ fontSize: 11.5, color: 'var(--txt3)' }}>{idea.id}</Mono>
          <h1>{idea.title}</h1>
          <Chip mono label={nodeLabel(current, language)} />
        </div>
        <div className="idea-common-subtitle">{copy.stages.subtitle}</div>
      </div>
      <div className="idea-common-actions">
        {!readOnly && idea.stage !== 'ready' && (
          <Btn
            label={<><Play size={12} />{copy.stages.runPipeline}</>}
            variant="primary"
            title={copy.stages.runPipelineHint}
            onClick={() => postMessage({ type: 'runIdeaAgentPipeline', ideaId: idea.id, revision: idea.ideaRevision })}
          />
        )}
        {!readOnly && (
          <Btn
            label={<><Languages size={12} />{copy.stages.translateArtifacts}</>}
            onClick={() => postMessage({ type: 'translateIdeaArtifacts', ideaId: idea.id, language })}
          />
        )}
        <Btn
          label={<><FileText size={12} />RESEARCH.md</>}
          onClick={() => postMessage({ type: 'openIdeaArtifact', ideaId: idea.id, file: 'RESEARCH.md' })}
        />
      </div>
    </header>
  );
}

function IdeaArtifactsBar({
  idea, viewing, language,
}: {
  idea: IdeaSummary;
  viewing: IdeaFlowNode;
  language: IdeasLanguage;
}) {
  const copy = ideasCopy(language);
  const artifacts: Array<{ name: string; exists: boolean }> = [
    { name: 'RESEARCH.md', exists: true },
  ];

  if (isResearchStage(viewing)) {
    const stem = viewing.toUpperCase();
    const found = idea.agentNotesFiles.find((candidate) => {
      const upper = candidate.toUpperCase();
      return upper === `${stem}-NOTES.MD` || upper === `${stem}_NOTES.MD`;
    });
    artifacts.push({ name: found ?? `${stem}-NOTES.md`, exists: !!found });
  }

  const intentExists = idea.stage === 'ready' || ['intent_drafted', 'route_proposed', 'in_delivery', 'completed', 'closed'].includes(idea.checkpoint);
  if (viewing === 'ready' || viewing === 'delivery' || viewing === 'completed') {
    artifacts.push({ name: 'INTENT.md', exists: intentExists });
  }

  return (
    <div className="idea-artifacts-row">
      <span className="idea-artifacts-label">Artifacts / output</span>
      {artifacts.map(({ name, exists }) => (
        <button
          key={name}
          type="button"
          className="idea-artifact-chip"
          data-exists={exists}
          disabled={!exists}
          title={exists ? name : copy.stages.agentOutputNotCreated}
          onClick={() => postMessage({ type: 'openIdeaArtifact', ideaId: idea.id, file: name })}
        >
          <FileText size={12} />
          <Mono>{name}</Mono>
          {!exists && <span>· {copy.stages.agentOutputNotCreated}</span>}
        </button>
      ))}
    </div>
  );
}

function CaptureDetail({ idea, language }: { idea: IdeaSummary; language: IdeasLanguage }) {
  const locale = language === 'vi' ? 'vi-VN' : 'en-US';
  return (
    <Card>
      <CardHeader pad="9px 12px"><CardTitle>{language === 'vi' ? 'Output của bước New Idea' : 'New Idea output'}</CardTitle></CardHeader>
      <div className="idea-capture-grid">
        <div className="idea-capture-seed">
          <span>{language === 'vi' ? 'Nội dung gốc' : 'Original input'}</span>
          <p>{idea.seedSentence}</p>
        </div>
        <div><span>Idea ID</span><Mono>{idea.id}</Mono></div>
        <div><span>{language === 'vi' ? 'Tạo lúc' : 'Created'}</span><strong>{new Date(idea.createdAt).toLocaleString(locale)}</strong></div>
        <div><span>{language === 'vi' ? 'Cập nhật' : 'Updated'}</span><strong>{new Date(idea.updatedAt).toLocaleString(locale)}</strong></div>
        <div><span>Revision</span><Mono>{idea.ideaRevision}</Mono></div>
      </div>
    </Card>
  );
}

function DeliveryDetail({
  idea, language, completed,
}: {
  idea: IdeaSummary;
  language: IdeasLanguage;
  completed: boolean;
}) {
  if (idea.children.length === 0) {
    return (
      <Card>
        <div style={{ padding: 14 }}>
          <CardNote>
            {language === 'vi'
              ? 'Chưa có Epic con. Hoàn tất bước Ready và scaffold Epic để bắt đầu delivery.'
              : 'No child Epic yet. Finish Ready and scaffold an Epic to start delivery.'}
          </CardNote>
        </div>
      </Card>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <V3Callout tone={completed ? 'acc' : 'warn'}>
        {completed
          ? (language === 'vi' ? 'Delivery đã hoàn tất. Các Epic con và kết quả vẫn có thể mở bên dưới.' : 'Delivery is complete. Child Epics and their results remain available below.')
          : ideasCopy(language).stages.ready.scaffoldedBody}
      </V3Callout>
      <DeliveryPanel idea={idea} language={language} />
    </div>
  );
}
