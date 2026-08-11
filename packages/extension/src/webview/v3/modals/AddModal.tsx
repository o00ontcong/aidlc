// v3/modals/AddModal.tsx — §11.3 Add pipeline/agent/skill, 3 biến thể theo builderTab.
import React from 'react';
import { Modal, Button, Chip, CodeBlock, ValidationPanel } from '../components';
import { ADD_SOURCE_DEFS, MOCK_TAKEN_IDS, MOCK_ADD_FLOW_STEPS, MOCK_SKILLS } from '../data/mock-data';
import type { BuilderTabId, Capability, CheckVM, CodeLineVM, Tier } from '../data/types';
import { useUiStore } from '../state/store';

const FOLDER_BY_TAB: Record<BuilderTabId, string> = {
  Workflows: 'pipelines/',
  Agents: 'agents/',
  Skills: 'skills/',
};

const NOUN_BY_TAB: Record<BuilderTabId, string> = {
  Workflows: 'pipeline',
  Agents: 'agent',
  Skills: 'skill',
};

const TIERS: Tier[] = ['fast', 'balanced', 'deep', 'review'];
const CAPS: Capability[] = ['figma', 'files', 'github', 'web'];

export function AddModal() {
  const { state, update } = useUiStore();
  if (!state.addOpen) return null;

  const close = () => update({ addOpen: false });

  const idProblem = state.addId === '' || MOCK_TAKEN_IDS.includes(state.addId);
  const scopePrefix = state.addScope === 'user (~/.claude)' ? '~/.claude/' : '.aidlc/';
  const writePath = `${scopePrefix}${FOLDER_BY_TAB[state.builderTab]}${state.addId || '<id>'}${state.builderTab === 'Skills' ? '.md' : '.yaml'}`;

  let checks: CheckVM[];
  if (state.builderTab === 'Workflows') {
    checks = [
      { ok: !idProblem, label: 'Không trùng id' },
      { ok: true, label: 'Mỗi step có agent hợp lệ' },
      { ok: true, label: 'Có ít nhất 1 human gate nếu cần' },
    ];
  } else if (state.builderTab === 'Agents') {
    checks = [
      { ok: !idProblem, label: 'Không trùng tên agent' },
      { ok: true, label: 'Model hợp lệ cho tier đã chọn' },
      { ok: true, label: 'Có ít nhất 1 skill hoặc capability' },
      { ok: true, label: 'System prompt không rỗng' },
    ];
  } else {
    checks = [
      { ok: !idProblem, label: 'Id hợp lệ' },
      { ok: true, label: 'Có frontmatter' },
      { ok: true, label: 'Nội dung không rỗng' },
    ];
  }

  const closingWarning =
    state.builderTab === 'Workflows'
      ? 'Pipeline mới chỉ có hiệu lực sau khi bạn reload VS Code để nạp lại slash command.'
      : state.builderTab === 'Agents'
        ? 'Agent có capability ngoài figma/files (vd github/web) nên được review trước khi bật autonomy unattended.'
        : 'Skill mới cần khởi động lại extension host để Claude nạp nội dung.';

  const footerCli =
    state.builderTab === 'Workflows'
      ? `aidlc pipeline add ${state.addId || '<id>'} --from ${state.addSrc}`
      : state.builderTab === 'Agents'
        ? `aidlc agent add ${state.addId || '<id>'} --tier ${state.addTier}`
        : `aidlc skill add ${state.addId || '<id>'} --scope ${state.addScope.startsWith('project') ? 'project' : 'user'}`;

  return (
    <Modal
      width={780}
      paddingTop={60}
      maxHeight={770}
      z={34}
      title={`Add ${NOUN_BY_TAB[state.builderTab]}`}
      onClose={close}
      footerCli={footerCli}
      footerActions={
        <>
          <Button label="Huỷ" variant="default" onClick={close} />
          <Button label="Lưu nháp" variant="default" onClick={close} />
          <Button
            label={`Tạo ${NOUN_BY_TAB[state.builderTab]}`}
            variant="primary"
            size="xl"
            onClick={() => update({ addOpen: false, toastOpen: true })}
          />
        </>
      }
    >
      {/* 1. Cách tạo */}
      <div className="flex flex-col gap-[6px]">
        <label className="text-[11.5px] text-txt2">Cách tạo</label>
        <div className="flex gap-[6px]">
          {ADD_SOURCE_DEFS[state.builderTab].map(([label, desc]) => (
            <button
              key={label}
              type="button"
              onClick={() => update({ addSrc: label })}
              className={`flex-1 flex flex-col gap-[3px] text-left rounded-[6px] border p-[8px_10px] ${
                state.addSrc === label ? 'bg-acc-bg border-acc-bd' : 'border-bd bg-panel'
              }`}
            >
              <span className={`text-[12px] font-semibold ${state.addSrc === label ? 'text-acc-txt' : 'text-txt'}`}>{label}</span>
              <span className="text-[10.5px] text-txt2">{desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 2. id + scope */}
      <div className="grid grid-cols-2 gap-[12px]">
        <div className="flex flex-col gap-[6px]">
          <label className="text-[11.5px] text-txt2">
            {state.builderTab === 'Workflows' ? 'Pipeline id' : state.builderTab === 'Agents' ? 'Tên agent' : 'Skill id'}
          </label>
          <input
            value={state.addId}
            onChange={(e) => update({ addId: e.target.value })}
            placeholder="chu-thuong-gach-ngang"
            className="font-v3-mono bg-panel border border-bd rounded-[6px] p-[9px_11px] text-[12.5px] text-txt w-full"
          />
          {MOCK_TAKEN_IDS.includes(state.addId) ? (
            <span className="text-[11px] text-err">Id đã tồn tại — chọn tên khác</span>
          ) : (
            <span className="text-[11px] text-txt3">chữ thường, gạch ngang</span>
          )}
        </div>
        <div className="flex flex-col gap-[6px]">
          <label className="text-[11.5px] text-txt2">Sẽ ghi vào</label>
          <div className="font-v3-mono bg-panel border border-bd rounded-[6px] p-[9px_11px] text-[12px] text-txt2 whitespace-nowrap overflow-hidden text-ellipsis">
            {writePath}
          </div>
          <div className="flex gap-[6px]">
            <button type="button" onClick={() => update({ addScope: 'project (.aidlc)' })}>
              <Chip label="project (.aidlc)" tone={state.addScope === 'project (.aidlc)' ? 'acc' : 'default'} mono />
            </button>
            <button type="button" onClick={() => update({ addScope: 'user (~/.claude)' })}>
              <Chip label="user (~/.claude)" tone={state.addScope === 'user (~/.claude)' ? 'acc' : 'default'} mono />
            </button>
          </div>
        </div>
      </div>

      {/* 3. Variant-specific */}
      {state.builderTab === 'Workflows' && (
        <div className="flex flex-col gap-[8px]">
          <div className="flex items-center gap-[8px]">
            <Button label="Copy từ cohesive-feature" size="xs" variant="default" onClick={() => {}} />
            <Button label="+ Thêm step" size="xs" variant="default" onClick={() => {}} />
          </div>
          <div className="flex flex-col gap-[4px]">
            {MOCK_ADD_FLOW_STEPS.map((step) => (
              <div key={step.i} className="flex items-center gap-[8px] p-[7px_10px] rounded-[6px] border border-bd">
                <span className="flex-none text-txt3 text-[11px]">⠿</span>
                <span className="flex-none w-[16px] font-v3-mono text-[11px] text-txt3">{step.i}</span>
                <span className="flex-1 min-w-0 font-v3-mono text-[12.5px] text-txt">{step.name}</span>
                <Chip label={step.tag} tone={step.tag === 'human gate' ? 'err' : 'default'} />
                <button type="button" className="flex-none text-[11px] text-txt2">Sửa</button>
                <button type="button" className="flex-none text-[11px] text-err">Xoá</button>
              </div>
            ))}
          </div>
          <div className="text-[11px] text-txt3">
            Kéo ⠿ để đổi thứ tự step; step gắn "human gate" luôn dừng chờ duyệt trước khi tiếp tục.
          </div>
        </div>
      )}

      {state.builderTab === 'Agents' && (
        <>
          <div className="grid grid-cols-2 gap-[12px]">
            <div className="flex flex-col gap-[6px]">
              <label className="text-[11.5px] text-txt2">Tier</label>
              <div className="flex gap-[6px]">
                {TIERS.map((tier) => (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => update({ addTier: tier })}
                    className={`flex-1 text-center rounded-[6px] border p-[7px_0] text-[12px] font-v3-mono ${
                      state.addTier === tier ? 'bg-acc-bg border-acc-bd text-acc-txt' : 'border-bd text-txt2'
                    }`}
                  >
                    {tier}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-[6px]">
              <label className="text-[11.5px] text-txt2">Model</label>
              <div className="flex items-center justify-between font-v3-mono bg-panel border border-bd rounded-[6px] p-[9px_11px] text-[12.5px] text-txt">
                <span>{state.addTier === 'deep' ? 'claude-opus-4' : 'claude-sonnet-4-5'}</span>
                <span className="text-txt3">▾</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-[6px]">
            <label className="text-[11.5px] text-txt2">System prompt</label>
            <textarea
              placeholder="Mô tả vai trò, ràng buộc, phong cách trả lời của agent…"
              className="bg-panel border border-bd rounded-[6px] p-[9px_11px] text-[12.5px] text-txt w-full min-h-[58px] resize-none"
            />
          </div>

          <div className="flex flex-col gap-[6px]">
            <label className="text-[11.5px] text-txt2">Skills gán cho agent</label>
            <div className="flex flex-wrap gap-[6px]">
              {MOCK_SKILLS.slice(0, 6).map((s) => {
                const on = !!state.addSkills[s.id];
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => update((prev) => ({ addSkills: { ...prev.addSkills, [s.id]: !prev.addSkills[s.id] } }))}
                    className={`flex items-center gap-[5px] rounded-full px-[9px] py-[3px] text-[11.5px] border ${
                      on ? 'bg-acc-bg border-acc-bd text-acc-txt' : 'border-bd text-txt2'
                    }`}
                  >
                    <span>{on ? '◉' : '○'}</span>
                    <span className="font-v3-mono">{s.id}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-[6px]">
            <label className="text-[11.5px] text-txt2">Capabilities</label>
            <div className="flex flex-wrap gap-[6px]">
              {CAPS.map((cap) => {
                const on = !!state.addCaps[cap];
                return (
                  <button
                    key={cap}
                    type="button"
                    onClick={() => update((prev) => ({ addCaps: { ...prev.addCaps, [cap]: !prev.addCaps[cap] } }))}
                    className={`flex items-center gap-[5px] rounded-full px-[9px] py-[3px] text-[11.5px] border ${
                      on ? 'bg-acc-bg border-acc-bd text-acc-txt' : 'border-bd text-txt2'
                    }`}
                  >
                    <span>{on ? '◉' : '○'}</span>
                    <span>{cap}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <CodeBlock
            lines={(() => {
              const enabledSkills = MOCK_SKILLS.slice(0, 6).filter((s) => state.addSkills[s.id]).map((s) => s.id);
              const enabledCaps = CAPS.filter((c) => state.addCaps[c]);
              const lines: CodeLineVM[] = [
                { t: `# .claude/agents/${state.addId || '<id>'}.md`, tone: 'muted' },
                { t: '---', tone: 'muted' },
                { t: `id: ${state.addId || '<id>'}`, tone: 'acc' },
                { t: `tier: ${state.addTier}`, tone: 'muted' },
                { t: `model: ${state.addTier === 'deep' ? 'claude-opus-4' : 'claude-sonnet-4-5'}`, tone: 'muted' },
                { t: `skills: [${enabledSkills.join(', ')}]`, tone: 'acc' },
                { t: `capabilities: [${enabledCaps.join(', ')}]`, tone: 'acc' },
                { t: '---', tone: 'muted' },
              ];
              return lines;
            })()}
          />
        </>
      )}

      {state.builderTab === 'Skills' && (
        <div className="flex flex-col gap-[6px]">
          <label className="text-[11.5px] text-txt2">
            {state.addSrc === 'Upload file'
              ? 'Nội dung file đã chọn'
              : state.addSrc === 'Dán nội dung'
                ? 'Nội dung template'
                : 'Nội dung skill'}
          </label>
          <div className="min-h-[120px]">
            <CodeBlock
              lines={[
                { t: `# .aidlc/skills/${state.addId || '<id>'}.md`, tone: 'muted' },
                { t: '---', tone: 'muted' },
                { t: `id: ${state.addId || '<id>'}`, tone: 'acc' },
                { t: 'source: custom', tone: 'muted' },
                { t: '---', tone: 'muted' },
                { t: '', tone: 'muted' },
                { t: '## Khi nào dùng skill này', tone: 'muted' },
              ]}
            />
          </div>
          <div className="flex items-center gap-[8px]">
            <span className="text-[11px] text-acc-txt">✓ frontmatter hợp lệ</span>
            <Button label="Validate lại" size="xs" variant="default" onClick={() => {}} />
          </div>
        </div>
      )}

      {/* 4. Validation */}
      <ValidationPanel checks={checks} />

      {/* 5. Closing warning */}
      <div className="flex items-center gap-[8px] border border-warn-bd bg-warn-bg rounded-[6px] p-[10px_12px]">
        <span className="flex-1 min-w-0 text-[11.5px] text-warn">{closingWarning}</span>
      </div>
    </Modal>
  );
}
