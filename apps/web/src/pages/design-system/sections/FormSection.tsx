import { LANGUAGES, LEARNING_LANGUAGES } from '@acu/shared';
import { useState } from 'react';
import { Checkbox } from '../../../components/ui/Checkbox';
import { RadioGroup } from '../../../components/ui/RadioGroup';
import { Select } from '../../../components/ui/Select';
import { TextArea } from '../../../components/ui/TextArea';
import { TextField } from '../../../components/ui/TextField';
import { DsSection } from '../DsSection';
import type { DesignSystemCopy } from '../use-copy';
import styles from '../DesignSystemPage.module.css';

type Goal = 'study' | 'work' | 'travel';

export function FormSection({ copy }: { copy: DesignSystemCopy }) {
  const text = copy.forms;
  const [goal, setGoal] = useState<Goal | null>('study');

  return (
    <DsSection id="forms" title={copy.sections.forms}>
      <form
        className={styles.formGrid}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <TextField label={text.name} hint={text.nameHint} autoComplete="name" />
        <TextField
          label={text.email}
          type="email"
          dir="ltr"
          defaultValue="student@gmail.com"
          error={text.emailError}
        />
        <Select
          label={text.language}
          placeholder={text.choose}
          defaultValue=""
          options={LEARNING_LANGUAGES.map((code) => ({
            value: code,
            label: LANGUAGES[code].nativeName,
            lang: code,
          }))}
        />
        <TextField label={text.disabled} value="ACU-2026-0142" dir="ltr" disabled readOnly />
        <TextArea label={text.bio} optional className={styles.fullRow} />
        <div className={styles.stack}>
          <Checkbox label={text.terms} defaultChecked />
          <Checkbox label={text.reminders} hint={text.remindersHint} />
        </div>
        <RadioGroup<Goal>
          legend={text.goal}
          name="ds-goal"
          value={goal}
          onChange={setGoal}
          options={[
            { value: 'study', label: text.goals.study },
            { value: 'work', label: text.goals.work, hint: text.goalsHint.work },
            { value: 'travel', label: text.goals.travel },
          ]}
        />
      </form>
    </DsSection>
  );
}
