import type { IdeaSummary } from '@/lib/types';
import { postMessage } from '@/lib/bridge';
import { ideasCopy, type IdeasLanguage } from '@/lib/ideasI18n';
import { Btn, Card } from '../epic-v3/primitives';

export function DeliveryPanel({ idea, language }: { idea: IdeaSummary; language: IdeasLanguage }) {
  const copy = ideasCopy(language);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {idea.children.map((child) => (
        <Card key={child.epicId}>
          <div style={{ padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--txt)' }}>{copy.delivery.title(child.recipeId)}</div>
              <div style={{ marginTop: 2, fontSize: 10.5, color: 'var(--txt3)' }}>
                {child.epicId} · {copy.delivery.childStatus}: {child.runStatus}
              </div>
            </div>
            <Btn
              label={copy.delivery.openCanvas}
              variant="primary"
              onClick={() => postMessage({ type: 'reviewCanvasStep', runId: child.epicId, stepIdx: child.canvasStepIdx ?? 0 })}
            />
          </div>
        </Card>
      ))}
    </div>
  );
}
