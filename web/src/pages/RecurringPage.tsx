import { useState } from 'react';
import { compareText } from '../lib/sort';
import { api, type Criticality, type Frequency, type Recurring, type RecurringInput } from '../lib/api';
import { useAppData } from '../lib/AppData';
import { useLoad } from '../lib/useLoad';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { formatDate, todayLocal } from '../lib/dates';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function describe(r: Recurring): string {
  const n = r.interval;
  if (r.frequency === 'DAILY') return n === 1 ? 'Every day' : `Every ${n} days`;
  if (r.frequency === 'WEEKLY') {
    const day = WEEKDAYS[r.weekday ?? 0];
    return n === 1 ? `Every ${day}` : `Every ${n} weeks on ${day}`;
  }
  return n === 1 ? `Every month on day ${r.dayOfMonth}` : `Every ${n} months on day ${r.dayOfMonth}`;
}

export function RecurringPage() {
  const { lists } = useAppData();
  const { data, setData, error, setError, loading, reload } = useLoad(() => api.listRecurring());
  const [editing, setEditing] = useState<Recurring | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Recurring | null>(null);

  async function toggleActive(r: Recurring) {
    try {
      await api.updateRecurring(r.recurringId, toInput(r, { active: !r.active }));
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <section className="page">
      <div className="page-head">
        <h1>Recurring</h1>
        <div className="head-actions"><button type="button" className="primary" onClick={() => setEditing('new')}>New recurring item</button></div>
      </div>
      <p className="muted small">
        Each morning, a recurring item is added to its list if it is due and the previous one is not still open.
      </p>
      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Loading…</p>}
      {!loading && (data ?? []).length === 0 && <p className="muted empty">No recurring items yet.</p>}
      <ul className="items">
        {[...(data ?? [])].sort((a, b) => compareText(a.title, b.title)).map((r) => (
          <li key={r.recurringId} className={`item${r.active ? '' : ' done'}`}>
            <div className="item-main recurring-row">
              <div className="grow">
                <div className="title-text">{r.title}</div>
                <div className="muted small">
                  {describe(r)} → {r.targetListName ?? 'unknown list'}
                  {r.active ? ` · next ${formatDate(r.nextDue)}` : ' · paused'}
                  {r.criticality ? ` · ${r.criticality.toLowerCase()}` : ''}
                </div>
              </div>
              <button type="button" onClick={() => toggleActive(r)}>{r.active ? 'Pause' : 'Resume'}</button>
              <button type="button" onClick={() => setEditing(r)}>Edit</button>
              <button type="button" className="danger" onClick={() => setDeleting(r)}>Delete</button>
            </div>
          </li>
        ))}
      </ul>

      {editing && (
        <RecurringForm
          key={editing === 'new' ? 'new' : editing.recurringId}
          initial={editing === 'new' ? null : editing}
          lists={lists.map((l) => ({ id: l.listId, name: l.name }))}
          onCancel={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this recurring item?"
        message={`“${deleting?.title}” will stop being created. Items already created stay in their list.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await api.deleteRecurring(deleting.recurringId);
            setData((cur) => (cur ? cur.filter((r) => r.recurringId !== deleting.recurringId) : cur));
          } catch (e) {
            setError((e as Error).message);
          }
          setDeleting(null);
        }}
      />
    </section>
  );
}

function toInput(r: Recurring, over: Partial<RecurringInput> = {}): RecurringInput {
  return {
    title: r.title,
    targetListId: r.targetListId,
    frequency: r.frequency,
    interval: r.interval,
    weekday: r.weekday,
    dayOfMonth: r.dayOfMonth,
    startDate: r.startDate,
    criticality: r.criticality,
    active: r.active,
    ...over,
  };
}

function RecurringForm({
  initial,
  lists,
  onCancel,
  onSaved,
}: {
  initial: Recurring | null;
  lists: { id: string; name: string }[];
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [targetListId, setTarget] = useState(initial?.targetListId ?? lists[0]?.id ?? '');
  const [frequency, setFrequency] = useState<Frequency>(initial?.frequency ?? 'WEEKLY');
  const [interval, setInterval_] = useState(initial?.interval ?? 1);
  const [weekday, setWeekday] = useState(initial?.weekday ?? new Date().getDay());
  const [dayOfMonth, setDayOfMonth] = useState(initial?.dayOfMonth ?? new Date().getDate());
  const [startDate, setStart] = useState(initial?.startDate ?? todayLocal());
  const [criticality, setCrit] = useState<Criticality | ''>(initial?.criticality ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const input: RecurringInput = {
      title,
      targetListId,
      frequency,
      interval,
      weekday: frequency === 'WEEKLY' ? weekday : null,
      dayOfMonth: frequency === 'MONTHLY' ? dayOfMonth : null,
      startDate,
      criticality: criticality || null,
      active: initial?.active ?? true,
    };
    try {
      if (initial) await api.updateRecurring(initial.recurringId, input);
      else await api.createRecurring(input);
      await onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const unit = frequency === 'DAILY' ? 'day(s)' : frequency === 'WEEKLY' ? 'week(s)' : 'month(s)';

  return (
    <form className="card recurring-form" onSubmit={submit}>
      <h2>{initial ? 'Edit recurring item' : 'New recurring item'}</h2>
      <label className="field"><span>Item name</span>
        <input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} required autoFocus />
      </label>
      <label className="field"><span>Add to list</span>
        <select value={targetListId} onChange={(e) => setTarget(e.target.value)} required>
          {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </label>
      <div className="row">
        <label className="field"><span>Repeat every</span>
          <input type="number" min={1} max={52} value={interval} onChange={(e) => setInterval_(Number(e.target.value))} required />
        </label>
        <label className="field"><span>Unit</span>
          <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)} aria-label="Unit">
            <option value="DAILY">days</option>
            <option value="WEEKLY">weeks</option>
            <option value="MONTHLY">months</option>
          </select>
        </label>
      </div>
      {frequency === 'WEEKLY' && (
        <label className="field"><span>On</span>
          <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
            {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
        </label>
      )}
      {frequency === 'MONTHLY' && (
        <label className="field"><span>Day of month</span>
          <input type="number" min={1} max={31} value={dayOfMonth} onChange={(e) => setDayOfMonth(Number(e.target.value))} required />
        </label>
      )}
      <div className="row">
        <label className="field"><span>Starting</span>
          <input type="date" value={startDate} onChange={(e) => setStart(e.target.value)} required />
        </label>
        <label className="field"><span>Priority</span>
          <select value={criticality} onChange={(e) => setCrit(e.target.value as Criticality | '')}>
            <option value="">None</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </label>
      </div>
      <p className="muted small">Every {interval} {unit}. The item's due date is the day it comes up.</p>
      {error && <p className="error">{error}</p>}
      <div className="dialog-actions">
        <button type="button" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" className="primary" disabled={busy || !title.trim() || !targetListId}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  );
}
