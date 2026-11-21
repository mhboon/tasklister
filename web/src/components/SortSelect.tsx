import { SORT_OPTIONS, type SortKey } from '../lib/sort';

export function SortSelect({ value, onChange }: { value: SortKey; onChange: (k: SortKey) => void }) {
  return (
    <label className="field inline sort-select">
      <span>Sort</span>
      <select value={value} onChange={(e) => onChange(e.target.value as SortKey)}>
        {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
    </label>
  );
}
