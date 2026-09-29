import { SKILLS } from '@acu/shared';
import { useTranslation } from 'react-i18next';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Spinner } from '../../../components/ui/Spinner';
import { useToast } from '../../../components/ui/toast/toast-context';
import { DsGroup, DsSection } from '../DsSection';
import { fill, type DesignSystemCopy } from '../use-copy';
import styles from '../DesignSystemPage.module.css';

const SKILL_PROGRESS = { listening: 72, speaking: 35, reading: 90, writing: 18 } as const;

export function FeedbackSection({ copy }: { copy: DesignSystemCopy }) {
  const { t } = useTranslation();
  const showToast = useToast();
  const text = copy.feedback;

  return (
    <DsSection id="feedback" title={copy.sections.feedback}>
      <DsGroup title={text.alerts}>
        <div className={styles.stack}>
          <Alert tone="info">{text.info}</Alert>
          <Alert tone="success">{text.success}</Alert>
          <Alert tone="warning">{text.warning}</Alert>
          <Alert tone="danger">{text.danger}</Alert>
        </div>
      </DsGroup>

      <DsGroup title={text.toasts}>
        <div className={styles.row}>
          <Button
            variant="secondary"
            onClick={() => {
              showToast({ title: text.toastTitle, description: text.toastBody, tone: 'success' });
            }}
          >
            {text.showToast}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              showToast({ title: text.errorToastTitle, description: text.danger, tone: 'danger' });
            }}
          >
            {text.showErrorToast}
          </Button>
        </div>
      </DsGroup>

      <DsGroup title={text.progress}>
        <div className={styles.stack}>
          {SKILLS.map((skill) => (
            <ProgressBar
              key={skill}
              label={t(`skills.${skill}`)}
              value={SKILL_PROGRESS[skill]}
              skill={skill}
            />
          ))}
          <ProgressBar
            label={copy.display.cardTitle}
            value={3}
            max={10}
            valueText={fill(text.progressOf, { value: 3, max: 10 })}
          />
        </div>
      </DsGroup>

      <DsGroup title={text.loading}>
        <div className={styles.row}>
          <Card className={styles.skeletonCard} aria-busy="true">
            <Skeleton inlineSize="40%" blockSize="1.25rem" />
            <Skeleton />
            <Skeleton inlineSize="85%" />
            <Skeleton shape="block" blockSize="4rem" />
          </Card>
          <Spinner size="2.5rem" />
        </div>
      </DsGroup>
    </DsSection>
  );
}
