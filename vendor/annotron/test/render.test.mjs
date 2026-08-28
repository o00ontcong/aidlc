/**
 * Annotron renders and boots with no installed dependencies.
 *
 * These are regression tests for a fault that made the tool unusable rather
 * than merely untested: `src/mdRender.js` imported `markdown-it` and `merslim`
 * as bare package names, but annotron is only ever *copied* into place — into
 * `~/.claude/tools/annotron` by the extension installer, into the VSIX by
 * `copy:annotron`, into the CLI by `bundle` — with no `npm install` step and no
 * `node_modules` alongside it. `src/server.js` imports `mdRender.js` at the top
 * level, so every path that opened a file died with ERR_MODULE_NOT_FOUND before
 * serving anything.
 *
 * Both libraries are now vendored as single-file ESM bundles under `vendor/`.
 * The suite deliberately runs from the repo, where annotron has no
 * `node_modules` either — so a regression to bare imports fails here at once.
 *
 * Run: node --test vendor/annotron/test/
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

test('the vendored bundles are present', () => {
  for (const name of ['markdown-it.esm.mjs', 'merslim.esm.mjs']) {
    assert.ok(
      existsSync(path.join(ROOT, 'vendor', name)),
      `vendor/${name} is missing — mdRender.js imports it by relative path`,
    );
  }
});

test('annotron carries no installed node_modules to fall back on', () => {
  // If this ever becomes false the other tests stop proving anything: bare
  // imports would resolve from disk and the shipped copy could still be broken.
  assert.ok(
    !existsSync(path.join(ROOT, 'node_modules')),
    'annotron has node_modules — these tests no longer prove the shipped copy resolves',
  );
});

test('renderMarkdown renders prose through the vendored markdown-it', async () => {
  const { renderMarkdown } = await import('../src/mdRender.js');
  const html = await renderMarkdown('# Title\n\nsome **bold** text\n');

  assert.equal(typeof html, 'string');
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /Title/);
});

test('renderMarkdown turns a mermaid fence into inline SVG via vendored merslim', async () => {
  const { renderMarkdown } = await import('../src/mdRender.js');
  const html = await renderMarkdown('```mermaid\ngraph TD\nA-->B\n```\n');

  // The point of merslim here is server-side layout: the diagram must arrive as
  // SVG, not as a fenced block for a client-side runtime to draw.
  assert.match(html, /<svg/);
});

test('the server boots and listens', async () => {
  const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const output = await new Promise((resolve) => {
    let seen = '';
    const done = (value) => {
      clearTimeout(timer);
      child.kill();
      resolve(value);
    };
    const timer = setTimeout(() => done(seen), 5000);
    child.stdout.on('data', (chunk) => {
      seen += chunk;
      if (seen.includes('listening')) { done(seen); }
    });
    child.stderr.on('data', (chunk) => {
      seen += chunk;
      // Fail fast on the exact fault this suite exists for.
      if (seen.includes('ERR_MODULE_NOT_FOUND')) { done(seen); }
    });
  });

  assert.doesNotMatch(
    output,
    /ERR_MODULE_NOT_FOUND/,
    `server could not resolve an import:\n${output}`,
  );
  assert.match(output, /listening on http/);
});
