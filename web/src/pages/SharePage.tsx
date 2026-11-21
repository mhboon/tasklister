import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, type Criticality } from '../lib/api';
import { useAppData } from '../lib/AppData';
import { loadShareTarget, saveShareTarget } from '../lib/sort';

/** Landing page for Android's "Share" menu (see share_target in manifest.json). */
export function SharePage() {
  const [params] = useSearchParams();
  const { me, lists, loading } = useAppData();
  const navigate = useNavigate();

  const sharedTitle = params.get('title')?.trim() ?? '';
  const sharedText = params.get('text')?.trim() ?? '';
  const sharedUrl = params.get('url')?.trim() ?? '';
  // Android often puts the link in `text` and leaves `url` empty (iOS Shortcuts
  // do too), so pull the URL out of `text` when `url` is missing.
  const url = sharedUrl || sharedText.match(/https?:\/\/[^\s<>"]+/i)?.[0] || '';
  const textWithoutUrl = url ? sharedText.replace(url, '').replace(/\s+/g, ' ').trim() : sharedText;
  const initialTitle = sharedTitle || textWithoutUrl.split('\n')[0] || url;
  // Whatever isn't already the title (extra text, the link) goes into the notes.
  const initialNotes = [textWithoutUrl !== initialTitle ? textWithoutUrl : '', url !== initialTitle ? url : '']
    .filter(Boolean)
    .join('\n');

  const [title, setTitle] = useState(initialTitle);
  const [notes, setNotes] = useState(initialNotes);
  const [due, setDue] = useState('');
  const [crit, setCrit] = useState<Criticality | ''>('');
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return <p className="muted pad">Loading…</p>;
  if (lists.length === 0) return <p className="pad muted">No lists are available to add to.</p>;

  // Last used list if still available, otherwise the Inbox, otherwise the first list.
  const remembered = me ? loadShareTarget(me.userId) : null;
  const fallback = lists.find((l) => l.listId === remembered) ?? lists.find((l) => l.isInbox) ?? lists[0];
  const target = picked ?? fallback.listId;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.createItem(target, title.trim(), due || null, crit || null, notes.trim() || null);
      if (me) saveShareTarget(me.userId, target);
      navigate(`/lists/${target}`, { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <section className="page narrow">
      <h1>Add to Tasklister</h1>
      <form className="card" onSubmit={save}>
        <label className="field"><span>Title</span><input value={title} maxLength={200} required onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="field"><span>Notes</span><textarea rows={4} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <label className="field"><span>Due date</span><input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>
        <label className="field">
          <span>Priority</span>
          <select value={crit} onChange={(e) => setCrit(e.target.value as Criticality | '')}>
            <option value="">None</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </label>
        <label className="field">
          <span>List</span>
          <select value={target} onChange={(e) => setPicked(e.target.value)}>
            {lists.map((l) => <option key={l.listId} value={l.listId}>{l.name}</option>)}
          </select>
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="primary" disabled={busy || !title.trim()}>Add</button>
      </form>
    </section>
  );
}
