/**
 * In-webview commit dialog for Discover — replaces VS Code InputBox, which
 * renders as a command-palette bar and is easy to miss over a webview panel.
 */

import { useState } from 'react';
import { Sparkles } from 'lucide-react';

import type { DiscoverCommitModalOpen } from '@/lib/types';
import { discoverCopy, type DiscoverLanguage } from '@/lib/discoverI18n';
import { postMessage } from '@/lib/bridge';
import { Modal, ModalCancelButton, ModalConfirmButton, ModalFooter } from '../Modal';

export function DiscoverCommitModal({
  open,
  language,
  onClose,
}: {
  open: DiscoverCommitModalOpen;
  language: DiscoverLanguage;
  onClose: () => void;
}) {
  const copy = discoverCopy(language);
  const cm = copy.commitModal;
  const [message, setMessage] = useState(open.defaultMessage);

  const submit = () => {
    const trimmed = message.trim();
    if (!trimmed) { return; }
    postMessage({ type: 'submitDiscoverCommit', message: trimmed });
    onClose();
  };

  const agentCommit = () => {
    postMessage({ type: 'agentDiscoverCommit' });
    onClose();
  };

  return (
    <Modal
      title={cm.title}
      subtitle={cm.subtitle(open.repoName)}
      maxWidth="max-w-md"
      onClose={() => { postMessage({ type: 'cancelDiscoverCommit' }); onClose(); }}
      closeOnBackdrop={false}
      onSubmit={submit}
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label className="block text-[11px] font-medium text-foreground">{cm.messageLabel}</label>
          <button
            type="button"
            onClick={agentCommit}
            title={cm.generateWithAi}
            className="inline-flex items-center gap-1 rounded-md border border-primary/40 px-2 py-0.5 text-[10px] font-medium text-primary transition hover:bg-primary/10"
          >
            <Sparkles className="h-3 w-3" />
            {cm.generateWithAi}
          </button>
        </div>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={cm.messagePlaceholder}
          rows={4}
          autoFocus
          className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground"
        />
        {open.changeCount > 0 && (
          <p className="text-[11px] text-muted-foreground">{cm.changeHint(open.changeCount)}</p>
        )}
      </div>
      <ModalFooter>
        <ModalCancelButton onClick={() => { postMessage({ type: 'cancelDiscoverCommit' }); onClose(); }} />
        <ModalConfirmButton
          onClick={submit}
          label={cm.confirm}
          disabled={!message.trim()}
        />
      </ModalFooter>
    </Modal>
  );
}
