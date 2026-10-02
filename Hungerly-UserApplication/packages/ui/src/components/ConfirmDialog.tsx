import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { colors } from '../theme/colors';
import { elevation, radius, screenGutter, spacing } from '../theme/layout';
import { Button } from './Button';
import { Text } from './Text';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  /** Pass `null` for an informational dialog with a single button. */
  cancelLabel?: string | null;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Blocking confirmation for consequential actions (e.g. replacing the cart).
 * Tapping outside or the Android back button cancels.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <Pressable
        style={styles.backdrop}
        onPress={onCancel}
        accessibilityLabel={cancelLabel ?? confirmLabel}
      >
        <Pressable style={styles.dialog} accessibilityViewIsModal onPress={() => undefined}>
          <Text variant="h3" accessibilityRole="header">
            {title}
          </Text>
          <Text variant="body" color="textSecondary">
            {message}
          </Text>
          <View style={styles.actions}>
            {cancelLabel !== null && (
              <Button
                label={cancelLabel}
                onPress={onCancel}
                variant="outline"
                size="md"
                style={styles.flex}
              />
            )}
            <Button
              label={confirmLabel}
              onPress={onConfirm}
              variant={destructive ? 'danger' : 'primary'}
              size="md"
              style={styles.flex}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: screenGutter,
    backgroundColor: colors.overlay,
  },
  dialog: {
    gap: spacing.md,
    padding: spacing['2xl'],
    borderRadius: radius.modal,
    backgroundColor: colors.surface,
    ...elevation.high,
  },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  flex: { flex: 1 },
});
