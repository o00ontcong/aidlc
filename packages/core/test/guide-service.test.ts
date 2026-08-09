import { expect, it } from 'vitest';
import { STAGE_IDS } from '../src/contracts';
import { GuideService } from '../src/guide';
it('provides complete, non-mutating help for every canonical stage', () => {
  const guide = new GuideService();
  for (const stage of STAGE_IDS) expect(guide.preview(stage)).toMatchObject({ stage, mutation: false, guide: { why: expect.any(String), doneWhen: expect.any(String) } });
  expect(guide.doctor()[0].ok).toBe(true);
});
