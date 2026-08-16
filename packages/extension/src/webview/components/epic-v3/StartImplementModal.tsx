/* Start Feature Implement — pack source + completeness gate. Mock only (wireframe §7). */

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Btn } from './primitives';
import { V3Field, V3Input, V3Modal, V3ModalFooter, V3ModalHeader, V3Textarea } from './V3Modal';
import {
  checkMissionCompleteness,
  completenessChips,
  packTextForSource,
  type PackSource,
} from './three-pipeline';

export interface SpikePackOption {
  id: string;
  title: string;
  missionMd: string;
}

export interface StartImplementResult {
  source: PackSource;
  specRef: string;
  missionMd: string;
}

export function StartImplementModal({
  spikeEpics,
  initialSource = 'spike',
  initialJira = '',
  onStart,
  onClose,
}: {
  spikeEpics: SpikePackOption[];
  initialSource?: PackSource;
  initialJira?: string;
  onStart: (result: StartImplementResult) => void;
  onClose: () => void;
}) {
  const defaultSpike = spikeEpics.find((epic) => epic.missionMd.trim()) ?? spikeEpics[0];
  const [source, setSource] = useState<PackSource>(
    initialSource === 'spike' && !defaultSpike ? 'paste' : initialSource,
  );
  const [spikeId, setSpikeId] = useState(defaultSpike?.id ?? '');
  const [paste, setPaste] = useState('');
  const [jiraRef, setJiraRef] = useState(initialJira);

  const selectedSpike = spikeEpics.find((epic) => epic.id === spikeId);
  const missionMd = packTextForSource(source, {
    spikeMissionMd: selectedSpike?.missionMd,
    paste,
    jiraRef,
  });
  const check = useMemo(() => checkMissionCompleteness(missionMd), [missionMd]);
  const chips = completenessChips(check);
  const specRef = source === 'spike'
    ? (selectedSpike ? `spike:${selectedSpike.id}` : '')
    : source === 'jira'
      ? jiraRef.trim()
      : 'paste:MISSION.md';

  return (
    <V3Modal
      width={560}
      closeOnBackdrop={false}
      onClose={onClose}
      header={
        <V3ModalHeader
          title="Start Feature Implement"
          sub="Nguồn pack — completeness là gate máy lúc Start, không phải step agent."
          onClose={onClose}
        />
      }
      footer={
        <V3ModalFooter>
          <Btn label="Cancel" onClick={onClose} pad="8px 14px" fs={12.5} />
          <Btn
            label="Start"
            variant="primary"
            pad="8px 16px"
            fs={12.5}
            disabled={!check.ok}
            title={check.ok
              ? 'Khóa vào MISSION.md này và Start implement'
              : `Pack chưa đủ — thiếu: ${check.missing.join(', ')}`}
            onClick={() => {
              if (!check.ok) return;
              onStart({ source, specRef, missionMd });
            }}
          />
        </V3ModalFooter>
      }
    >
      <V3Field label="Nguồn pack">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <PackOption
            selected={source === 'spike'}
            onSelect={() => setSource('spike')}
            label="Copy từ spike"
            disabled={spikeEpics.length === 0}
          >
            <select
              value={spikeId}
              disabled={source !== 'spike' || spikeEpics.length === 0}
              onChange={(event) => setSpikeId(event.target.value)}
              style={selectStyle}
            >
              {spikeEpics.length === 0 && <option value="">Không có epic feature-spike</option>}
              {spikeEpics.map((epic) => (
                <option key={epic.id} value={epic.id}>{epic.id}  {epic.title}</option>
              ))}
            </select>
          </PackOption>
          <PackOption
            selected={source === 'paste'}
            onSelect={() => setSource('paste')}
            label="Dán / chọn file MISSION.md"
          >
            {source === 'paste' && (
              <V3Textarea
                value={paste}
                onChange={setPaste}
                placeholder="Dán đủ heading: Summary, AC, Tasks, UI spec, Flow, …"
                rows={7}
                mono
                autoFocus
              />
            )}
          </PackOption>
          <PackOption
            selected={source === 'jira'}
            onSelect={() => setSource('jira')}
            label="Jira / ticket"
          >
            <V3Input
              value={jiraRef}
              onChange={setJiraRef}
              placeholder="https://…/browse/PASS-12"
              mono
            />
            <div style={{ fontSize: 11, color: 'var(--txt3)' }}>
              Jira một dòng fail completeness — không Start.
            </div>
          </PackOption>
        </div>
      </V3Field>

      <div>
        <div style={{ fontSize: 11.5, color: 'var(--txt2)', marginBottom: 8 }}>Completeness</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {chips.map((chip) => (
            <span
              key={chip.key}
              style={{
                fontSize: 11.5, padding: '3px 8px', borderRadius: 999,
                border: `1px solid ${chip.ok ? 'var(--acc-bd)' : 'var(--err-bd)'}`,
                background: chip.ok ? 'var(--acc-bg)' : 'var(--err-bg)',
                color: chip.ok ? 'var(--acc-txt)' : 'var(--err)',
              }}
            >
              {chip.ok ? '✓' : '✗'} {chip.label}
            </span>
          ))}
        </div>
        {!check.ok && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--err)', lineHeight: 1.5 }}>
            thiếu: {check.missing.join(', ')}
          </div>
        )}
        {check.ok && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--acc-txt)' }}>
            Pack đủ heading. Start sẽ khóa implement vào file này.
          </div>
        )}
      </div>
    </V3Modal>
  );
}

function PackOption({
  selected, onSelect, label, disabled, children,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <label
      style={{
        display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px',
        borderRadius: 7, border: `1px solid ${selected ? 'var(--acc-bd)' : 'var(--bd)'}`,
        background: selected ? 'var(--acc-bg)' : 'var(--panel)',
        opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--txt)' }}>
        <input
          type="radio"
          checked={selected}
          disabled={disabled}
          onChange={onSelect}
        />
        {label}
      </span>
      {children}
    </label>
  );
}

const selectStyle: CSSProperties = {
  background: 'var(--panel)',
  border: '1px solid var(--bd)',
  borderRadius: 6,
  padding: '8px 10px',
  color: 'var(--txt)',
  fontSize: 12.5,
  fontFamily: 'inherit',
  outline: 'none',
};
