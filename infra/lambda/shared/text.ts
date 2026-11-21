/** Case-insensitive, accent-insensitive comparison for alphabetical sorting. */
export function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}
