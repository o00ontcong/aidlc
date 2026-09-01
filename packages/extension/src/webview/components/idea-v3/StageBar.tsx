/* Full Ideas flow — Capture → Understand → Research → Explore → Decide →
 * Ready → Delivery → Completed. The workflow state and the selected detail
 * are separate: clicking a node changes only the detail shown below.
 */

import type { IdeaSummary } from '@/lib/types';
import { ideasCopy, type IdeasLanguage } from '@/lib/ideasI18n';

export type IdeaFlowNode = 'capture' | 'understand' | 'research' | 'explore' | 'decide' | 'ready' | 'delivery' | 'completed';

const NODES: IdeaFlowNode[] = [
  'capture', 'understand', 'research', 'explore',
  'decide', 'ready', 'delivery', 'completed',
];

export function currentIdeaFlowNode(idea: IdeaSummary): IdeaFlowNode {
  if (idea.checkpoint === 'completed' || idea.checkpoint === 'closed') return 'completed';
  if (idea.checkpoint === 'in_delivery') return 'delivery';
  return idea.stage;
}

function labelFor(node: IdeaFlowNode, language: IdeasLanguage): string {
  const copy = ideasCopy(language);
  if (node === 'capture') return 'New Idea';
  if (node === 'delivery') return 'In delivery';
  if (node === 'completed') return 'Completed';
  return copy.stages.labels[node];
}

function stateText(
  idea: IdeaSummary,
  node: IdeaFlowNode,
  status: 'done' | 'current' | 'upcoming',
  language: IdeasLanguage,
): string {
  if (status === 'done') return language === 'vi' ? 'Hoàn tất' : 'Completed';
  if (status === 'upcoming') {
    if (node === 'ready') return language === 'vi' ? 'Chưa chọn recipe' : 'Recipe not selected';
    if (node === 'delivery') return language === 'vi' ? 'Chưa scaffold Epic' : 'Epic not scaffolded';
    if (node === 'completed') return language === 'vi' ? 'Chờ delivery' : 'Waiting for delivery';
    return language === 'vi' ? 'Chưa bắt đầu' : 'Not started';
  }
  if (node === 'capture') return idea.id;
  if (node === 'delivery') {
    const running = idea.children.find((child) => child.runStatus !== 'completed') ?? idea.children[0];
    return running ? `${running.epicId} · ${running.runStatus}` : (language === 'vi' ? 'Đang chuẩn bị' : 'Preparing');
  }
  if (node === 'completed') return language === 'vi' ? 'Delivery hoàn tất' : 'Delivery completed';
  if (node === 'ready') return idea.readyRecipeId ?? (language === 'vi' ? 'Sẵn sàng scaffold' : 'Ready to scaffold');
  const missing = idea.stageStatus.requirements.filter((rule) => rule.level === 'required' && !rule.passed).length;
  const percent = Math.round(idea.stageStatus.completion * 100);
  return missing > 0
    ? (language === 'vi' ? `${percent}% · thiếu ${missing}` : `${percent}% · ${missing} missing`)
    : `${percent}%`;
}

export function StageBar({
  idea, viewing, language, onSelect,
}: {
  idea: IdeaSummary;
  viewing: IdeaFlowNode;
  language: IdeasLanguage;
  onSelect: (node: IdeaFlowNode) => void;
}) {
  const current = currentIdeaFlowNode(idea);
  const currentIdx = NODES.indexOf(current);

  return (
    <section className="idea-flow-shell" aria-label={language === 'vi' ? 'Flow của Idea' : 'Idea flow'}>
      <div className="idea-flow-heading">
        <div className="idea-flow-title">{language === 'vi' ? 'Flow của Idea' : 'Idea flow'}</div>
        <div className="idea-flow-legend" aria-label={language === 'vi' ? 'Chú thích trạng thái' : 'Status legend'}>
          <span><i data-tone="done" />{language === 'vi' ? 'Hoàn tất' : 'Completed'}</span>
          <span><i data-tone="current" />{language === 'vi' ? 'Đang chạy' : 'Current'}</span>
          <span><i data-tone="upcoming" />{language === 'vi' ? 'Chưa tới' : 'Upcoming'}</span>
        </div>
      </div>
      <div className="idea-flow-grid" role="tablist">
        {NODES.map((node, index) => {
          const isTerminalComplete = current === 'completed' && node === 'completed';
          const status: 'done' | 'current' | 'upcoming' = index < currentIdx || isTerminalComplete
            ? 'done'
            : index === currentIdx ? 'current' : 'upcoming';
          const selected = node === viewing;
          const glyph = status === 'done' ? '✓' : status === 'current' ? '●' : '○';
          return (
            <button
              key={node}
              type="button"
              role="tab"
              aria-selected={selected}
              data-node={node}
              data-status={status}
              className={`idea-flow-node${selected ? ' is-selected' : ''}`}
              onClick={() => onSelect(node)}
            >
              <span className="idea-flow-glyph" aria-hidden>{glyph}</span>
              <span className="idea-flow-label">{labelFor(node, language)}</span>
              <span className="idea-flow-state">{stateText(idea, node, status, language)}</span>
              {status === 'current' && idea.needsReview && <span className="idea-flow-review" aria-label={language === 'vi' ? 'Cần xem lại' : 'Needs review'}>⚠</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
