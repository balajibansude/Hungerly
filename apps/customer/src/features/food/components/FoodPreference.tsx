import type { FoodType } from '@hungerly/types';
import {
  Button,
  colors,
  FoodTypeMark,
  Icon,
  IconButton,
  radius,
  screenGutter,
  spacing,
  Text,
} from '@hungerly/ui';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { foodPreferenceOptions, useFoodPreferenceStore, type FoodPreference } from '../preference';

const markFor: Record<FoodPreference, FoodType[]> = {
  veg: ['veg'],
  mixed: ['veg', 'non_veg'],
  jain: ['jain'],
};

/**
 * Veg / Mixed / Jain as one row of compact pills, bound to the shared preference.
 *
 * A plain wrapping row, not a horizontal ScrollView: three short pills fit on the narrowest
 * phones, and a ScrollView placed in a flex column grows (`flexGrow: 1`) and stretches the
 * pills to its height. At very large font sizes the row wraps instead of clipping.
 */
export function FoodPreferenceChips({ style }: { style?: StyleProp<ViewStyle> }) {
  const preference = useFoodPreferenceStore((s) => s.preference);
  const setPreference = useFoodPreferenceStore((s) => s.setPreference);
  return (
    <View style={[styles.chips, style]} accessibilityRole="radiogroup">
      {foodPreferenceOptions.map((option) => {
        const selected = preference === option.value;
        const jain = option.value === 'jain';
        return (
          <Pressable
            key={option.value}
            onPress={() => setPreference(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={option.label}
            accessibilityHint={option.description}
            hitSlop={{ top: 6, bottom: 6 }}
            testID={`preference-chip-${option.value}`}
            style={({ pressed }) => [
              styles.chip,
              jain ? styles.jainIdle : styles.idle,
              selected && (jain ? styles.jainSelected : styles.selected),
              pressed && !selected && (jain ? styles.jainPressed : styles.pressed),
            ]}
          >
            <View style={styles.chipMarks}>
              {markFor[option.value].map((type) => (
                <FoodTypeMark key={type} type={type} size={12} showLabel={false} />
              ))}
            </View>
            <Text
              variant="label"
              numberOfLines={1}
              color={
                selected ? (jain ? 'textPrimary' : 'onPrimary') : jain ? 'jainInk' : 'primaryText'
              }
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Bottom sheet opened from the "What's on your mind?" filter icon: choose Veg, Mixed or
 * Jain, or jump to the full cuisine list.
 */
export function FoodPreferenceSheet({
  visible,
  onClose,
  onShowAllCuisines,
}: {
  visible: boolean;
  onClose: () => void;
  onShowAllCuisines: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const preference = useFoodPreferenceStore((s) => s.preference);
  const setPreference = useFoodPreferenceStore((s) => s.setPreference);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close filters">
        {/* Never taller than the window below the status bar; the content scrolls on small
            screens or with large text. The Modal covers the tab bar, so only the bottom
            safe area needs padding. */}
        <Pressable
          style={[styles.sheet, { maxHeight: windowHeight - insets.top - spacing['3xl'] }]}
          accessibilityViewIsModal
          onPress={() => undefined}
        >
          <View style={styles.handle} />
          <View style={styles.titleRow}>
            <Text variant="h2" accessibilityRole="header" style={styles.flex}>
              Food preference
            </Text>
            <IconButton
              icon="close"
              variant="ghost"
              accessibilityLabel="Close filters"
              onPress={onClose}
              testID="food-filter-close"
            />
          </View>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.lg }]}
            bounces={false}
          >
            <Text variant="bodySmall" color="textSecondary">
              Applies to dishes on Home, Search, Offers and menus.
            </Text>
            <View style={styles.options} accessibilityRole="radiogroup">
              {foodPreferenceOptions.map((option) => {
                const selected = preference === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => {
                      setPreference(option.value);
                      onClose();
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={`${option.label}. ${option.description}`}
                    testID={`preference-${option.value}`}
                    style={({ pressed }) => [
                      styles.option,
                      selected && styles.optionSelected,
                      pressed && styles.optionPressed,
                    ]}
                  >
                    <View style={styles.marks}>
                      {markFor[option.value].map((type) => (
                        <FoodTypeMark key={type} type={type} size={16} showLabel={false} />
                      ))}
                    </View>
                    <View style={styles.flex}>
                      <Text variant="h3">{option.label}</Text>
                      <Text variant="bodySmall" color="textSecondary">
                        {option.description}
                      </Text>
                    </View>
                    <Icon
                      name={selected ? 'radio-button-on' : 'radio-button-off'}
                      color={selected ? 'primary' : 'textTertiary'}
                    />
                  </Pressable>
                );
              })}
            </View>
            <Button
              label="Browse all cuisines"
              variant="outline"
              icon="grid-outline"
              onPress={() => {
                onClose();
                onShowAllCuisines();
              }}
              fullWidth
            />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: screenGutter,
    gap: spacing.sm,
  },
  chip: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + spacing.xxs,
    paddingHorizontal: spacing.md + spacing.xxs,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  chipMarks: { flexDirection: 'row', gap: spacing.xxs },
  idle: { backgroundColor: colors.surface, borderColor: colors.primary },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  pressed: { backgroundColor: colors.primarySoft },
  jainIdle: { backgroundColor: colors.surface, borderColor: colors.jain },
  jainSelected: { backgroundColor: colors.jain, borderColor: colors.jain },
  jainPressed: { backgroundColor: colors.accentSoft },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  sheet: {
    paddingTop: spacing.md,
    borderTopLeftRadius: radius.modal,
    borderTopRightRadius: radius.modal,
    backgroundColor: colors.surface,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    marginBottom: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: screenGutter,
    paddingRight: screenGutter - spacing.sm,
  },
  scroll: { flexGrow: 0 },
  body: { gap: spacing.sm, paddingHorizontal: screenGutter },
  options: { gap: spacing.sm, marginVertical: spacing.md },
  option: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  optionPressed: { backgroundColor: colors.surfacePressed },
  marks: { width: 40, flexDirection: 'row', gap: spacing.xs },
  flex: { flex: 1 },
});
