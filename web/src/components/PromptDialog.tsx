import { useEffect, useRef, useState } from 'react';

export interface PromptDialogProps {
  open: boolean;
  title: string;
  label: string;
  initial?: string;
  confirmLabel?: string;
  onSubmit: (value: string) => Promise<void> | void;
  onCancel: () => void;
}

export function PromptDialog({ open, title, label, initial = '', confirmLabel = 'Save', onSubmit, onCancel }: PromptDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setValue(initial);
      setError(null);
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open, initial]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(value.trim());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      className="dialog"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <form onSubmit={submit}>
        <h2>{title}</h2>
        <label className="field">
          <span>{label}</span>
          <input value={value} onChange={(e) => setValue(e.target.value)} maxLength={100} autoFocus />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="submit" className="primary" disabled={busy || !value.trim()}>
            {busy ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
