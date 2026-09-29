import { ArrowRightIcon, FloppyDiskIcon, TrashIcon } from '@phosphor-icons/react';
import { Button } from '../../../components/ui/Button';
import { ButtonLink } from '../../../components/ui/ButtonLink';
import { DsGroup, DsSection } from '../DsSection';
import type { DesignSystemCopy } from '../use-copy';
import styles from '../DesignSystemPage.module.css';

export function ButtonSection({ copy }: { copy: DesignSystemCopy }) {
  const text = copy.buttons;

  return (
    <DsSection id="buttons" title={copy.sections.buttons}>
      <div className={styles.row}>
        <Button iconEnd={<ArrowRightIcon className="mirror-in-rtl" aria-hidden="true" />}>
          {text.primary}
        </Button>
        <Button variant="secondary" iconStart={<FloppyDiskIcon aria-hidden="true" />}>
          {text.secondary}
        </Button>
        <Button variant="ghost">{text.ghost}</Button>
        <Button variant="danger" iconStart={<TrashIcon aria-hidden="true" />}>
          {text.danger}
        </Button>
      </div>

      <DsGroup title={text.sizes}>
        <div className={styles.row}>
          <Button size="sm">{text.primary}</Button>
          <Button size="md">{text.primary}</Button>
          <Button size="lg">{text.primary}</Button>
        </div>
      </DsGroup>

      <DsGroup title={text.states}>
        <div className={styles.row}>
          <Button loading>{text.loading}</Button>
          <Button variant="secondary" loading>
            {text.loading}
          </Button>
          <Button disabled>{text.disabled}</Button>
          <ButtonLink to="/design-system#buttons" variant="secondary">
            {text.link}
          </ButtonLink>
        </div>
      </DsGroup>
    </DsSection>
  );
}
