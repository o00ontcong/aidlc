// v3/components/MockBoundary.tsx
// Bọc mọi control đang dùng dữ liệu giả. Khi bật cờ, control được tô đỏ (viền
// dashed + sọc đỏ; level="block" thêm nhãn "MOCK: <id>" ở góc).
//
// Cách dùng:
//   <MockBoundary id="sidebar.quota" level="block">…card quota…</MockBoundary>
//   <span {...mock('epic.tokens')}>{tokens}</span>
//
// Cờ bật/tắt: MockProvider đặt class .mock-visible lên <html>.
// Grep sau này:  rg 'data-mock-id="sidebar.quota"'   hoặc  rg 'MockBoundary id='

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

type Level = 'inline' | 'block';

const MockCtx = createContext<{ visible: boolean; setVisible: (v: boolean) => void }>({
  visible: true, setVisible: () => {},
});

export function MockProvider({ children, initial = true }: { children: React.ReactNode; initial?: boolean }) {
  const [visible, setVisible] = useState(initial);
  useEffect(() => {
    document.documentElement.classList.toggle('mock-visible', visible);
  }, [visible]);
  const value = useMemo(() => ({ visible, setVisible }), [visible]);
  return <MockCtx.Provider value={value}>{children}</MockCtx.Provider>;
}

export const useMockVisible = () => useContext(MockCtx);

/** Spread vào bất kỳ element nào để đánh dấu là mock. */
export function mock(id: string, level: Level = 'inline') {
  return { 'data-mock': 'true', 'data-mock-id': id, 'data-mock-level': level } as const;
}

export function MockBoundary({
  id, level = 'inline', as: As = 'div', className, style, children,
}: {
  id: string; level?: Level; as?: React.ElementType;
  className?: string; style?: React.CSSProperties; children: React.ReactNode;
}) {
  return (
    <As {...mock(id, level)} className={className} style={style}>
      {children}
    </As>
  );
}
