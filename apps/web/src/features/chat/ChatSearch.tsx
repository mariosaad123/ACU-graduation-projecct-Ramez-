import {
  CHAT_SEARCH_FILTERS,
  CHAT_SEARCH_MIN_LENGTH,
  chatSearchResponseSchema,
  type ChatMessage,
  type ChatSearchFilter,
} from '@acu/shared';
import { MagnifyingGlassIcon, PaperclipIcon, XIcon } from '@phosphor-icons/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { Spinner } from '../../components/ui/Spinner';
import { useLocale } from '../../i18n/use-locale';
import { apiRequest } from '../../lib/api';
import { describeApiError } from '../auth/api-errors';
import { plainBody } from './mentions';
import styles from './Chat.module.css';

function useChatSearch(groupId: string, text: string, filter: ChatSearchFilter) {
  const ready = text.length >= CHAT_SEARCH_MIN_LENGTH || filter !== 'all';
  return useInfiniteQuery({
    queryKey: ['group', groupId, 'chat-search', text, filter],
    enabled: ready,
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ filter });
      if (text.length >= CHAT_SEARCH_MIN_LENGTH) {
        params.set('q', text);
      }
      if (pageParam !== null) {
        params.set('before', String(pageParam));
      }
      return apiRequest(`/api/groups/${groupId}/chat/search?${params.toString()}`, {
        schema: chatSearchResponseSchema,
      });
    },
    getNextPageParam: (last) => (last.hasMore ? (last.messages.at(-1)?.seq ?? null) : null),
  });
}

/** The text with every place the searched words appear marked. */
function highlight(text: string, term: string): ReactNode[] {
  if (term.length < CHAT_SEARCH_MIN_LENGTH) {
    return [text];
  }
  const lower = text.toLowerCase();
  const needle = term.toLowerCase();
  const nodes: ReactNode[] = [];
  let from = 0;
  for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, from)) {
    nodes.push(text.slice(from, at), <mark key={at}>{text.slice(at, at + needle.length)}</mark>);
    from = at + needle.length;
  }
  nodes.push(text.slice(from));
  return nodes;
}

interface ChatSearchProps {
  groupId: string;
  onOpen: (message: ChatMessage) => void;
  onClose: () => void;
}

/**
 * Search over a group's whole chat, laid over the messages: words, or one of the filters alone
 * (from the staff, pinned, mentioning the reader, with a file). A result leads to its message.
 */
export function ChatSearch({ groupId, onOpen, onClose }: ChatSearchProps) {
  const { t } = useTranslation();
  const { intlLocale } = useLocale();
  const [text, setText] = useState('');
  const [filter, setFilter] = useState<ChatSearchFilter>('all');
  const term = useDeferredValue(text.trim());
  const search = useChatSearch(groupId, term, filter);
  const results = search.data?.pages.flatMap((page) => page.messages) ?? [];
  const asked = term.length >= CHAT_SEARCH_MIN_LENGTH || filter !== 'all';
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(intlLocale, { dateStyle: 'medium', timeStyle: 'short' }),
    [intlLocale],
  );

  // Escape closes the search wherever the focus happens to be, unless a dialog is on top of it.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <div className={styles.search} role="search">
      <div className={styles.searchBar}>
        <MagnifyingGlassIcon className={styles.searchIcon} aria-hidden="true" />
        <input
          className={styles.searchInput}
          type="search"
          dir="auto"
          autoFocus
          value={text}
          placeholder={t('chatSearch.placeholder')}
          aria-label={t('chatSearch.placeholder')}
          onChange={(event) => {
            setText(event.target.value);
          }}
        />
        <IconButton size="sm" label={t('chatSearch.close')} icon={<XIcon />} onClick={onClose} />
      </div>
      <div className={styles.searchFilters} role="group" aria-label={t('chatSearch.filters')}>
        {CHAT_SEARCH_FILTERS.map((entry) => (
          <button
            key={entry}
            type="button"
            className={styles.searchFilter}
            aria-pressed={filter === entry}
            onClick={() => {
              setFilter(entry);
            }}
          >
            {t(`chatSearch.filter.${entry}`)}
          </button>
        ))}
      </div>

      <div className={styles.searchResults} aria-live="polite">
        {!asked && <p className={styles.searchHint}>{t('chatSearch.hint')}</p>}
        {asked && search.isPending && <Spinner size="1.75rem" className={styles.loading} />}
        {search.isError && (
          <Alert tone="danger" live>
            {describeApiError(t, search.error)}{' '}
            <button
              type="button"
              className={styles.inlineAction}
              onClick={() => {
                void search.refetch();
              }}
            >
              {t('common.retry')}
            </button>
          </Alert>
        )}
        {asked && search.isSuccess && results.length === 0 && (
          <p className={styles.searchHint}>{t('chatSearch.none')}</p>
        )}
        <ul className={styles.searchList}>
          {results.map((message) => {
            const body = message.body
              ? plainBody(message.body, message.mentions, t('chat.everyone'))
              : (message.poll?.question ?? '');
            return (
              <li key={message.id}>
                <button
                  type="button"
                  className={styles.searchResult}
                  onClick={() => {
                    onOpen(message);
                  }}
                >
                  <span className={styles.searchMeta}>
                    <span className={styles.quoteAuthor}>{message.author.name}</span>
                    <time dateTime={message.createdAt}>
                      {dateFormat.format(new Date(message.createdAt))}
                    </time>
                  </span>
                  {body && (
                    <span className={styles.searchText} dir="auto">
                      {highlight(body, term)}
                    </span>
                  )}
                  {message.attachment && (
                    <span className={styles.searchFile}>
                      <PaperclipIcon aria-hidden="true" />
                      <span dir="auto">
                        {highlight(
                          message.attachment.name ?? t(`files.kinds.${message.attachment.kind}`),
                          term,
                        )}
                      </span>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        {search.hasNextPage && (
          <Button
            variant="ghost"
            size="sm"
            loading={search.isFetchingNextPage}
            onClick={() => {
              void search.fetchNextPage();
            }}
          >
            {t('chatSearch.more')}
          </Button>
        )}
      </div>
    </div>
  );
}
