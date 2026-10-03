import type { GroupView } from '@acu/shared';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { Tabs, type TabItem } from '../../components/ui/Tabs';
import { AnnouncementsTab } from '../announcements/AnnouncementsTab';
import { GroupChat } from '../chat/GroupChat';
import { FilesTab } from '../files/FilesTab';
import { ActivityTab } from '../gradebook/ActivityTab';
import { GradebookTab } from '../gradebook/GradebookTab';
import { MyGradesTab } from '../gradebook/MyGradesTab';
import { GroupPeople } from '../people/GroupPeople';
import styles from './Groups.module.css';

interface GroupTabsProps {
  view: GroupView;
  /** Tabs only some people have, such as the doctor's students and settings. */
  extra?: readonly TabItem[];
  /** The tab to open when the address names none. */
  initial?: string;
  /** Unread chat messages, shown on the chat tab. */
  unreadChat?: number;
}

/**
 * Everything a group holds, one tab each: chat, announcements, files and grades, with activity for
 * the staff. The open tab lives in the address, so a reload, a shared link or a notification lands
 * on the right one.
 */
export function GroupTabs({ view, extra = [], initial = 'chat', unreadChat = 0 }: GroupTabsProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useSearchParams();
  const counted = (label: string, count: number) =>
    count > 0 ? `${label} (${String(count)})` : label;

  const tabs: TabItem[] = [
    {
      id: 'chat',
      label: counted(t('groups.tabChat'), unreadChat),
      content: (
        <div className={styles.groupLayout}>
          <GroupChat view={view} />
          <GroupPeople groupId={view.id} />
        </div>
      ),
    },
    {
      id: 'announcements',
      label: counted(t('groups.tabAnnouncements'), view.unreadAnnouncements),
      content: <AnnouncementsTab view={view} />,
    },
    { id: 'files', label: t('groups.tabFiles'), content: <FilesTab view={view} /> },
    {
      id: 'grades',
      label: t('groups.tabGrades'),
      content: view.can.teach ? <GradebookTab view={view} /> : <MyGradesTab view={view} />,
    },
    ...(view.can.teach
      ? [{ id: 'activity', label: t('groups.tabActivity'), content: <ActivityTab view={view} /> }]
      : []),
    ...extra,
  ];
  const wanted = search.get('tab');
  const selected = tabs.some((tab) => tab.id === wanted) ? (wanted ?? initial) : initial;

  return (
    <Tabs
      label={view.name}
      tabs={tabs}
      selectedTabId={selected}
      onSelect={(id) => {
        setSearch({ tab: id }, { replace: true });
      }}
    />
  );
}
