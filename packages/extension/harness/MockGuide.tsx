import { useState, type CSSProperties } from 'react';

/** Harness-only legend. In-flow at the bottom so it never covers SUMMARY/graph. */
export function MockGuide() {
  const [open, setOpen] = useState(false);
  return (
    <aside
      style={{
        flex: 'none', borderTop: '1px solid var(--bd)',
        background: 'var(--panel)', color: 'var(--txt)', fontSize: 12, lineHeight: 1.45,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        title={open ? 'Thu gọn chú thích mock' : 'Mở chú thích mock'}
        style={{
          width: '100%', textAlign: 'left', font: 'inherit', cursor: 'pointer',
          padding: '8px 12px', border: 0,
          borderBottom: open ? '1px solid var(--bd)' : 0,
          background: 'var(--panel)', color: 'var(--txt)', fontWeight: 700,
        }}
      >
        {open ? '▾ Thu gọn chú thích mock' : '▸ Mở chú thích mock'} · 7 epic
      </button>
      {open && (
        <div
          style={{
            padding: '10px 14px 14px', display: 'grid',
            gridTemplateColumns: '1fr 1fr', gap: 16,
            maxHeight: 220, overflow: 'auto',
          }}
        >
          <section>
            <div style={h}>Epic — vấn đề cần thấy</div>
            <ul style={ul}>
              <li><b>CTX-1</b> — baseline chờ Approve. Pill autonomous. Graph kiến trúc.</li>
              <li><b>PAY-S</b> — 1 step: package-mission. SUMMARY + flow. MISSION.md.</li>
              <li><b>PAY-I</b> — implement as-built + host node + diff + PR. Mode guided.</li>
              <li><b>PAY-BUG</b> — resolve-bugs, sheet trắng 2 đầu. Approve bản sửa ≠ Report.</li>
              <li><b>PAY-THIN</b> — Jira 1 dòng, không graph, banner pack thiếu, Start bị chặn.</li>
              <li><b>PAY-DONE</b> — đã merge, đối chiếu state xong.</li>
              <li><b>DESIGN-001</b> — layout cũ 11 block (không briefing).</li>
              <li><b>Start implement</b> — New Epic chọn feature-implement, hoặc PAY-THIN → Chọn nguồn pack.</li>
            </ul>
          </section>
          <section>
            <div style={h}>Nút dễ không biết để làm gì</div>
            <ul style={ul}>
              <li><b>Tự nạp memory</b> (header list) — bật hook Claude, không mở file.</li>
              <li><b>★ / ⚡</b> — theo dõi list / tạo Autonomous Delivery mới.</li>
              <li><b>guided / autonomous</b> (pill) — chỉ báo mode; đổi ở Cấu hình trong Agent timeline.</li>
              <li><b>Tab Luồng / Surfaces / Cây feature</b> — switch graph, không phải gate. Zoom: Ctrl + lăn.</li>
              <li><b>Chạy lại step / auto-review</b> — rerun hoặc validator máy, không Approve.</li>
              <li><b>Kiểm tra artifact / Xuất báo cáo</b> — file trên disk / Markdown history.</li>
              <li><b>Mở thư mục artifact / Xem memory</b> — Finder / digest epic.</li>
            </ul>
          </section>
        </div>
      )}
    </aside>
  );
}

const h: CSSProperties = {
  fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase',
  color: 'var(--txt3)', fontWeight: 700, marginBottom: 4,
};
const ul: CSSProperties = { margin: 0, paddingLeft: 18, color: 'var(--txt)' };
