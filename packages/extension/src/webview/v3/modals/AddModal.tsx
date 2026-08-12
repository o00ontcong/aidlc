import React from 'react';
import { Modal, Button, Chip, ValidationPanel } from '../components';
import type { BuilderTabId, Capability, CheckVM, Tier } from '../data/types';
import { useUiStore } from '../state/store';
import { useApplicationClient, type RegistryPipelineStep } from '../applicationClient';
import { isRegistryId, pipelineFormChecks } from '../registryForm';

const TIERS: Tier[] = ['fast', 'balanced', 'deep', 'review'];
const CAPS: Capability[] = ['figma', 'files', 'github', 'web'];
const split = (value: string) => value.split(',').map((part) => part.trim()).filter(Boolean);
const blankStep = (): RegistryPipelineStep => ({ id: 'human-review', skills: [], outputs: [], autoReview: false, humanReview: true });

function Input({ value, onChange, placeholder, disabled = false }: { value: string; onChange: (value: string) => void; placeholder?: string; disabled?: boolean }) {
  return <input disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="font-v3-mono bg-panel border border-bd rounded-[6px] p-[8px_10px] text-[12px] text-txt w-full disabled:opacity-60" />;
}

export function AddModal() {
  const { state, update } = useUiStore();
  const { registry, command } = useApplicationClient();
  const tab = state.builderTab;
  const existingAgent = registry.agents.find((item) => item.id === state.addId);
  const existingSkill = registry.skills.find((item) => item.id === state.addId);
  const existingPipeline = registry.pipelines.find((item) => item.id === state.addId);
  const existing = tab === 'Agents' ? existingAgent : tab === 'Skills' ? existingSkill : existingPipeline;
  const [id, setId] = React.useState('');
  const [scope, setScope] = React.useState<'project' | 'global'>('project');
  const [agent, setAgent] = React.useState({ name: '', description: '', model: 'claude-sonnet-4-5', tier: 'balanced' as Tier, skills: [] as string[], capabilities: [] as Capability[] });
  const [skill, setSkill] = React.useState({ source: 'custom' as 'custom' | 'design', description: '', body: '' });
  const [version, setVersion] = React.useState('1.0.0');
  const [steps, setSteps] = React.useState<RegistryPipelineStep[]>([blankStep()]);
  const [templateId, setTemplateId] = React.useState('');
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    setError('');
    setTemplateId('');
    setId(existing?.id ?? '');
    if (existingAgent) {
      setScope(existingAgent.scope ?? 'project');
      setAgent({ name: existingAgent.name, description: existingAgent.description, model: existingAgent.model, tier: existingAgent.tier, skills: [...existingAgent.skills], capabilities: [...existingAgent.capabilities] });
    } else if (existingSkill) {
      setScope(existingSkill.scope ?? 'project');
      setSkill({ source: existingSkill.source === 'design' ? 'design' : 'custom', description: existingSkill.description, body: existingSkill.body });
    } else if (existingPipeline) {
      setVersion(existingPipeline.version);
      setSteps(existingPipeline.steps.map((step) => ({ ...step, skills: [...step.skills], outputs: [...step.outputs] })));
    } else {
      setScope('project'); setAgent({ name: '', description: '', model: 'claude-sonnet-4-5', tier: 'balanced', skills: [], capabilities: [] });
      setSkill({ source: 'custom', description: '', body: '' }); setVersion('1.0.0'); setSteps([blankStep()]);
    }
  }, [state.addOpen, tab, state.addId, existingAgent, existingSkill, existingPipeline]);

  if (!state.addOpen) return null;
  const bundled = existingPipeline?.source === 'bundled';
  const editing = Boolean(existing) && !bundled;
  const isValidId = isRegistryId(id);
  const duplicate = !existing && !bundled && (tab === 'Agents' ? registry.agents : tab === 'Skills' ? registry.skills : registry.pipelines).some((item) => item.id === id);
  const flowChecks = pipelineFormChecks(steps);
  const checks: CheckVM[] = tab === 'Workflows'
    ? [{ ok: isValidId && !duplicate, label: duplicate ? 'Id đã tồn tại' : 'Id kebab-case hợp lệ' }, { ok: flowChecks.hasSteps, label: 'Pipeline có ít nhất một step' }, { ok: flowChecks.hasHumanReview, label: 'Có ít nhất một human review' }]
    : tab === 'Agents'
      ? [{ ok: isValidId && !duplicate, label: duplicate ? 'Id đã tồn tại' : 'Id kebab-case hợp lệ' }, { ok: Boolean(agent.name.trim()), label: 'Tên agent không rỗng' }, { ok: Boolean(agent.description.trim()), label: 'Mô tả không rỗng' }]
      : [{ ok: isValidId && !duplicate, label: duplicate ? 'Id đã tồn tại' : 'Id kebab-case hợp lệ' }, { ok: Boolean(skill.description.trim()), label: 'Có mô tả' }, { ok: Boolean(skill.body.trim()), label: 'Nội dung không rỗng' }];
  const canSave = checks.every((check) => check.ok);
  const close = () => update({ addOpen: false, addId: '' });
  const updateStep = (index: number, patch: Partial<RegistryPipelineStep>) => setSteps((current) => current.map((step, i) => i === index ? { ...step, ...patch } : step));
  const save = async () => {
    if (!canSave) return;
    setError('');
    let result;
    if (tab === 'Agents') {
      result = await command(editing ? 'registry.agent.update' : 'registry.agent.create', { scope, agent: { id, ...agent } });
    } else if (tab === 'Skills') {
      result = await command(editing ? 'registry.skill.update' : 'registry.skill.create', { scope, skill: { id, ...skill } });
    } else {
      const pipeline = { id, version, steps };
      result = await command(bundled ? 'registry.pipeline.copyToProject' : editing ? 'registry.pipeline.update' : 'registry.pipeline.create', { pipeline });
    }
    if (result.status === 'error') { setError(String((result.data as { message?: string })?.message ?? 'Unable to save.')); return; }
    close();
  };
  const noun = tab === 'Workflows' ? 'pipeline' : tab === 'Agents' ? 'agent' : 'skill';
  const path = tab === 'Workflows' ? `.aidlc/pipelines/${id || '<id>'}.yaml` : scope === 'global' ? `~/.claude/${tab === 'Agents' ? 'agents' : 'skills'}/${id || '<id>'}.md` : `${tab === 'Agents' ? '.claude/agents' : '.aidlc/skills'}/${id || '<id>'}.md`;
  const catalogTemplates = registry.templates.filter((template) => template.kind === (tab === 'Agents' ? 'agent' : 'skill'));
  const applyTemplate = (nextId: string) => {
    setTemplateId(nextId);
    if (!nextId) return;
    if (tab === 'Workflows') {
      const pipeline = registry.pipelines.find((item) => item.source === 'bundled' && item.id === nextId);
      if (!pipeline) return;
      setId(pipeline.id); setVersion(pipeline.version); setSteps(pipeline.steps.map((step) => ({ ...step, skills: [...step.skills], outputs: [...step.outputs] })));
      return;
    }
    const template = catalogTemplates.find((item) => item.id === nextId);
    if (template?.agent) {
      setId(template.agent.id);
      setAgent({ ...template.agent, skills: template.agent.skills.filter((skillId) => registry.skills.some((skill) => skill.id === skillId)), capabilities: [...template.agent.capabilities] });
    }
    if (template?.skill) { setId(template.skill.id); setSkill({ source: template.skill.source === 'design' ? 'design' : 'custom', description: template.skill.description, body: template.skill.body }); }
  };
  const uploadSkill = async (file?: File) => {
    if (!file) return;
    const body = await file.text();
    setSkill((current) => ({ ...current, body }));
    if (!id) setId(file.name.replace(/\.md$/i, '').replace(/[^a-z0-9-]/gi, '-').toLowerCase());
  };

  return <Modal width={780} paddingTop={60} maxHeight={770} z={34} title={bundled ? `Copy ${noun} to project` : `${editing ? 'Edit' : 'Add'} ${noun}`} onClose={close} footerCli={path} footerActions={<><Button label="Huỷ" variant="default" onClick={close} /><Button label={bundled ? 'Copy to project' : editing ? 'Save changes' : `Tạo ${noun}`} variant="primary" size="xl" onClick={() => void save()} /></>}>
    <div className="grid grid-cols-2 gap-[12px]">
      <div className="flex flex-col gap-[6px]"><label className="text-[11.5px] text-txt2">{noun} id</label><Input value={id} onChange={setId} disabled={editing || bundled} placeholder="chu-thuong-gach-ngang" /><span className={`text-[11px] ${isValidId ? 'text-txt3' : 'text-err'}`}>{isValidId ? 'chữ thường, số và gạch ngang' : 'Id phải là kebab-case'}</span></div>
      <div className="flex flex-col gap-[6px]"><label className="text-[11.5px] text-txt2">Sẽ ghi vào</label><div className="font-v3-mono bg-panel border border-bd rounded-[6px] p-[9px_11px] text-[12px] text-txt2">{path}</div>{tab !== 'Workflows' && <div className="flex gap-[6px]"><button type="button" onClick={() => setScope('project')} disabled={editing}><Chip label="project" tone={scope === 'project' ? 'acc' : 'default'} mono /></button><button type="button" onClick={() => setScope('global')} disabled={editing}><Chip label="global" tone={scope === 'global' ? 'acc' : 'default'} mono /></button></div>}</div>
    </div>

    {!editing && !bundled && <div className="flex flex-col gap-[6px]"><label className="text-[11.5px] text-txt2">Bắt đầu từ mẫu (tuỳ chọn)</label><select value={templateId} onChange={(event) => applyTemplate(event.target.value)} className="bg-panel border border-bd rounded-[6px] p-[8px_10px] text-[12px] text-txt"><option value="">Blank / tự nhập</option>{tab === 'Workflows' ? registry.pipelines.filter((pipeline) => pipeline.source === 'bundled').map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.id} · bundled ({pipeline.steps.length} steps)</option>) : catalogTemplates.map((template) => <option key={template.id} value={template.id}>{template.label} — {template.description}</option>)}</select>{tab === 'Agents' && templateId && <span className="text-[11px] text-txt3">Skills chưa tồn tại trong scope hiện tại không được gán tự động; hãy tạo/copy skill trước hoặc chọn trong picker.</span>}</div>}

    {tab === 'Agents' && <div className="flex flex-col gap-[10px]">
      <div className="grid grid-cols-2 gap-[12px]"><div><label className="text-[11.5px] text-txt2">Name</label><Input value={agent.name} onChange={(name) => setAgent((v) => ({ ...v, name }))} /></div><div><label className="text-[11.5px] text-txt2">Model</label><Input value={agent.model} onChange={(model) => setAgent((v) => ({ ...v, model }))} /></div></div>
      <div><label className="text-[11.5px] text-txt2">Description</label><textarea value={agent.description} onChange={(event) => setAgent((v) => ({ ...v, description: event.target.value }))} className="bg-panel border border-bd rounded-[6px] p-[9px_11px] text-[12px] text-txt w-full min-h-[58px] resize-none" /></div>
      <div><label className="text-[11.5px] text-txt2">Tier</label><div className="flex gap-[6px]">{TIERS.map((tier) => <button key={tier} type="button" onClick={() => setAgent((v) => ({ ...v, tier }))}><Chip label={tier} tone={agent.tier === tier ? 'acc' : 'default'} mono /></button>)}</div></div>
      <Picker label="Skills" values={agent.skills} options={registry.skills.map((item) => item.id)} onChange={(skills) => setAgent((v) => ({ ...v, skills }))} />
      <Picker label="Capabilities" values={agent.capabilities} options={CAPS} onChange={(capabilities) => setAgent((v) => ({ ...v, capabilities: capabilities as Capability[] }))} />
      <div className="text-[11px] text-txt3">Agent contract chỉ lưu name, description, model, tier, skills và capabilities; không lưu system prompt.</div>
    </div>}

    {tab === 'Skills' && <div className="flex flex-col gap-[10px]"><div className="flex gap-[6px]"><button type="button" onClick={() => setSkill((v) => ({ ...v, source: 'custom' }))}><Chip label="custom" tone={skill.source === 'custom' ? 'acc' : 'default'} /></button><button type="button" onClick={() => setSkill((v) => ({ ...v, source: 'design' }))}><Chip label="design" tone={skill.source === 'design' ? 'acc' : 'default'} /></button><label className="cursor-pointer"><Chip label="Upload .md" tone="default" /><input className="hidden" type="file" accept=".md,text/markdown,text/plain" onChange={(event) => void uploadSkill(event.target.files?.[0])} /></label></div><div><label className="text-[11.5px] text-txt2">Description</label><Input value={skill.description} onChange={(description) => setSkill((v) => ({ ...v, description }))} /></div><div><label className="text-[11.5px] text-txt2">Markdown content (có thể dán trực tiếp)</label><textarea value={skill.body} onChange={(event) => setSkill((v) => ({ ...v, body: event.target.value }))} className="font-v3-mono bg-panel border border-bd rounded-[6px] p-[9px_11px] text-[12px] text-txt w-full min-h-[150px] resize-y" /></div></div>}

    {tab === 'Workflows' && <div className="flex flex-col gap-[8px]"><div className="flex items-center gap-[8px]"><label className="text-[11.5px] text-txt2">Version</label><Input value={version} onChange={setVersion} /><Button label="+ Thêm step" size="xs" variant="default" onClick={() => setSteps((current) => [...current, { ...blankStep(), id: `step-${current.length + 1}` }])} /></div>{steps.map((step, index) => <StepEditor key={`${index}-${step.id}`} step={step} agents={registry.agents.map((item) => item.id)} skills={registry.skills.map((item) => item.id)} onChange={(patch) => updateStep(index, patch)} onRemove={() => setSteps((current) => current.filter((_, i) => i !== index))} />)}</div>}
    <ValidationPanel checks={checks} />
    {error && <div className="border border-err rounded-[6px] p-[10px_12px] text-[11.5px] text-err">{error}</div>}
  </Modal>;
}

function Picker({ label, values, options, onChange }: { label: string; values: readonly string[]; options: readonly string[]; onChange: (values: string[]) => void }) {
  return <div className="flex flex-col gap-[6px]"><label className="text-[11.5px] text-txt2">{label}</label><div className="flex flex-wrap gap-[6px]">{options.map((option) => { const selected = values.includes(option); return <button key={option} type="button" onClick={() => onChange(selected ? values.filter((item) => item !== option) : [...values, option])}><Chip label={`${selected ? '◉' : '○'} ${option}`} tone={selected ? 'acc' : 'default'} mono /></button>; })}</div></div>;
}

function StepEditor({ step, agents, skills, onChange, onRemove }: { step: RegistryPipelineStep; agents: string[]; skills: string[]; onChange: (patch: Partial<RegistryPipelineStep>) => void; onRemove: () => void }) {
  return <div className="border border-bd rounded-[6px] p-[10px] flex flex-col gap-[7px]"><div className="grid grid-cols-2 gap-[8px]"><Input value={step.id} onChange={(id) => onChange({ id })} placeholder="step-id" /><Input value={step.agent ?? ''} onChange={(agent) => onChange({ agent: agent || undefined })} placeholder={`agent (${agents.join(', ') || 'none'})`} /></div><div className="grid grid-cols-2 gap-[8px]"><Input value={step.skills.join(', ')} onChange={(value) => onChange({ skills: split(value) })} placeholder={`skills (${skills.join(', ') || 'none'})`} /><Input value={step.outputs.join(', ')} onChange={(value) => onChange({ outputs: split(value) })} placeholder="outputs, comma separated" /></div><div className="grid grid-cols-2 gap-[8px]"><Input value={step.gate ?? ''} onChange={(gate) => onChange({ gate: gate || undefined })} placeholder="gate (optional)" /><Input value={step.onReject?.rerun ?? ''} onChange={(rerun) => onChange({ onReject: rerun ? { rerun, withFeedback: step.onReject?.withFeedback ?? true } : undefined })} placeholder="on reject rerun step" /></div><div className="flex items-center gap-[10px] text-[11px] text-txt2"><label><input type="checkbox" checked={step.autoReview} onChange={(event) => onChange({ autoReview: event.target.checked })} /> auto review</label><label><input type="checkbox" checked={step.humanReview} onChange={(event) => onChange({ humanReview: event.target.checked })} /> human review</label><label><input type="checkbox" checked={step.onReject?.withFeedback ?? true} disabled={!step.onReject} onChange={(event) => step.onReject && onChange({ onReject: { ...step.onReject, withFeedback: event.target.checked } })} /> pass feedback</label><button type="button" onClick={onRemove} className="ml-auto text-err">Xoá</button></div></div>;
}
