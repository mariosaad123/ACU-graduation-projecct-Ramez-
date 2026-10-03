import type { UserRole } from '@acu/shared';
import {
  ArrowRightIcon,
  ChatCircleDotsIcon,
  CheckCircleIcon,
  ClipboardTextIcon,
  HourglassIcon,
  MegaphoneIcon,
  PencilLineIcon,
  UserPlusIcon,
  type Icon,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Card } from '../../components/ui/Card';
import { LoadError } from '../../components/ui/LoadError';
import { Skeleton } from '../../components/ui/Skeleton';
import { useAgenda } from '../coursework/api';
import { useDue } from '../coursework/use-due';
import { useAssistedGroups, useDoctorGroups, useStudentGroups } from '../groups/api';
import styles from './DashboardPage.module.css';

interface Item {
  key: string;
  icon: Icon;
  /** Urgent things come first and are marked. */
  tone: 'urgent' | 'normal' | 'waiting';
  title: string;
  detail: string;
  /** Nothing to open for something that only waits on someone else. */
  to?: string;
}

const ORDER = { urgent: 0, normal: 1, waiting: 2 };

/**
 * The first thing on the dashboard: what is waiting for this person across all their groups, each
 * line leading straight to where it is dealt with. When nothing waits, it says so.
 */
export function AttentionCard({ role }: { role: UserRole }) {
  const { t } = useTranslation();
  const due = useDue();
  const student = role === 'student';
  const agenda = useAgenda();
  const studentGroups = useStudentGroups(student);
  const ownGroups = useDoctorGroups(!student);
  const assisted = useAssistedGroups(!student);
  const sources = student ? [agenda, studentGroups] : [agenda, ownGroups, assisted];

  const items: Item[] = [];
  for (const work of agenda.data?.toHandIn ?? []) {
    const deadline = work.dueAt ? due(work.dueAt) : null;
    items.push({
      key: `hand-in-${work.assignmentId}`,
      icon: PencilLineIcon,
      tone: work.overdue || deadline?.soon ? 'urgent' : 'normal',
      title: t('attention.handIn', { title: work.title }),
      detail: deadline
        ? `${work.groupName} · ${work.overdue ? t('attention.overdue') : deadline.relative}`
        : work.groupName,
      to: `/app/groups/${work.groupId}?tab=assignments&assignment=${work.assignmentId}`,
    });
  }
  for (const work of agenda.data?.toGrade ?? []) {
    items.push({
      key: `grade-${work.assignmentId}`,
      icon: ClipboardTextIcon,
      tone: 'normal',
      title: t('attention.toGrade', { count: work.waiting }),
      detail: `${work.title} · ${work.groupName}`,
      to: `/app/groups/${work.groupId}?tab=assignments&review=${work.assignmentId}`,
    });
  }
  for (const group of studentGroups.data ?? []) {
    if (group.status === 'pending') {
      items.push({
        key: `pending-${group.id}`,
        icon: HourglassIcon,
        tone: 'waiting',
        title: t('attention.awaitingApproval'),
        detail: group.name,
      });
      continue;
    }
    if (group.unreadAnnouncements > 0) {
      items.push({
        key: `announcements-${group.id}`,
        icon: MegaphoneIcon,
        tone: 'normal',
        title: t('attention.announcements', { count: group.unreadAnnouncements }),
        detail: group.name,
        to: `/app/groups/${group.id}?tab=announcements`,
      });
    }
    if (group.unread > 0) {
      items.push({
        key: `chat-${group.id}`,
        icon: ChatCircleDotsIcon,
        tone: 'normal',
        title: t('attention.messages', { count: group.unread }),
        detail: group.name,
        to: `/app/groups/${group.id}?tab=chat`,
      });
    }
  }
  for (const group of ownGroups.data ?? []) {
    if (group.archived) {
      continue;
    }
    if (group.counts.pending > 0) {
      items.push({
        key: `requests-${group.id}`,
        icon: UserPlusIcon,
        tone: 'urgent',
        title: t('attention.requests', { count: group.counts.pending }),
        detail: group.name,
        to: `/app/groups/${group.id}?tab=students`,
      });
    }
    if (group.unread > 0) {
      items.push({
        key: `chat-${group.id}`,
        icon: ChatCircleDotsIcon,
        tone: 'normal',
        title: t('attention.messages', { count: group.unread }),
        detail: group.name,
        to: `/app/groups/${group.id}?tab=chat`,
      });
    }
  }
  for (const group of assisted.data ?? []) {
    if (!group.archived && group.unread > 0) {
      items.push({
        key: `chat-${group.id}`,
        icon: ChatCircleDotsIcon,
        tone: 'normal',
        title: t('attention.messages', { count: group.unread }),
        detail: group.name,
        to: `/app/groups/${group.id}?tab=chat`,
      });
    }
  }
  items.sort((a, b) => ORDER[a.tone] - ORDER[b.tone]);

  const failed = sources.find((source) => source.isError);
  // A disabled query stays "pending" for ever: only those actually asked for are waited on.
  const loading = sources.some((source) => source.isLoading);

  return (
    <Card className={styles.attention} role="region" aria-labelledby="attention-title">
      <h2 id="attention-title" className={styles.cardTitle}>
        {t('attention.title')}
      </h2>
      {failed ? (
        <LoadError
          error={failed.error}
          retrying={failed.isFetching}
          onRetry={() => {
            for (const source of sources) {
              if (source.isError) {
                void source.refetch();
              }
            }
          }}
        />
      ) : loading ? (
        <Skeleton shape="block" blockSize="6rem" />
      ) : items.length === 0 ? (
        <p className={styles.allClear}>
          <CheckCircleIcon weight="duotone" aria-hidden="true" />
          {t('attention.none')}
        </p>
      ) : (
        <ul className={styles.attentionList}>
          {items.map((item) => {
            const body = (
              <>
                <span className={styles.attentionIcon} aria-hidden="true">
                  <item.icon weight="duotone" />
                </span>
                <span className={styles.attentionText}>
                  <span className={styles.attentionTitle} dir="auto">
                    {item.title}
                  </span>
                  <span className={styles.attentionDetail} dir="auto">
                    {item.detail}
                  </span>
                </span>
                {item.to && (
                  <ArrowRightIcon
                    className={`mirror-in-rtl ${styles.attentionArrow ?? ''}`}
                    aria-hidden="true"
                  />
                )}
              </>
            );
            return (
              <li key={item.key} data-tone={item.tone}>
                {item.to ? (
                  <Link to={item.to} className={styles.attentionItem}>
                    {body}
                  </Link>
                ) : (
                  <span className={styles.attentionItem}>{body}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
