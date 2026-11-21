import { SORT_OPTIONS, type SortKey } from '../lib/sort';

/** A small outlined box for the page header; the arrow is the direction. */
export function SortSelect({ value, onChange }: { value: SortKey; onChange: (k: SortKey) => void }) {
  return (
    <select className="sort-compact" aria-label="Sort" title="Sort" value={value} onChange={(e) => onChange(e.target.value as SortKey)}>
      {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
    </select>
  );
}
