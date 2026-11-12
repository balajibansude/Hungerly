import { Button, colors, elevation, radius, screenGutter, spacing, Text } from '@hungerly/ui';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface OrderActionSheetProps {
  visible: boolean;
  title: string;
  message?: string;
  /** Choices for the action (prep time, reject reason). */
  children?: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  /** The action is running: confirm shows a spinner and nothing can be dismissed. */
  busy?: boolean;
  confirmDisabled?: boolean;
  errorText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Bottom sheet for order actions. Like ConfirmDialog, but it can hold choices and stays
 * open with a spinner while the action runs, so the result (or error) is shown in place.
 */
export function OrderActionSheet({
  visible,
  title,
  message,
  children,
  confirmLabel,
  destructive = false,
  busy = false,
  confirmDisabled = false,
  errorText,
  onConfirm,
  onCancel,
}: OrderActionSheetProps) {
  const insets = useSafeAreaInsets();
  const dismiss = () => {
    if (!busy) onCancel();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={dismiss}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={dismiss} accessibilityLabel="Cancel">
        <Pressable
          style={[styles.sheet, { paddingBottom: spacing['2xl'] + insets.bottom }]}
          accessibilityViewIsModal
          onPress={() => undefined}
        >
          <ScrollView contentContainerStyle={styles.content} bounces={false}>
            <Text variant="h2" accessibilityRole="header">
              {title}
            </Text>
            {message && (
              <Text variant="body" color="textSecondary">
                {message}
              </Text>
            )}
            {children}
            {errorText && (
              <Text variant="bodySmall" color="error" accessibilityLiveRegion="assertive">
                {errorText}
              </Text>
            )}
          </ScrollView>
          <View style={styles.actions}>
            <Button
              label="Cancel"
              variant="outline"
              onPress={dismiss}
              disabled={busy}
              style={styles.flex}
            />
            <Button
              label={confirmLabel}
              variant={destructive ? 'danger' : 'primary'}
              onPress={onConfirm}
              loading={busy}
              disabled={busy || confirmDisabled}
              style={styles.flex}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  sheet: {
    width: '100%',
    maxWidth: 640,
    maxHeight: '85%',
    alignSelf: 'center',
    paddingTop: spacing['2xl'],
    paddingHorizontal: screenGutter,
    borderTopLeftRadius: radius.modal,
    borderTopRightRadius: radius.modal,
    backgroundColor: colors.surface,
    gap: spacing.lg,
    ...elevation.high,
  },
  content: { gap: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.md },
});
