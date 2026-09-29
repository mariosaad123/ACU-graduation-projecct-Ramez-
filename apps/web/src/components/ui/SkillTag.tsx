import type { Skill } from '@acu/shared';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { SkillIcon } from './SkillIcon';
import styles from './SkillTag.module.css';

interface SkillTagProps {
  skill: Skill;
  className?: string;
}

export function SkillTag({ skill, className }: SkillTagProps) {
  const { t } = useTranslation();

  return (
    <span className={clsx(styles.skillTag, className)} data-skill={skill}>
      <SkillIcon skill={skill} />
      {t(`skills.${skill}`)}
    </span>
  );
}
