import { Fragment } from 'react';

const URL_RE = /\bhttps?:\/\/[^\s<>"]+/gi;
const TRAILING = /[.,;:!?)\]}'"]+$/;

/** Renders text with http(s) URLs as links that open in a new tab (or the browser, on a phone). */
export function Linkified({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    const url = m[0].replace(TRAILING, '');
    if (start > last) parts.push(<Fragment key={`t${start}`}>{text.slice(last, start)}</Fragment>);
    parts.push(
      <a key={`u${start}`} href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
        {url}
      </a>
    );
    last = start + url.length;
  }
  if (last < text.length) parts.push(<Fragment key="end">{text.slice(last)}</Fragment>);
  return <>{parts}</>;
}
