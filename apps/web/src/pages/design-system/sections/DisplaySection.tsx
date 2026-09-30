import { CEFR_LEVELS, SKILLS } from '@acu/shared';
import { CertificateIcon } from '@phosphor-icons/react';
import { Badge, type BadgeTone } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { LevelBadge } from '../../../components/ui/LevelBadge';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { SkillTag } from '../../../components/ui/SkillTag';
import { DsGroup, DsSection } from '../DsSection';
import { fill, type DesignSystemCopy } from '../use-copy';
import styles from '../DesignSystemPage.module.css';

const BADGE_TONES: readonly BadgeTone[] = [
  'neutral',
  'info',
  'success',
  'warning',
  'danger',
  'achievement',
  'emblem',
];

const CARD_PROGRESS = { listening: 4, speaking: 1, reading: 6, writing: 2 } as const;

export function DisplaySection({ copy }: { copy: DesignSystemCopy }) {
  const text = copy.display;

  return (
    <DsSection id="display" title={copy.sections.display}>
      <DsGroup title={text.badges}>
        <div className={styles.row}>
          {BADGE_TONES.map((tone) => (
            <Badge
              key={tone}
              tone={tone}
              icon={tone === 'achievement' ? <CertificateIcon aria-hidden="true" /> : undefined}
            >
              {text.badge[tone]}
            </Badge>
          ))}
        </div>
      </DsGroup>

      <DsGroup title={text.levels}>
        <div className={styles.row}>
          {CEFR_LEVELS.map((level) => (
            <LevelBadge key={level} level={level} label={fill(text.level, { level })} />
          ))}
        </div>
      </DsGroup>

      <DsGroup title={text.skills}>
        <div className={styles.row}>
          {SKILLS.map((skill) => (
            <SkillTag key={skill} skill={skill} />
          ))}
        </div>
      </DsGroup>

      <DsGroup title={text.cards}>
        <div className={styles.cardGrid}>
          {SKILLS.map((skill) => (
            <Card key={skill} skill={skill} className={styles.demoCard}>
              <SkillTag skill={skill} />
              <p className={styles.cardTitle}>{text.cardTitle}</p>
              <p className={styles.note}>{text.cardBody}</p>
              <ProgressBar
                label={text.cardTitle}
                value={CARD_PROGRESS[skill]}
                max={6}
                valueText={fill(copy.feedback.progressOf, { value: CARD_PROGRESS[skill], max: 6 })}
                skill={skill}
                showLabel={false}
              />
            </Card>
          ))}
        </div>
      </DsGroup>
    </DsSection>
  );
}
