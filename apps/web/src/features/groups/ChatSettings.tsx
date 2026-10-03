import { SCHEDULE_MAX_SLOTS, chatScheduleSchema, type Group, type ScheduleSlot } from '@acu/shared';
import { PlusIcon, TrashIcon } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { RadioGroup } from '../../components/ui/RadioGroup';
import { useToast } from '../../components/ui/toast/toast-context';
import { useLocale } from '../../i18n/use-locale';
import { describeApiError } from '../auth/api-errors';
import { useUpdateGroup } from './api';
import styles from './Groups.module.css';

type Mode = 'open' | 'closed' | 'scheduled';

/** The week as it is read in Egypt: Saturday first. Day 0 is Sunday, as in the schedule. */
const WEEK = [6, 0, 1, 2, 3, 4, 5];

function modeOf(group: Group): Mode {
  return group.chatSchedule ? 'scheduled' : group.chatOpen ? 'open' : 'closed';
}

/**
 * When students may write in the chat: always, never (announcements only), or inside weekly
 * windows. With windows set, the doctor can still open or close the chat by hand from the chat
 * itself; that choice holds until the next window starts or ends.
 */
export function ChatSettings({ group }: { group: Group }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { intlLocale } = useLocale();
  const update = useUpdateGroup(group.id);
  const [mode, setMode] = useState<Mode>(modeOf(group));
  const [slots, setSlots] = useState<ScheduleSlot[]>(
    group.chatSchedule?.slots ?? [{ day: 0, start: '10:00', end: '12:00' }],
  );
  const [invalid, setInvalid] = useState(false);

  const dayNames = useMemo(() => {
    const format = new Intl.DateTimeFormat(intlLocale, { weekday: 'long', timeZone: 'UTC' });
    // 4 January 1970 was a Sunday.
    return (day: number) => format.format(new Date(Date.UTC(1970, 0, 4 + day)));
  }, [intlLocale]);

  const saved = modeOf(group);
  const changed =
    mode !== saved ||
    (mode === 'scheduled' && JSON.stringify(slots) !== JSON.stringify(group.chatSchedule?.slots));

  const save = () => {
    let body: Parameters<typeof update.mutate>[0];
    if (mode === 'scheduled') {
      const parsed = chatScheduleSchema.safeParse({ slots });
      if (!parsed.success) {
        setInvalid(true);
        return;
      }
      body = { chatSchedule: parsed.data };
    } else {
      body = { chatSchedule: null, chatOpen: mode === 'open' };
    }
    update.mutate(body, {
      onSuccess: () => {
        toast({ tone: 'success', title: t('groups.saved') });
      },
      onError: (error) => {
        toast({ tone: 'danger', title: describeApiError(t, error) });
      },
    });
  };

  const setSlot = (index: number, change: Partial<ScheduleSlot>) => {
    setSlots((current) =>
      current.map((slot, position) => (position === index ? { ...slot, ...change } : slot)),
    );
    setInvalid(false);
  };

  return (
    <div className={styles.chatSettings}>
      <RadioGroup
        legend={t('chatSettings.legend')}
        name={`chat-mode-${group.id}`}
        value={mode}
        options={[
          { value: 'open', label: t('chatSettings.open'), hint: t('chatSettings.openHint') },
          { value: 'closed', label: t('chatSettings.closed'), hint: t('chatSettings.closedHint') },
          {
            value: 'scheduled',
            label: t('chatSettings.scheduled'),
            hint: t('chatSettings.scheduledHint'),
          },
        ]}
        onChange={(value) => {
          setMode(value);
          setInvalid(false);
        }}
      />

      {mode === 'scheduled' && (
        <fieldset className={styles.slots}>
          <legend className={styles.slotsLegend}>{t('chatSettings.windows')}</legend>
          <p className={styles.muted}>{t('chatSettings.windowsHint')}</p>
          <ul className={styles.slotList}>
            {slots.map((slot, index) => (
              // Rows keep their place while edited: the index is their identity.
              <li key={index} className={styles.slot}>
                <label className={styles.slotField}>
                  <span>{t('chatSettings.day')}</span>
                  <select
                    className={styles.slotControl}
                    value={slot.day}
                    onChange={(event) => {
                      setSlot(index, { day: Number(event.target.value) });
                    }}
                  >
                    {WEEK.map((day) => (
                      <option key={day} value={day}>
                        {dayNames(day)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.slotField}>
                  <span>{t('chatSettings.from')}</span>
                  <input
                    type="time"
                    className={styles.slotControl}
                    value={slot.start}
                    onChange={(event) => {
                      setSlot(index, { start: event.target.value });
                    }}
                  />
                </label>
                <label className={styles.slotField}>
                  <span>{t('chatSettings.to')}</span>
                  <input
                    type="time"
                    className={styles.slotControl}
                    value={slot.end}
                    onChange={(event) => {
                      setSlot(index, { end: event.target.value });
                    }}
                  />
                </label>
                {slots.length > 1 && (
                  <IconButton
                    size="sm"
                    label={t('chatSettings.removeWindow', { number: index + 1 })}
                    icon={<TrashIcon />}
                    onClick={() => {
                      setSlots((current) => current.filter((_, position) => position !== index));
                      setInvalid(false);
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
          {invalid && (
            <p className={styles.slotError} role="alert">
              {t('chatSettings.invalid')}
            </p>
          )}
          {slots.length < SCHEDULE_MAX_SLOTS && (
            <Button
              variant="ghost"
              size="sm"
              iconStart={<PlusIcon aria-hidden="true" />}
              onClick={() => {
                const last = slots.at(-1);
                setSlots((current) => [
                  ...current,
                  {
                    day: ((last?.day ?? 6) + 1) % 7,
                    start: last?.start ?? '10:00',
                    end: last?.end ?? '12:00',
                  },
                ]);
              }}
            >
              {t('chatSettings.addWindow')}
            </Button>
          )}
        </fieldset>
      )}

      <div className={styles.settingsActions}>
        <Button loading={update.isPending} disabled={!changed} onClick={save}>
          {t('chatSettings.save')}
        </Button>
        {mode === 'scheduled' && (
          <span className={styles.muted}>{t('chatSettings.manualHint')}</span>
        )}
      </div>
    </div>
  );
}
