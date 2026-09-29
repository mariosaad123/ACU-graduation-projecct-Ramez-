# Design system

The live reference is the `/design-system` page of the web app. This document records the
decisions behind it.

## Principles

- **White, calm, readable.** A white background, one brand blue for actions, and colour used
  to carry meaning (skills, status), not decoration.
- **Arabic first, bilingual always.** Every component is built for right-to-left and
  left-to-right layouts from the start, not mirrored afterwards.
- **Accessible by construction.** Native elements where they exist (`<dialog>`, radio inputs,
  `<select>`), visible focus everywhere, and colour pairs that are tested for contrast.

## Tokens

`apps/web/src/styles/tokens.css` defines two layers:

| Layer     | Example                                    | Used by            |
| --------- | ------------------------------------------ | ------------------ |
| Primitive | `--blue-600`, `--space-4`                  | the semantic layer |
| Semantic  | `--color-action`, `--color-text-secondary` | components         |

Components only reference semantic tokens, so a new theme is a change to one file.

### Colour

- **Brand blue** is derived from the ACU navy (`#063d7d`).
- **ACU gold** marks achievements and certificates.
- **One colour per skill:** listening (teal), speaking (coral), reading (sky, from the globe in
  the faculty logo) and writing (ochre).

`src/styles/tokens.test.ts` reads the token file and fails the build if any text/background
pair drops below 4.5:1, or any graphic below 3:1 (WCAG 2.2 AA).

### Type

| Role     | Family                                  |
| -------- | --------------------------------------- |
| Headings | Alexandria (Arabic and Latin)           |
| Text     | IBM Plex Sans Arabic (Arabic and Latin) |
| Chinese  | Noto Sans SC                            |
| Japanese | Noto Sans JP                            |

Fonts are self-hosted through Fontsource: no third-party requests, and they work offline. Every
file is split by `unicode-range`, so a page only downloads the scripts it shows. The font stack
switches automatically with the `lang` attribute.

Arabic text uses a taller line height, and letter-spacing is never applied to it because it
breaks joined letters.

## Right-to-left

- The interface defaults to Arabic. `<html lang dir>` is set before the first render.
- CSS uses logical properties only (`margin-inline-start`, `inset-inline-end`, ...). Stylelint
  rejects physical properties such as `margin-left`.
- Direction-dependent icons use the `mirror-in-rtl` class.
- Keyboard interactions follow the reading direction: in Arabic, the left arrow moves forward
  through tabs.
- Numbers use Latin digits in both languages (`ar-EG-u-nu-latn`).

## Brand mark

The platform mark is the faculty emblem: eight orange blades carrying letters from different
scripts, around a globe (`components/brand/Emblem.tsx`). It is rendered as two stacked copies of
one image. The outer ring is masked with a radial gradient and the globe is clipped to a circle;
the two meet inside the white rim around the globe, so the join is invisible when the ring moves.

- **Loading:** the ring clicks round blade by blade (8 × 45°), easing into each stop and pausing
  briefly, while the globe breathes. A full turn is needed before the loop restarts, because the
  letters differ from blade to blade.
- **Hover and focus:** the header mark turns by one blade with a slight overshoot.
- The same emblem is the loading indicator everywhere, including inside busy buttons.
- With reduced motion enabled, the mark stays still.

The language picker uses a separate six-blade aperture, one blade per language on the platform,
generated from geometry in `components/brand/aperture-geometry.ts`.

## Components

| Component                                     | Notes                                                                                                           |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `Button`, `ButtonLink`, `IconButton`          | Four variants, three sizes, loading state. `IconButton` requires a label.                                       |
| `TextField`, `TextArea`, `Select`             | Label, hint and error are wired with `aria-describedby`. Optional fields are labelled, required is the default. |
| `Checkbox`, `RadioGroup`                      | Native inputs with custom styling.                                                                              |
| `Card`, `Badge`, `LevelBadge`, `SkillTag`     | `LevelBadge` shows the CEFR level on a six-step ladder.                                                         |
| `Tabs`                                        | Roving tab index, arrow keys follow the text direction.                                                         |
| `Dialog`                                      | Native `<dialog>`: focus trap, Escape and focus return come from the browser.                                   |
| `Toast`                                       | Polite live region; pauses its timer on hover and focus.                                                        |
| `Alert`, `ProgressBar`, `Skeleton`, `Spinner` |                                                                                                                 |
| `AudioPlayer`                                 | Custom controls, speed, and an optional play limit for listening tests (seeking is then disabled).              |
| `VoiceRecorder`                               | `MediaRecorder` with a live input meter, a duration limit and a clear message for every failure case.           |
| `LanguagePicker`                              | The aperture drives a native radio group, so keyboard and screen reader support is built in.                    |
