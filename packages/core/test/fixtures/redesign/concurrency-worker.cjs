const { EpicService } = require('../../../dist');

const [root, mode, index] = process.argv.slice(2);
const service = new EpicService(root);

if (mode === 'update') {
  const epic = service.require('EPIC-CONCURRENCY');
  try {
    service.update(epic.id, { title: `writer-${index}` }, Number(process.env.EXPECTED_REVISION));
    process.send?.({ ok: true });
  } catch (error) {
    process.send?.({ ok: false, name: error.name, message: error.message });
  }
} else {
  let attempt = 0;
  for (;;) {
    try {
      service.record('EPIC-CONCURRENCY', { command: 'concurrency.record', detail: `writer-${index}` });
      process.send?.({ ok: true, attempt });
      break;
    } catch (error) {
      attempt += 1;
      if (attempt >= 50) {
        process.send?.({ ok: false, name: error.name, message: error.message });
        break;
      }
    }
  }
}
