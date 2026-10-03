import { EmojiPicker } from 'frimousse';
import { useTranslation } from 'react-i18next';
import { Spinner } from '../../components/ui/Spinner';
import styles from './Reactions.module.css';

/** Where the emoji list is served from; see the emoji-data plugin in vite.config.ts. */
const EMOJI_DATA_URL = '/emoji';

/** The data names its groups in English; the reader sees them in their own language. */
const CATEGORY_KEYS: Record<string, string> = {
  'Smileys & emotion': 'smileys',
  'People & body': 'people',
  'Animals & nature': 'animals',
  'Food & drink': 'food',
  'Travel & places': 'travel',
  Activities: 'activities',
  Objects: 'objects',
  Symbols: 'symbols',
  Flags: 'flags',
};

/** Every emoji, searchable and grouped. Loaded only when someone asks for more than the usual six. */
export default function EmojiPanel({ onPick }: { onPick: (emoji: string) => void }) {
  const { t } = useTranslation();

  return (
    <EmojiPicker.Root
      className={styles.panel}
      columns={8}
      locale="en"
      emojibaseUrl={EMOJI_DATA_URL}
      onEmojiSelect={({ emoji }) => {
        onPick(emoji);
      }}
    >
      <EmojiPicker.Search
        className={styles.panelSearch}
        placeholder={t('reactions.search')}
        aria-label={t('reactions.search')}
        autoFocus
      />
      <EmojiPicker.Viewport className={styles.panelViewport}>
        <EmojiPicker.Loading className={styles.panelState}>
          <Spinner size="1.75rem" />
        </EmojiPicker.Loading>
        <EmojiPicker.Empty className={styles.panelState}>
          {t('reactions.noneFound')}
        </EmojiPicker.Empty>
        <EmojiPicker.List
          className={styles.panelList}
          components={{
            CategoryHeader: ({ category, ...props }) => {
              const key = CATEGORY_KEYS[category.label];
              return (
                <div {...props} className={styles.panelCategory}>
                  {key
                    ? t(`reactions.categories.${key}` as 'reactions.categories.smileys')
                    : category.label}
                </div>
              );
            },
            Row: ({ children, ...props }) => (
              <div {...props} className={styles.panelRow}>
                {children}
              </div>
            ),
            Emoji: ({ emoji, ...props }) => (
              <button {...props} className={styles.panelEmoji}>
                {emoji.emoji}
              </button>
            ),
          }}
        />
      </EmojiPicker.Viewport>
    </EmojiPicker.Root>
  );
}
