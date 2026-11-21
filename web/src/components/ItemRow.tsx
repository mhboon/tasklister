import { useState } from 'react';
import { api, type Criticality, type Item } from '../lib/api';
import { isOverdue, relativeLabel } from '../lib/dates';
import { Linkified } from './Linkified';

const CRIT_LABEL: Record<Criticality, string> = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };

interface Props {
  item: Item;
  /** True while this item is open in the detail pane. */
  selected?: boolean;
  /** Opens the item in the detail pane. */
  onOpen: () => void;
  /** Called with the updated item after it is completed or reopened. */
  onChange: (item: Item) => void;
  showList?: boolean;
  onError: (message: string) => void;
}

/** One line in a list, agenda or priority view. Everything else is in ItemDetail. */
export function ItemRow({ item, selected, onOpen, onChange, showList, onError }: Props) {
  const [busy, setBusy] = useState(false);
  const done = item.status === 'DONE';
  const overdue = isOverdue(item.dueDate, item.status);
  const doneSubs = item.subitems.filter((s) => s.status === 'DONE').length;

  async function toggle() {
    setBusy(true);
    try {
      onChange(await api.setItemStatus(item.listId, item.itemId, done ? 'OPEN' : 'DONE'));
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={`item${done ? ' done' : ''}${overdue ? ' overdue' : ''}${selected ? ' selected' : ''}`}>
      <div className="item-main">
        <input
          type="checkbox"
          aria-label={done ? 'Mark as not completed' : 'Mark as completed'}
          checked={done}
          disabled={busy}
          onChange={toggle}
        />
        {/* A div, not a button: the title can contain links, and links can't nest in buttons. */}
        <div className="item-title" onClick={onOpen}>
          <span className="title-text"><Linkified text={item.title} /></span>
          <span className="badges">
            {item.dueDate && <span className={`badge due${overdue ? ' overdue' : ''}`}>{relativeLabel(item.dueDate)}</span>}
            {item.criticality && <span className={`badge crit-${item.criticality}`}>{CRIT_LABEL[item.criticality]}</span>}
            {item.recurringId && <span className="badge" title="Recurring">↻</span>}
            {item.subitems.length > 0 && <span className="badge muted-badge">{doneSubs}/{item.subitems.length}</span>}
            {showList && item.listName && <span className="badge list-badge">{item.listName}</span>}
          </span>
        </div>
        <button type="button" className="icon-btn expand-btn" aria-label={`Open ${item.title}`} aria-current={selected} onClick={onOpen}>
          ›
        </button>
      </div>
    </li>
  );
}
