import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const TEST_NAME = 'testHighTemperatureAlertRequiresThreshold';

function runSwiftTest(srcDir) {
  try {
    const output = execFileSync('swift', ['test', '--filter', TEST_NAME], { cwd: srcDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, output };
  } catch (error) {
    return { ok: false, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

export default async function validate(ctx) {
  const root = ctx.workspaceRoot ?? process.cwd();
  const testPath = path.join(root, 'src/Tests/SkyCastTests/ForecastStoreTests.swift');
  const evidencePath = path.join(root, 'docs/epics', String(ctx.context?.epic ?? ctx.state.runId), 'artifacts/RED-EVIDENCE.md');
  if (!existsSync(testPath) || !readFileSync(testPath, 'utf8').includes(`func ${TEST_NAME}`)) {
    return { decision: 'reject', reason: `Chưa có test RED tên ${TEST_NAME}.` };
  }
  if (!existsSync(evidencePath) || !readFileSync(evidencePath, 'utf8').includes('## Expected Failure')) {
    return { decision: 'reject', reason: 'Thiếu RED-EVIDENCE.md hoặc mục Expected Failure.' };
  }
  const result = runSwiftTest(path.join(root, 'src'));
  if (result.ok) return { decision: 'reject', reason: `RED không hợp lệ: ${TEST_NAME} đang xanh.` };
  if (/\berror:|no such module|missing required module/i.test(result.output)) {
    return { decision: 'reject', reason: 'RED không hợp lệ: test fail do compile/import thay vì assertion sản phẩm.' };
  }
  if (!/XCTAssert.*failed|failed -|Test Case .* failed/i.test(result.output)) {
    return { decision: 'reject', reason: 'RED không có assertion failure nhận diện được.' };
  }
  return { decision: 'pass', reason: `${TEST_NAME} đã chạy và fail bằng assertion như expected.` };
}
