import { Button, Icon, Skeleton, spacing, Text } from '@hungerly/ui';
import { Pressable, StyleSheet, View } from 'react-native';

import { addressLabels, addressLines, formatAddress } from '@/features/addresses/format';

import type { DeliveryAddressChoice } from '../deliveryAddress';
import { CheckoutSection } from './CheckoutSection';

export type DeliveryAddressCardState =
  { kind: 'guest' } | { kind: 'loading' } | { kind: 'error' } | DeliveryAddressChoice;

/** Where the order goes: the selected address with Change, or a prompt to add/fix one. */
export function DeliveryAddressCard({
  state,
  onChange,
  onAdd,
  onEdit,
  onLogin,
  onRetry,
}: {
  state: DeliveryAddressCardState;
  onChange: () => void;
  onAdd: () => void;
  onEdit: (addressId: string) => void;
  onLogin: () => void;
  onRetry: () => void;
}) {
  const hasAddress = state.kind === 'ready' || state.kind === 'incomplete';
  return (
    <CheckoutSection
      icon="location-outline"
      title="Deliver to"
      action={
        hasAddress ? (
          <Pressable
            onPress={onChange}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Change delivery address"
            testID="checkout-change-address"
          >
            <Text variant="label" color="primaryText">
              Change
            </Text>
          </Pressable>
        ) : undefined
      }
    >
      {state.kind === 'loading' ? (
        <Skeleton height={56} radius="md" />
      ) : state.kind === 'guest' ? (
        <Prompt
          message="Log in to choose where your order is delivered."
          label="Log in"
          onPress={onLogin}
        />
      ) : state.kind === 'error' ? (
        <Prompt message="We couldn't load your addresses." label="Try again" onPress={onRetry} />
      ) : state.kind === 'none' ? (
        <Prompt
          message="Add an address so we know where to deliver."
          label="Add address"
          icon="add"
          onPress={onAdd}
        />
      ) : (
        <View style={styles.address} testID="checkout-address">
          <View style={styles.titleRow}>
            <Icon name={addressLabels[state.address.label].icon} size="sm" color="textSecondary" />
            <Text variant="label">{addressLabels[state.address.label].title}</Text>
          </View>
          <Text
            variant="bodySmall"
            color="textSecondary"
            numberOfLines={3}
            accessibilityLabel={formatAddress(state.address)}
          >
            {addressLines(state.address).join(', ')}
          </Text>
          {state.kind === 'incomplete' && (
            <Prompt
              tone="warning"
              message="This address is missing some details."
              label="Complete address"
              onPress={() => onEdit(state.address.id)}
            />
          )}
        </View>
      )}
    </CheckoutSection>
  );
}

function Prompt({
  message,
  label,
  icon,
  tone = 'default',
  onPress,
}: {
  message: string;
  label: string;
  icon?: 'add';
  tone?: 'default' | 'warning';
  onPress: () => void;
}) {
  return (
    <View style={styles.prompt}>
      <Text variant="bodySmall" color={tone === 'warning' ? 'warning' : 'textSecondary'}>
        {message}
      </Text>
      <Button label={label} icon={icon} variant="outline" onPress={onPress} fullWidth />
    </View>
  );
}

const styles = StyleSheet.create({
  address: { gap: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  prompt: { gap: spacing.sm },
});
