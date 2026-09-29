import type { Skill } from '@acu/shared';
import {
  BookOpenTextIcon,
  HeadphonesIcon,
  MicrophoneIcon,
  PenNibIcon,
  type Icon,
} from '@phosphor-icons/react';

const ICONS: Record<Skill, Icon> = {
  listening: HeadphonesIcon,
  speaking: MicrophoneIcon,
  reading: BookOpenTextIcon,
  writing: PenNibIcon,
};

interface SkillIconProps {
  skill: Skill;
  className?: string;
}

export function SkillIcon({ skill, className }: SkillIconProps) {
  const IconComponent = ICONS[skill];
  return <IconComponent className={className} weight="duotone" aria-hidden="true" />;
}
