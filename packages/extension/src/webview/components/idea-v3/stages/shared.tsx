/* Shared field editors reused by every stage view (Understand/Research/Explore/Decide). */

import { Plus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { IdeaStage, IdeaSummary } from '@/lib/types';
import { postMessage } from '@/lib/bridge';
import { ideasCopy, type IdeasLanguage } from '@/lib/ideasI18n';
import { Btn, Card, CardHeader, CardTitle, Mono } from '../../epic-v3/primitives';
import { V3Textarea } from '../../epic-v3/V3Modal';

/**
 * The agent's output file for one stage, shown inline on that stage's own
 * panel — mirrors Epic's `ArtifactChip` (dim + "not created yet" before the
 * file exists, clickable to open once it does) instead of making the human
 * hunt for it in the AI Copilot panel's generic "Found on disk" list.
 */
export function StageNotesChip({
  idea, stage, language,
}: {
  idea: IdeaSummary;
  stage: Exclude<IdeaStage, 'ready'>;
  language: IdeasLanguage;
}) {
  const copy = ideasCopy(language);
  const expectedFileName = `${stage.toUpperCase()}-NOTES.md`;
  const fileName = idea.agentNotesFiles.find((candidate) => {
    const upper = candidate.toUpperCase();
    const stem = stage.toUpperCase();
    return upper === `${stem}-NOTES.MD` || upper === `${stem}_NOTES.MD`;
  }) ?? expectedFileName;
  const exists = fileName !== expectedFileName || idea.agentNotesFiles.includes(expectedFileName);
  return (
    <button
      type="button"
      onClick={() => exists && postMessage({ type: 'openIdeaArtifact', ideaId: idea.id, file: fileName })}
      title={exists ? fileName : copy.stages.agentOutputNotCreated}
      style={{
        alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 5,
        padding: '4px 8px', borderRadius: 5, background: 'var(--panel2)', border: '1px solid var(--bd)',
        cursor: exists ? 'pointer' : 'default', opacity: exists ? 1 : 0.7,
      }}
    >
      <Mono style={{ fontSize: 10.5, color: exists ? 'var(--txt2)' : 'var(--txt3)' }}>
        {exists ? fileName : `${expectedFileName} · ${copy.stages.agentOutputNotCreated}`}
      </Mono>
    </button>
  );
}

export function FieldCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader pad="9px 12px"><CardTitle>{title}</CardTitle></CardHeader>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </Card>
  );
}

export function TextAreaField({
  value, onChange, onBlurSave, readOnly, rows = 4, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlurSave: () => void;
  readOnly: boolean;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div onBlur={onBlurSave}>
      <V3Textarea value={value} onChange={onChange} rows={rows} placeholder={placeholder} disabled={readOnly} resize="vertical" autoGrow />
    </div>
  );
}

/** A plain string list with add/remove — Users, Assumptions, Unknowns, Scope, Success Criteria, ...
 *  Each entry is an auto-growing textarea, not a single-line input: an
 *  AI-authored entry can run to a full paragraph, and a single-line input
 *  only ever shows the text around the caret, hiding the rest. */
export function StringListEditor({
  items, onChange, onBlurSave, readOnly, addLabel, placeholder,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  onBlurSave: () => void;
  readOnly: boolean;
  addLabel: string;
  placeholder?: string;
}) {
  const update = (i: number, value: string) => onChange(items.map((it, idx) => (idx === i ? value : it)));
  const remove = (i: number) => { onChange(items.filter((_, idx) => idx !== i)); onBlurSave(); };
  const add = () => onChange([...items, '']);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((item, i) => (
        // eslint-disable-next-line react/no-array-index-key -- list has no stable id; index is fine for a plain-string editor
        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }} onBlur={onBlurSave}>
            <V3Textarea
              value={item}
              disabled={readOnly}
              placeholder={placeholder}
              onChange={(v) => update(i, v)}
              rows={1}
              resize="vertical"
              autoGrow
            />
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={() => remove(i)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt3)', marginTop: 8 }}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      ))}
      {!readOnly && <Btn label={<><Plus size={12} />{addLabel}</>} onClick={add} style={{ alignSelf: 'flex-start' }} />}
    </div>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 11, color: 'var(--txt3)', fontStyle: 'italic' }}>{children}</div>;
}
