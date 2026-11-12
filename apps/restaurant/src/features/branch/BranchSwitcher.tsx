import { Badge, colors, Icon, radius, screenGutter, spacing, Text } from '@hungerly/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSessionStore } from '@/features/auth/session';

import { branchStatusMeta } from './status';
import { useActiveBranch } from './useActiveBranch';

/**
 * Shows the branch the app is working on and lets an owner with several branches switch.
 * Always visible in tab headers so data from one branch is never mistaken for another's.
 */
export function BranchSwitcher() {
  const { branch } = useActiveBranch();
  const branches = useSessionStore((s) => s.session?.branches ?? []);
  const selectBranch = useSessionStore((s) => s.selectBranch);
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  if (!branch) return null;
  const location = [branch.locality, branch.city].filter(Boolean).join(', ');

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Current branch: ${branch.name}${location ? `, ${location}` : ''}. Change branch`}
        hitSlop={8}
        style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}
      >
        <Icon name="storefront-outline" size="sm" color="primary" />
        <Text variant="label" color="textSecondary" numberOfLines={1} style={styles.flexShrink}>
          {branch.name}
          {location ? ` · ${location}` : ''}
        </Text>
        <Icon name="chevron-down" size="sm" color="textTertiary" />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close branch list">
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} onPress={() => undefined} accessibilityViewIsModal>
            <View style={styles.handle} />
            <Text variant="h2" accessibilityRole="header">
              Your branches
            </Text>
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {branches.map((item) => {
                const selected = item.id === branch.id;
                const meta = branchStatusMeta[item.status];
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => {
                      selectBranch(item.id);
                      setOpen(false);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && styles.pressed]}
                  >
                    <View style={styles.flex}>
                      <Text variant="h3" numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text variant="bodySmall" color="textSecondary" numberOfLines={1}>
                        {[item.locality, item.city].filter(Boolean).join(', ') || 'Address not added yet'}
                      </Text>
                    </View>
                    <Badge label={meta.label} tone={meta.tone} />
                    <Icon name={selected ? 'radio-button-on' : 'radio-button-off'} color={selected ? 'primary' : 'textTertiary'} />
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable
              onPress={() => {
                setOpen(false);
                router.push('/branches');
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.manage, pressed && styles.pressed]}
            >
              <Icon name="add-circle-outline" color="primary" />
              <Text variant="label" color="primaryText">
                Manage or add branches
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start', maxWidth: '100%' },
  flexShrink: { flexShrink: 1 },
  pressed: { opacity: 0.7 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  sheet: {
    maxHeight: '80%',
    gap: spacing.md,
    paddingHorizontal: screenGutter,
    paddingTop: spacing.md,
    borderTopLeftRadius: radius.modal,
    borderTopRightRadius: radius.modal,
    backgroundColor: colors.surface,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: radius.pill, backgroundColor: colors.borderStrong },
  list: { flexGrow: 0 },
  listContent: { gap: spacing.sm },
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  rowSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  flex: { flex: 1 },
  manage: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48 },
});
