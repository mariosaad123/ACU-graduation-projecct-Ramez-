import { AudioPlayer } from '../../../components/media/AudioPlayer';
import { VoiceRecorder } from '../../../components/media/VoiceRecorder';
import { DsGroup, DsSection } from '../DsSection';
import { getSampleAudioUrl } from '../sample-audio';
import type { DesignSystemCopy } from '../use-copy';
import styles from '../DesignSystemPage.module.css';

export function MediaSection({ copy }: { copy: DesignSystemCopy }) {
  const sampleUrl = getSampleAudioUrl();
  const text = copy.media;

  return (
    <DsSection id="media" title={copy.sections.media}>
      <DsGroup title={text.player}>
        <AudioPlayer src={sampleUrl} title={text.track} />
      </DsGroup>
      <DsGroup title={text.limited}>
        <AudioPlayer src={sampleUrl} title={text.track} maxPlays={2} showSpeedControl={false} />
      </DsGroup>
      <DsGroup title={text.recorder}>
        <p className={styles.note}>{text.recorderHint}</p>
        <VoiceRecorder maxDurationSeconds={30} />
      </DsGroup>
    </DsSection>
  );
}
