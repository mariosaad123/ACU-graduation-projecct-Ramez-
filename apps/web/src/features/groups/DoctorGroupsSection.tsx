import { formatJoinCode, type Group, type LearningLanguage } from '@acu/shared';
import { ArrowRightIcon, MicrosoftExcelLogoIcon, PlusIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { Alert } from '../../components/ui/Alert';
import { LoadError } from '../../components/ui/LoadError';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ButtonLink } from '../../components/ui/ButtonLink';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { useLanguageName } from '../../i18n/use-language-name';
import { ExportDialog } from '../gradebook/ExportDialog';
import { useDoctorGroups } from './api';
import { CopyButton } from './CopyButton';
import { CreateGroupDialog } from './CreateGroupDialog';
import { GroupPhoto } from './GroupPhoto';
import styles from './Groups.module.css';

function GroupCard({ group }: { group: Group }) {
  const { t } = useTranslation();
  const languageName = useLanguageName();

  return (
    <Card className={styles.groupCard} data-archived={group.archived}>
      <div className={styles.groupHead}>
        <GroupPhoto photoUrl={group.photoUrl} language={group.language} active={!group.archived} />
        <div className={styles.groupTitle}>
          <h3 className={styles.groupName}>{group.name}</h3>
          <p className={styles.muted}>{languageName(group.language)}</p>
        </div>
      </div>

      {(group.archived || !group.joinOpen || group.requiresApproval) && (
        <div className={styles.badges}>
          {group.archived && <Badge>{t('groups.archived')}</Badge>}
          {!group.archived && !group.joinOpen && <Badge tone="warning">{t('groups.closed')}</Badge>}
          {!group.archived && group.requiresApproval && (
            <Badge tone="info">{t('groups.approval')}</Badge>
          )}
        </div>
      )}

      <p className={styles.stats}>
        <span>{t('groups.students', { count: group.counts.active })}</span>
        {group.unread > 0 && (
          <Badge tone="emblem">{t('groups.unread', { count: group.unread })}</Badge>
        )}
        {group.counts.pending > 0 && (
          <span className={styles.pendingStat}>
            {t('groups.requests', { count: group.counts.pending })}
          </span>
        )}
      </p>

      {!group.archived && (
        <div className={styles.codeRow}>
          <span className={styles.muted}>{t('groups.code')}</span>
          <code className={styles.code} dir="ltr">
            {formatJoinCode(group.joinCode)}
          </code>
          <CopyButton text={formatJoinCode(group.joinCode)} label={t('groups.copyCode')} />
        </div>
      )}

      <ButtonLink
        to={`/app/groups/${group.id}`}
        variant="secondary"
        aria-label={t('groups.manageLabel', { name: group.name })}
        iconEnd={<ArrowRightIcon className="mirror-in-rtl" aria-hidden="true" />}
      >
        {t('groups.manage')}
      </ButtonLink>
    </Card>
  );
}

/** A doctor's groups on their dashboard: create one, share codes, open one to manage it. */
export function DoctorGroupsSection({ languages }: { languages: LearningLanguage[] }) {
  const { t } = useTranslation();
  const groups = useDoctorGroups();
  const [searchParams, setSearchParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState(false);

  // The home page's "Create a group in French" lands here with ?newGroup=fr, which opens the
  // dialog on that language until it is closed.
  const requested = languages.find((candidate) => candidate === searchParams.get('newGroup'));

  const closeDialog = () => {
    setCreating(false);
    if (searchParams.has('newGroup')) {
      setSearchParams(
        (params) => {
          params.delete('newGroup');
          return params;
        },
        { replace: true },
      );
    }
  };

  const active = groups.data?.filter((group) => !group.archived) ?? [];
  const archived = groups.data?.filter((group) => group.archived) ?? [];
  const canCreate = languages.length > 0;

  return (
    <section className={styles.section} aria-labelledby="doctor-groups" id="groups">
      <div className={styles.sectionHead}>
        <div>
          <h2 id="doctor-groups" className={styles.sectionTitle}>
            {t('groups.title')}
          </h2>
          <p className={styles.muted}>{t('groups.lead')}</p>
        </div>
        <div className={styles.shareActions}>
          {(groups.data?.length ?? 0) > 0 && (
            <Button
              variant="secondary"
              iconStart={<MicrosoftExcelLogoIcon aria-hidden="true" />}
              onClick={() => {
                setExporting(true);
              }}
            >
              {t('export.all')}
            </Button>
          )}
          {canCreate && (
            <Button
              iconStart={<PlusIcon aria-hidden="true" />}
              onClick={() => {
                setCreating(true);
              }}
            >
              {t('groups.create')}
            </Button>
          )}
        </div>
      </div>

      {!canCreate && <Alert tone="info">{t('groups.noTeachingLanguages')}</Alert>}

      {groups.isPending && (
        <div className={styles.groupGrid} aria-busy="true">
          <Skeleton shape="block" blockSize="14rem" />
          <Skeleton shape="block" blockSize="14rem" />
        </div>
      )}

      {groups.isError && (
        <LoadError
          error={groups.error}
          retrying={groups.isFetching}
          onRetry={() => {
            void groups.refetch();
          }}
        />
      )}

      {groups.isSuccess && active.length === 0 && archived.length === 0 && (
        <Card className={styles.empty}>
          <h3 className={styles.cardTitle}>{t('groups.emptyTitle')}</h3>
          <ol className={styles.steps}>
            <li>{t('groups.emptyOne')}</li>
            <li>{t('groups.emptyTwo')}</li>
            <li>{t('groups.emptyThree')}</li>
          </ol>
        </Card>
      )}

      {active.length > 0 && (
        <div className={styles.groupGrid}>
          {active.map((group) => (
            <GroupCard key={group.id} group={group} />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <details className={styles.archive}>
          <summary>{t('groups.archivedTitle', { count: archived.length })}</summary>
          <div className={styles.groupGrid}>
            {archived.map((group) => (
              <GroupCard key={group.id} group={group} />
            ))}
          </div>
        </details>
      )}

      {exporting && (
        <ExportDialog
          groupId={null}
          onClose={() => {
            setExporting(false);
          }}
        />
      )}

      <CreateGroupDialog
        open={creating || requested !== undefined}
        languages={languages}
        initialLanguage={requested}
        onClose={closeDialog}
      />
    </section>
  );
}
