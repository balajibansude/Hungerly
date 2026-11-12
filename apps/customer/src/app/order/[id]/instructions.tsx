import {
  Button,
  colors,
  ConfirmDialog,
  Screen,
  ScreenHeader,
  screenGutter,
  spacing,
  Text,
} from '@hungerly/ui';
import { router, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { InstructionSection } from '@/features/instructions/components/InstructionSection';
import {
  hasUnsavedInstructions,
  useInstructionsStore,
  useOrderInstructions,
} from '@/features/instructions/store';
import { OrderNotFound } from '@/features/orders/components/OrderNotFound';
import { saveInstructionsAndTrack, skipInstructions } from '@/features/orders/flow';
import { usePlacedOrder } from '@/features/orders/store';
import { useServices, userMessage } from '@/services';

/**
 * Instructions for an order that was just placed: one section for the restaurant and one for
 * the delivery partner. Saving only attaches instructions to this order — it never places
 * another order or starts a payment.
 */
export default function OrderInstructionsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const order = usePlacedOrder(id);
  if (!order || !id) return <OrderNotFound />;
  return <InstructionsForOrder orderId={id} orderNumber={order.orderNumber} />;
}

function InstructionsForOrder({ orderId, orderNumber }: { orderId: string; orderNumber: string }) {
  const insets = useSafeAreaInsets();
  const { orders } = useServices();
  const draft = useOrderInstructions(orderId);
  const markSaved = useInstructionsStore((s) => s.markSaved);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The blocked navigation, waiting for the customer to confirm discarding their edits.
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);

  // Back button, swipe or hardware back with unsaved edits asks first instead of dropping them.
  const disablePrevention = usePreventRemove(hasUnsavedInstructions(draft), ({ repeat }) =>
    setPendingLeave(() => repeat),
  );

  const continueToTracking = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await saveInstructionsAndTrack({
        orderId,
        draft,
        orders,
        markSaved,
        replace: (route) => {
          // Saved (or nothing to save): moving on to tracking is not "leaving with edits".
          disablePrevention();
          router.replace(route);
        },
      });
    } catch (e) {
      // The draft is untouched, so the customer can simply try again.
      setError(userMessage(e));
      setSaving(false);
    }
  };

  const skip = () =>
    skipInstructions({
      orderId,
      draft,
      replace: (route) => {
        disablePrevention();
        router.replace(route);
      },
      confirmDiscard: (proceed) => setPendingLeave(() => proceed),
    });

  return (
    <Screen>
      <ScreenHeader
        title="Add instructions"
        subtitle={`Order #${orderNumber}`}
        onBack={router.canGoBack() ? () => router.back() : undefined}
      />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text variant="bodySmall" color="textSecondary">
          Optional. Choose as many as you like, type a note or hold to record a voice note.
        </Text>
        <InstructionSection orderId={orderId} section="restaurant" />
        <InstructionSection orderId={orderId} section="delivery" />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {error && (
          <Text variant="bodySmall" color="error" align="center" accessibilityLiveRegion="polite">
            {error}
          </Text>
        )}
        <Button
          label="Continue to tracking"
          icon="arrow-forward"
          iconPosition="end"
          onPress={continueToTracking}
          loading={saving}
          fullWidth
          testID="instructions-continue"
        />
        <Button
          label="Skip for now"
          variant="ghost"
          onPress={skip}
          disabled={saving}
          fullWidth
          testID="instructions-skip"
        />
      </View>

      <ConfirmDialog
        visible={pendingLeave !== null}
        title="Discard your instructions?"
        message="You haven't sent these instructions yet. Tap Continue to tracking to send them to the restaurant and delivery partner."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        destructive
        onCancel={() => setPendingLeave(null)}
        onConfirm={() => {
          const leave = pendingLeave;
          setPendingLeave(null);
          disablePrevention();
          leave?.();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: screenGutter, paddingBottom: spacing['2xl'], gap: spacing.lg },
  footer: {
    gap: spacing.sm,
    paddingHorizontal: screenGutter,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
});
