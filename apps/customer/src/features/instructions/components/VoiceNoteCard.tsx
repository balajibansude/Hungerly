import { colors, Icon, radius, spacing, Text } from '@hungerly/ui';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatDuration, MAX_VOICE_NOTE_SECONDS, type VoiceNote } from '../store';

/**
 * Hold to record a voice note. UI only: no audio is captured yet — the card simulates
 * recording by tracking how long it is held (up to MAX_VOICE_NOTE_SECONDS), so there is
 * nothing to play back. Extracted unchanged from the cart's rider voice card.
 */
export function VoiceNoteCard({
  value,
  onChange,
  audience,
  testID,
}: {
  value: VoiceNote | null;
  onChange: (note: VoiceNote | null) => void;
  /** Who the note is for, for screen readers, e.g. "the restaurant". */
  audience: string;
  testID: string;
}) {
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [hint, setHint] = useState(false);
  const startedAt = useRef(0);

  const recording = elapsed !== null;

  const stop = () => {
    if (startedAt.current === 0) return;
    const seconds = Math.min(
      MAX_VOICE_NOTE_SECONDS,
      Math.round((Date.now() - startedAt.current) / 1000),
    );
    startedAt.current = 0;
    setElapsed(null);
    // Very short holds are treated as accidental and not saved.
    if (seconds >= 1) onChange({ durationSeconds: seconds });
  };

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => {
      const seconds = (Date.now() - startedAt.current) / 1000;
      if (seconds >= MAX_VOICE_NOTE_SECONDS) stop();
      else setElapsed(seconds);
    }, 250);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(() => setHint(false), 1800);
    return () => clearTimeout(timer);
  }, [hint]);

  const label = recording
    ? `Recording ${formatDuration(elapsed)}`
    : value
      ? `Voice note ${formatDuration(value.durationSeconds)}`
      : hint
        ? 'Hold to record'
        : 'Tap & hold to record a voice note';

  return (
    <View>
      <Pressable
        onPress={() => setHint(true)}
        onLongPress={() => {
          startedAt.current = Date.now();
          setElapsed(0);
        }}
        delayLongPress={250}
        onPressOut={stop}
        accessibilityRole="button"
        accessibilityLabel={
          value
            ? `Voice note for ${audience}, ${value.durationSeconds} seconds. Hold to record again`
            : `Record a voice instruction for ${audience}. Tap and hold to record`
        }
        testID={testID}
        style={({ pressed }) => pressed && !recording && styles.pressed}
      >
        <View
          style={[
            styles.card,
            value !== null && !recording && styles.cardSelected,
            recording && styles.cardRecording,
          ]}
        >
          <Icon
            name={recording ? 'radio-button-on' : value ? 'mic' : 'mic-outline'}
            color={recording ? 'error' : value ? 'primary' : 'textSecondary'}
          />
          <Text
            variant="caption"
            color={recording ? 'error' : value ? 'primaryText' : 'textPrimary'}
            numberOfLines={1}
            style={styles.flex}
          >
            {label}
          </Text>
        </View>
      </Pressable>
      {value && !recording && (
        <Pressable
          onPress={() => onChange(null)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Delete voice note for ${audience}`}
          style={styles.remove}
          testID={`${testID}-delete`}
        >
          <Icon name="close-circle" size="sm" color="textTertiary" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.md,
    // Room for the delete button.
    paddingRight: spacing['2xl'],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
  },
  cardSelected: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  cardRecording: {
    borderWidth: 1.5,
    borderColor: colors.error,
    backgroundColor: colors.errorSoft,
  },
  flex: { flex: 1 },
  pressed: { opacity: 0.85 },
  remove: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: spacing.md,
    justifyContent: 'center',
  },
});
