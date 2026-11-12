import { Chip, colors, Icon, radius, spacing, Text, TextField, type IconName } from '@hungerly/ui';
import type { Id } from '@hungerly/types';
import { useRef } from 'react';
import { StyleSheet, View, type TextInputInstance } from 'react-native';

import {
  deliveryOptions,
  INSTRUCTION_NOTE_MAX_LENGTH,
  restaurantOptions,
  useInstructionsStore,
  useOrderInstructions,
  type InstructionOption,
  type InstructionSectionId,
} from '../store';
import { VoiceNoteCard } from './VoiceNoteCard';

interface SectionCopy {
  icon: IconName;
  title: string;
  subtitle: string;
  notePlaceholder: string;
  noteLabel: string;
  /** For screen readers: who the voice note is for. */
  audience: string;
  options: InstructionOption<string>[];
  /** Selecting this option focuses the free-text note. */
  focusNoteOn?: string;
}

const COPY: Record<InstructionSectionId, SectionCopy> = {
  restaurant: {
    icon: 'restaurant-outline',
    title: 'Instructions for restaurant',
    subtitle: 'The restaurant will try to follow these while preparing your order.',
    notePlaceholder: 'E.g. make it extra crispy, no coriander…',
    noteLabel: 'Add cooking instructions',
    audience: 'the restaurant',
    options: restaurantOptions,
    focusNoteOn: 'other',
  },
  delivery: {
    icon: 'bicycle-outline',
    title: 'Instructions for delivery partner',
    subtitle: 'Your delivery partner will see these when they pick up your order.',
    notePlaceholder: 'E.g. gate code 1234, second floor on the left…',
    noteLabel: 'Add delivery instructions',
    audience: 'the delivery partner',
    options: deliveryOptions,
  },
};

/**
 * One instruction card for a placed order: multi-select quick options, an optional note and
 * a hold-to-record voice note. Restaurant and delivery sections share this exact component,
 * so they always look and behave the same; their data stays separate in the store.
 */
export function InstructionSection({
  orderId,
  section,
}: {
  orderId: Id;
  section: InstructionSectionId;
}) {
  const copy = COPY[section];
  const draft = useOrderInstructions(orderId)[section];
  const toggleOption = useInstructionsStore((s) => s.toggleOption);
  const setNote = useInstructionsStore((s) => s.setNote);
  const setVoiceNote = useInstructionsStore((s) => s.setVoiceNote);
  const noteRef = useRef<TextInputInstance>(null);
  const selected = draft.options as readonly string[];

  return (
    <View style={styles.card} testID={`${section}-instructions`}>
      <View style={styles.header}>
        <View style={styles.iconTile}>
          <Icon name={copy.icon} size="sm" color="primaryText" />
        </View>
        <View style={styles.flex}>
          <Text variant="h3" accessibilityRole="header">
            {copy.title}
          </Text>
          <Text variant="bodySmall" color="textSecondary">
            {copy.subtitle}
          </Text>
        </View>
      </View>

      <View style={styles.chips}>
        {copy.options.map((option) => {
          const isSelected = selected.includes(option.id);
          return (
            <Chip
              key={option.id}
              label={option.label}
              selected={isSelected}
              icon={isSelected ? 'checkmark' : undefined}
              onPress={() => {
                // Options are typed per section in the store; COPY pairs them correctly.
                toggleOption(orderId, section, option.id as never);
                if (!isSelected && option.id === copy.focusNoteOn) noteRef.current?.focus();
              }}
            />
          );
        })}
      </View>

      <TextField
        ref={noteRef}
        label={copy.noteLabel}
        hideLabel
        placeholder={copy.notePlaceholder}
        value={draft.note}
        onChangeText={(text) => setNote(orderId, section, text)}
        maxLength={INSTRUCTION_NOTE_MAX_LENGTH}
        multiline
        textAlignVertical="top"
        helperText={`${draft.note.length}/${INSTRUCTION_NOTE_MAX_LENGTH}`}
        testID={`${section}-note`}
      />

      <VoiceNoteCard
        value={draft.voiceNote}
        onChange={(note) => setVoiceNote(orderId, section, note)}
        audience={copy.audience}
        testID={`${section}-voice`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  iconTile: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
