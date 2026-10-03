import {
  chatChangesSchema,
  chatPageSchema,
  groupViewResponseSchema,
  type ChatMessage,
} from '@acu/shared';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { apiRequest } from '../../lib/api';

/** How often an open chat asks for changes while the page is visible. */
export const CHAT_POLL_MS = 5000;

export const groupViewKey = (groupId: string) => ['group', groupId] as const;

/** How often an open group asks whether the chat was opened, closed, or its roles changed. */
const VIEW_REFRESH_MS = 30_000;

export function useGroupView(groupId: string) {
  return useQuery({
    queryKey: groupViewKey(groupId),
    queryFn: async () =>
      (await apiRequest(`/api/groups/${groupId}`, { schema: groupViewResponseSchema })).group,
    // The doctor may open or close the chat, or a schedule may, while the page is up.
    refetchInterval: VIEW_REFRESH_MS,
  });
}

interface ChatState {
  byId: ReadonlyMap<string, ChatMessage>;
  version: number;
  hasOlder: boolean;
  /** The timeline is continuous from this message on; older pinned messages sit outside it. */
  fromSeq: number;
  status: 'loading' | 'ready' | 'failed';
  error: unknown;
}

type ChatEvent =
  | {
      type: 'loaded';
      messages: ChatMessage[];
      pinned: ChatMessage[];
      version: number;
      hasOlder: boolean;
    }
  | { type: 'older'; messages: ChatMessage[]; hasOlder: boolean }
  | { type: 'changes'; messages: ChatMessage[]; version: number }
  | { type: 'failed'; error: unknown };

/** Where a page starts; with nothing older, the timeline starts at the beginning. */
function startOf(messages: readonly ChatMessage[], hasOlder: boolean): number {
  return hasOlder ? (messages[0]?.seq ?? 0) : 0;
}

/** A message only replaces what the chat holds if it is at least as recent. */
function merge(
  byId: ReadonlyMap<string, ChatMessage>,
  messages: readonly ChatMessage[],
): Map<string, ChatMessage> {
  const next = new Map(byId);
  for (const message of messages) {
    const known = next.get(message.id);
    if (!known || known.version <= message.version) {
      next.set(message.id, message);
    }
  }
  return next;
}

export function chatReducer(state: ChatState, event: ChatEvent): ChatState {
  switch (event.type) {
    case 'loaded':
      return {
        byId: merge(state.byId, [...event.messages, ...event.pinned]),
        version: Math.max(state.version, event.version),
        hasOlder: event.hasOlder,
        fromSeq: startOf(event.messages, event.hasOlder),
        status: 'ready',
        error: null,
      };
    case 'older':
      return {
        ...state,
        byId: merge(state.byId, event.messages),
        hasOlder: event.hasOlder,
        fromSeq: startOf(event.messages, event.hasOlder),
      };
    case 'changes':
      return {
        ...state,
        byId: merge(state.byId, event.messages),
        version: Math.max(state.version, event.version),
      };
    case 'failed':
      return {
        ...state,
        status: state.status === 'ready' ? 'ready' : 'failed',
        error: event.error,
      };
  }
}

const initialState: ChatState = {
  byId: new Map(),
  version: 0,
  hasOlder: false,
  fromSeq: 0,
  status: 'loading',
  error: null,
};

/**
 * A group chat kept up to date: the latest page first, then only what changed, asked for every few
 * seconds while the page is visible. Messages this person sends or changes are merged at once.
 */
export function useChat(groupId: string) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  // The poll reads the newest version without restarting its timer at every change.
  const version = useRef(0);
  useEffect(() => {
    version.current = state.version;
  }, [state.version]);

  // Asking again after a failed first load starts it over.
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiRequest(`/api/groups/${groupId}/chat`, { schema: chatPageSchema })
      .then((page) => {
        if (!cancelled) {
          dispatch({
            type: 'loaded',
            messages: page.messages,
            pinned: page.pinned,
            version: page.version,
            hasOlder: page.hasOlder,
          });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          dispatch({ type: 'failed', error });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [groupId, attempt]);

  const ready = state.status === 'ready';
  const pollNow = useCallback(async () => {
    if (document.visibilityState !== 'visible') {
      return;
    }
    try {
      const changes = await apiRequest(
        `/api/groups/${groupId}/chat/changes?since=${String(version.current)}`,
        { schema: chatChangesSchema },
      );
      dispatch({ type: 'changes', messages: changes.messages, version: changes.version });
    } catch (error) {
      // A missed poll is retried at the next tick; the chat stays as it was.
      dispatch({ type: 'failed', error });
    }
  }, [groupId]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    const timer = window.setInterval(() => {
      void pollNow();
    }, CHAT_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void pollNow();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [ready, pollNow]);

  const all = useMemo(() => [...state.byId.values()].sort((a, b) => a.seq - b.seq), [state.byId]);
  const { fromSeq } = state;

  // Read through a ref so a caller walking back several pages always starts from the latest one.
  const from = useRef(0);
  useEffect(() => {
    from.current = fromSeq;
  }, [fromSeq]);

  /** Loads the page before the oldest message shown; answers whether there is more beyond it. */
  const loadOlder = useCallback(async (): Promise<boolean> => {
    if (from.current === 0) {
      return false;
    }
    const page = await apiRequest(`/api/groups/${groupId}/chat?before=${String(from.current)}`, {
      schema: chatPageSchema,
    });
    from.current = page.hasOlder ? (page.messages[0]?.seq ?? 0) : 0;
    dispatch({ type: 'older', messages: page.messages, hasOlder: page.hasOlder });
    return page.hasOlder;
  }, [groupId]);

  const apply = useCallback((message: ChatMessage) => {
    dispatch({ type: 'changes', messages: [message], version: 0 });
  }, []);

  return {
    /** The continuous timeline, oldest first. */
    messages: all.filter((message) => message.seq >= fromSeq),
    /** Newest first, including pinned messages older than the timeline. */
    pinned: all.filter((message) => message.pinned).reverse(),
    reload,
    hasOlder: state.hasOlder,
    status: state.status,
    error: state.error,
    loadOlder,
    apply,
  };
}
