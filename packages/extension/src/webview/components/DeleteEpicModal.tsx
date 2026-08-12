import { useState } from 'react';
import { Btn, Mono } from './epic-v3/primitives';
import { V3Input, V3Modal, V3ModalFooter, V3ModalHeader } from './epic-v3/V3Modal';

interface Props {
  epicId: string;
  /** Path shown to the user (workspace-relative when available). */
  epicDir: string;
  /** Whether this epic has a live run-state JSON in .aidlc/runs/. */
  hasRun: boolean;
  onConfirm: (deleteFolder: boolean) => void;
  onClose: () => void;
}

/**
 * Confirm dialog for deleting an epic. By default only the live run-state JSON
 * is removed and the on-disk folder is kept — matching the historical
 * `deleteRun` behaviour. Ticking the checkbox opts into deleting the whole
 * `docs/epics/<id>` folder, which is irreversible, so that path additionally
 * requires the user to type the epic id to confirm.
 *
 * v3-styled; the guard conditions (`canConfirm`) and the `onConfirm` payload
 * are unchanged. Backdrop click still does not dismiss — an accidental click
 * must not discard a typed confirmation.
 */
export function DeleteEpicModal({ epicId, epicDir, hasRun, onConfirm, onClose }: Props) {
  const [deleteFolder, setDeleteFolder] = useState(false);
  const [typed, setTyped] = useState('');
  const canConfirm = !deleteFolder || typed.trim() === epicId;

  const submit = () => {
    if (!canConfirm) { return; }
    onConfirm(deleteFolder);
    onClose();
  };

  return (
    <V3Modal
      width={560}
      paddingTop={110}
      danger={deleteFolder}
      // Esc and the header button close; a backdrop click must not throw away
      // the typed confirmation (matches the previous closeOnBackdrop={false}).
      closeOnBackdrop={false}
      onClose={onClose}
      header={<V3ModalHeader title={`Delete epic ${epicId}`} onClose={onClose} tone="err" icon="🗑" />}
      footer={
        <V3ModalFooter cli={`aidlc epic delete ${epicId}${deleteFolder ? ' --delete-folder' : ''}`}>
          <Btn label="Huỷ" onClick={onClose} pad="9px 14px" fs={12.5} />
          <Btn
            label={deleteFolder ? 'Delete epic + folder' : 'Delete run state'}
            variant="danger"
            onClick={submit}
            disabled={!canConfirm}
            title={canConfirm ? undefined : `Nhập đúng ${epicId} để xác nhận`}
            pad="9px 16px"
            fs={12.5}
          />
        </V3ModalFooter>
      }
    >
      <div style={{ fontSize: 12.5, color: 'var(--txt2)', lineHeight: 1.65 }}>
        {hasRun
          ? <>Xoá run-state JSON trong <Mono>.aidlc/runs/</Mono>.</>
          : 'Epic này không có run state.'}{' '}
        Mặc định thư mục epic và artifact được giữ lại.
      </div>

      <label
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 9, padding: '10px 12px',
          borderRadius: 7, border: '1px solid var(--bd)', background: 'var(--panel)',
          cursor: 'pointer', fontSize: 12, color: 'var(--txt)', lineHeight: 1.6,
        }}
      >
        <input
          type="checkbox"
          checked={deleteFolder}
          onChange={(e) => { setDeleteFolder(e.target.checked); setTyped(''); }}
          style={{ marginTop: 2, flex: 'none', accentColor: 'var(--acc)' }}
        />
        <span>
          Xoá luôn thư mục <Mono style={{ fontSize: 11, wordBreak: 'break-all' }}>{epicDir}</Mono>
          {' '}— state, inputs và toàn bộ artifact.
        </span>
      </label>

      {deleteFolder && (
        <div
          style={{
            display: 'flex', flexDirection: 'column', gap: 7, padding: '11px 12px',
            borderRadius: 7, border: '1px solid var(--err-bd)', background: 'var(--err-bg)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--err)', fontWeight: 600 }}>
            <span>▲</span>
            <span>Xoá vĩnh viễn thư mục này, không thể hoàn tác.</span>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--txt2)' }}>
            Nhập <Mono style={{ color: 'var(--txt)', fontWeight: 600 }}>{epicId}</Mono> để xác nhận:
          </div>
          <V3Input value={typed} onChange={setTyped} placeholder={epicId} mono />
        </div>
      )}
    </V3Modal>
  );
}
