import type { ReactNode } from 'react';

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"]+/gi;
/** Punctuation that ends a sentence rather than the address. */
const TRAILING = /[.,;:!?،؛)\]}'"»]+$/;

/**
 * Plain text with its web addresses as links. Nothing is ever read as HTML: the text stays text,
 * and only http and https addresses become links, opened apart from the platform. `keyPrefix`
 * keeps keys apart when several pieces of one message are linkified.
 */
export function linkify(text: string, keyPrefix = 'link'): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index;
    const raw = match[0];
    const trailing = TRAILING.exec(raw)?.[0] ?? '';
    const url = raw.slice(0, raw.length - trailing.length);
    if (start > last) {
      parts.push(text.slice(last, start));
    }
    parts.push(
      <a
        key={`${keyPrefix}-${String(start)}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        dir="ltr"
      >
        {url}
      </a>,
    );
    last = start + url.length;
  }
  if (last < text.length) {
    parts.push(text.slice(last));
  }
  return parts;
}
