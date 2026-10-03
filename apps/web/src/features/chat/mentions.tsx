import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { linkify } from './linkify';
import styles from './Chat.module.css';

/** Messages name people as @[uuid] and everyone as @[all]; people read and type @Name. */
const TOKEN = /@\[([0-9a-f-]{36}|all)\]/g;

interface Named {
  id: string;
  name: string;
}

/** A stored message as plain text, for previews, quotes and copying. */
export function plainBody(body: string, mentions: readonly Named[], everyone: string): string {
  return body.replace(TOKEN, (_token, target: string) =>
    target === 'all'
      ? `@${everyone}`
      : `@${mentions.find((person) => person.id === target)?.name ?? ''}`,
  );
}

/** A stored message with its links and mentions made live. */
export function renderBody(
  body: string,
  mentions: readonly Named[],
  everyone: string,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of body.matchAll(TOKEN)) {
    const index = match.index;
    if (index > last) {
      nodes.push(...linkify(body.slice(last, index), `text-${String(last)}`));
    }
    const target = match[1] ?? '';
    const person = mentions.find((entry) => entry.id === target);
    nodes.push(
      target === 'all' ? (
        <span key={`mention-${String(index)}`} className={styles.mention} dir="auto">
          @{everyone}
        </span>
      ) : (
        <Link
          key={`mention-${String(index)}`}
          to={`/app/people/${target}`}
          className={styles.mention}
          // A Latin name inside Arabic text keeps its @ in front.
          dir="auto"
        >
          @{person?.name ?? ''}
        </Link>
      ),
    );
    last = index + match[0].length;
  }
  if (last < body.length) {
    nodes.push(...linkify(body.slice(last), `text-${String(last)}`));
  }
  return nodes;
}

/**
 * What was typed, with each @Name of someone picked from the list turned into its token. Longer
 * names go first, so "@Omar Khaled" is not cut short by an "@Omar".
 */
export function toTokens(
  text: string,
  picked: ReadonlyMap<string, string>,
  everyone: readonly string[],
): string {
  let result = text;
  const names = [...picked.keys()].sort((a, b) => b.length - a.length);
  for (const name of names) {
    result = result.split(`@${name}`).join(`@[${picked.get(name) ?? ''}]`);
  }
  for (const word of everyone) {
    result = result.replace(
      new RegExp(`(^|\\s)@${word}(?=$|[\\s.,!?؟،])`, 'gu'),
      (_match, before: string) => `${before}@[all]`,
    );
  }
  return result;
}

/** The "@word" being typed just before the cursor, if any: what the suggestions filter on. */
export function mentionQuery(
  text: string,
  cursor: number,
): { start: number; query: string } | null {
  const before = text.slice(0, cursor);
  const at = before.lastIndexOf('@');
  if (at === -1 || (at > 0 && !/\s/.test(before.charAt(at - 1)))) {
    return null;
  }
  const query = before.slice(at + 1);
  // A mention is at most a few words; a line break or a long run means the @ was something else.
  if (query.length > 40 || /[\n@]/.test(query)) {
    return null;
  }
  return { start: at, query };
}
