import { groupCreateSchema, type LearningLanguage } from '@acu/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Dialog } from '../../components/ui/Dialog';
import { Select } from '../../components/ui/Select';
import { TextArea } from '../../components/ui/TextArea';
import { TextField } from '../../components/ui/TextField';
import { useToast } from '../../components/ui/toast/toast-context';
import { useLanguageName } from '../../i18n/use-language-name';
import { describeApiError } from '../auth/api-errors';
import { useCreateGroup } from './api';
import styles from './Groups.module.css';

type Field = 'name' | 'description' | 'language';

interface CreateGroupDialogProps {
  open: boolean;
  onClose: () => void;
  /** The languages the doctor teaches; the group must be in one of them. */
  languages: LearningLanguage[];
  initialLanguage?: LearningLanguage;
}

function fieldProblems(issues: readonly { path: PropertyKey[] }[]): Set<Field> {
  const fields = new Set<Field>();
  for (const issue of issues) {
    const field = String(issue.path[0]);
    if (field === 'name' || field === 'description' || field === 'language') {
      fields.add(field);
    }
  }
  return fields;
}

/** Creates a group, then opens it so the doctor can share its code straight away. */
export function CreateGroupDialog({
  open,
  onClose,
  languages,
  initialLanguage,
}: CreateGroupDialogProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const languageName = useLanguageName();
  const create = useCreateGroup();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState<LearningLanguage | ''>('');
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [problems, setProblems] = useState<Set<Field>>(new Set());

  // One language taught needs no choice; a language chosen elsewhere (the home page) comes first.
  const chosen: LearningLanguage | '' =
    language ||
    (initialLanguage && languages.includes(initialLanguage) ? initialLanguage : '') ||
    (languages.length === 1 ? (languages[0] ?? '') : '');

  const clearProblem = (field: Field) => {
    setProblems((current) => {
      const next = new Set(current);
      next.delete(field);
      return next;
    });
  };

  const close = () => {
    setName('');
    setDescription('');
    setLanguage('');
    setRequiresApproval(false);
    setProblems(new Set());
    create.reset();
    onClose();
  };

  const submit = () => {
    const parsed = groupCreateSchema.safeParse({
      name,
      description,
      language: chosen,
      requiresApproval,
    });
    if (!parsed.success) {
      setProblems(fieldProblems(parsed.error.issues));
      return;
    }
    create.mutate(parsed.data, {
      onSuccess: (group) => {
        toast({ tone: 'success', title: t('groups.created') });
        close();
        void navigate(`/app/groups/${group.id}`);
      },
    });
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={t('groups.createTitle')}
      dismissOnBackdrop={!create.isPending}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={create.isPending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={create.isPending}>
            {t('groups.createSubmit')}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <TextField
          label={t('groups.name')}
          hint={t('groups.nameHint')}
          error={problems.has('name') ? t('groups.nameError') : undefined}
          value={name}
          maxLength={80}
          onChange={(event) => {
            setName(event.target.value);
            clearProblem('name');
          }}
        />
        <Select
          label={t('groups.language')}
          hint={t('groups.languageHint')}
          error={problems.has('language') ? t('groups.languageError') : undefined}
          value={chosen}
          placeholder="—"
          options={languages.map((code) => ({ value: code, label: languageName(code) }))}
          onChange={(event) => {
            setLanguage(event.target.value as LearningLanguage);
            clearProblem('language');
          }}
        />
        <TextArea
          label={t('groups.description')}
          hint={t('groups.descriptionHint')}
          error={problems.has('description') ? t('groups.descriptionError') : undefined}
          optional
          rows={3}
          maxLength={300}
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
            clearProblem('description');
          }}
        />
        <Checkbox
          label={t('groups.requiresApproval')}
          hint={t('groups.requiresApprovalHint')}
          checked={requiresApproval}
          onChange={(event) => {
            setRequiresApproval(event.target.checked);
          }}
        />
        {create.isError && (
          <Alert tone="danger" live>
            {describeApiError(t, create.error)}
          </Alert>
        )}
      </div>
    </Dialog>
  );
}
