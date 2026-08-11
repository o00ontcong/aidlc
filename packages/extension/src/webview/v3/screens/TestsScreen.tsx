// v3/screens/TestsScreen.tsx — Tab Tests: Test Agent · E2E pipeline stepper + verdict/gate.
import React from 'react';
import { Card, Button } from '../components';
import { MOCK_TEST_STEPS, MOCK_TEST_VERDICT } from '../data/mock-data';
import type { TestStepVM } from '../data/types';

/** Màu connector đi ra từ step này (dùng cho segment bên phải node, và bên trái node kế tiếp). */
function outColor(step: TestStepVM): string {
  return step.kind === 'done' ? 'var(--acc)' : 'var(--track)';
}

function StepNode({ step }: { step: TestStepVM }) {
  let ring = 'var(--track)';
  let fill = 'transparent';
  let iconColor = 'var(--txt3)';
  let icon = '○';

  if (step.kind === 'done') {
    ring = 'var(--acc)';
    fill = 'var(--acc)';
    iconColor = 'var(--on-acc)';
    icon = '✓';
  } else if (step.kind === 'active') {
    ring = 'var(--warn)';
    fill = 'transparent';
    iconColor = 'var(--warn)';
    icon = '●';
  }

  if (step.gate) {
    icon = '🔒';
    fill = 'transparent';
    iconColor = 'var(--warn)';
    ring = step.kind === 'done' ? 'var(--acc)' : 'var(--warn)';
  }

  return (
    <div
      style={{ width: 28, height: 28, borderColor: ring, background: fill, color: iconColor }}
      className={`flex-none border-[2px] flex items-center justify-center text-[12px] ${
        step.gate ? 'rounded-[6px]' : 'rounded-full'
      }`}
    >
      {icon}
    </div>
  );
}

export default function TestsScreen() {
  return (
    <div className="overflow-auto p-[20px_22px] flex flex-col gap-[16px]">
      <div className="text-[13px] font-semibold text-txt">Test Agent · E2E pipeline</div>

      <Card className="p-[18px_16px]" bodyClassName="flex" mockId="tests.pipeline" mockLevel="block">
        {MOCK_TEST_STEPS.map((step, i) => {
          const leftColor = i === 0 ? 'transparent' : outColor(MOCK_TEST_STEPS[i - 1]);
          const rightColor = i === MOCK_TEST_STEPS.length - 1 ? 'transparent' : outColor(step);
          return (
            <div key={step.name} className="flex-1 flex flex-col gap-[7px]">
              <div className="flex items-center">
                <div className="h-[2px] flex-1" style={{ background: leftColor }} />
                <StepNode step={step} />
                <div className="h-[2px] flex-1" style={{ background: rightColor }} />
              </div>
              <div className="text-[11.5px] font-semibold text-txt text-center">{step.name}</div>
              <div className="text-[10.5px] text-txt3 text-center">{step.meta}</div>
            </div>
          );
        })}
      </Card>

      <div className="grid grid-cols-2 gap-[14px]">
        <Card title="VERDICT" className="border-acc-bd">
          <div className="p-[14px] flex flex-col gap-[9px]">
            <div className="text-[15px] font-bold text-txt">{MOCK_TEST_VERDICT.headline}</div>
            <div className="text-[12px] text-txt2">{MOCK_TEST_VERDICT.body}</div>
            <Button label="Mở report chi tiết" variant="default" size="sm" className="self-start" onClick={() => {}} />
          </div>
        </Card>
        <Card title="🔒 2 gate trong pipeline" className="border-warn-bd">
          <div className="p-[14px] text-[12px] text-txt2">{MOCK_TEST_VERDICT.gates}</div>
        </Card>
      </div>
    </div>
  );
}
