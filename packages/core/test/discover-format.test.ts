import { describe, expect, it } from 'vitest';

import {
  DISCOVER_STEPS,
  DOC_ARCHITECTURE,
  DOC_FEATURES,
  DOC_SKELETON,
  DOC_USER_FLOWS,
  getFileSpec,
  legacyFormatIssues,
  normalizeDiscoverDoc,
  parseDoc,
  renderEmptyDoc,
} from '../src';

describe('normalizeDiscoverDoc', () => {
  it('is a no-op on a canonical empty skeleton', () => {
    for (const spec of DISCOVER_STEPS.flatMap((s) => s.files)) {
      const empty = renderEmptyDoc(spec);
      expect(normalizeDiscoverDoc(empty, spec)).toBe(empty);
    }
  });

  it('rewrites old H1 titles and keeps the full Feature tree label', () => {
    const spec = getFileSpec(DOC_FEATURES)!;
    const full = 'Đăng nhập passkey: begin/verify challenge WebAuthn với platform authenticator hoặc hardware key. Covers FR-01.';
    const old = `# Features

## Features

- **F-LOGIN-01** — ${full}
- **F-LOGIN-02** — Đăng nhập mật khẩu — FR-02.
- **F-STEPUP-01** — Step-up JIT — FR-04.
`;
    const next = normalizeDiscoverDoc(old, spec);
    expect(next.startsWith('# Feature breakdown\n')).toBe(true);
    expect(next).toContain('## Feature tree');
    expect(next).toContain(`F-LOGIN-01 — ${full}`);
    expect(next).not.toMatch(/\u2026/);
    expect(legacyFormatIssues(parseDoc(next, spec), spec)).toEqual([]);
  });

  it('replaces a truncated Feature tree with the full item text', () => {
    const spec = getFileSpec(DOC_FEATURES)!;
    const full = 'Đăng nhập email/mật khẩu có cổng assertion: ưu tiên assertion thiết bị đã attest, re-attest một lần khi deviceNotAttested rồi mới fallback. Covers FR-02.';
    const truncated = `# Feature breakdown

## Feature tree

\`\`\`text
Login
└── F-LOGIN-02 — Đăng nhập email/mật khẩu có cổng assertion: ưu tiên assertion thiết b…
\`\`\`

## Features

- **F-LOGIN-02** — ${full}
`;
    const next = normalizeDiscoverDoc(truncated, spec);
    expect(next).toContain(full);
    expect(next).not.toContain('thiết b…');
  });

  it('inserts Screen flow and Layering when those headings are missing', () => {
    const flows = getFileSpec(DOC_USER_FLOWS)!;
    const flowed = normalizeDiscoverDoc(`# User flows

## Screens

- **SCR-01** — Login.
- **SCR-02** — Home.

## Flows
`, flows);
    expect(flowed.startsWith('# User flow / Screen flow\n')).toBe(true);
    expect(flowed).toContain('## Screen flow');
    expect(flowed).toContain('```mermaid');
    expect(flowed).toContain('flowchart TD');
    expect(flowed).toContain('Login');

    const arch = getFileSpec(DOC_ARCHITECTURE)!;
    const layered = normalizeDiscoverDoc(`# Architecture

## Layers

- **L-01** — Foundation
- **L-02** — Presentation

## Patterns

## Rationale

Fits the use cases.
`, arch);
    expect(layered).toContain('## Layering');
    expect(layered).toContain('```text');
    expect(layered).toContain('L-01');
  });

  it('rewrites an ASCII Screen flow into mermaid flowchart TD', () => {
    const spec = getFileSpec(DOC_USER_FLOWS)!;
    const next = normalizeDiscoverDoc(`# User flow / Screen flow

## Screen flow

\`\`\`text
FLOW-01  SCR-01 → SCR-02
\`\`\`

## Screens

- **SCR-01** — Onboarding: start.
- **SCR-02** — Login: sign in.

## Flows

### FLOW-01 — Sign in

- **Use cases:** UC-01
- **Steps:**
  - SCR-01 → SCR-02: chọn cách đăng nhập
`, spec);
    expect(next).toContain('```mermaid');
    expect(next).toContain('flowchart TD');
    expect(next).not.toContain('```text');
    expect(next).toContain('Onboarding');
    expect(next).toMatch(/SCR_01 --> SCR_02/);
    expect(legacyFormatIssues(parseDoc(next, spec), spec)).toEqual([]);
  });

  it('adds a Skeleton tree and canonical H1 without dropping SK ids', () => {
    const spec = getFileSpec(DOC_SKELETON)!;
    const next = normalizeDiscoverDoc(`# Skeleton

## Files and folders

- **SK-01** — \`src/app/main.swift\`
- **SK-02** — \`src/domain/entities/\`

## Interfaces

## Config

## Tests
`, spec);
    expect(next.startsWith('# Generate skeleton\n')).toBe(true);
    expect(next).toContain('## Skeleton tree');
    expect(next).toContain('src/app/main.swift');
    expect(next).toContain('**SK-01**');
  });
});
