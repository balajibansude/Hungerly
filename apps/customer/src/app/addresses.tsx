import { useQuery } from '@hungerly/app-core';
import type { Address } from '@hungerly/types';
import {
  Badge,
  Button,
  Card,
  colors,
  ConfirmDialog,
  ErrorState,
  Icon,
  IconButton,
  radius,
  Screen,
  ScreenHeader,
  screenGutter,
  Skeleton,
  spacing,
  Text,
} from '@hungerly/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { addressLabels, addressLines, formatAddress } from '@/features/addresses/format';
import { useRefetchOnFocus } from '@/features/addresses/useRefetchOnFocus';
import { useServices, userMessage } from '@/services';

/**
 * Saved delivery addresses: choose where to deliver, add, edit and remove.
 * `?select=1` opens it as a picker (e.g. from checkout): choosing an address goes back.
 */
export default function AddressesScreen() {
  const { location } = useServices();
  const { select } = useLocalSearchParams<{ select?: string }>();
  const pickMode = select === '1';
  const saved = useQuery('saved-addresses', () => location.listAddresses());
  useRefetchOnFocus(saved.refetch);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Address | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = async (address: Address) => {
    if (busyId) return;
    setBusyId(address.id);
    setError(null);
    try {
      await location.setDeliveryAddress(address.id);
      if (pickMode) router.back();
      else saved.refetch();
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async () => {
    const address = toDelete;
    setToDelete(null);
    if (!address) return;
    setBusyId(address.id);
    setError(null);
    try {
      await location.deleteAddress(address.id);
      saved.refetch();
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const addresses = saved.status === 'success' ? saved.data.addresses : [];
  const onlyOne = addresses.length === 1;

  return (
    <Screen>
      <ScreenHeader
        title={pickMode ? 'Deliver to' : 'My Addresses'}
        subtitle={pickMode ? 'Choose a delivery address' : undefined}
        onBack={() => router.back()}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {saved.status === 'loading' ? (
          <>
            <Skeleton height={124} radius="card" />
            <Skeleton height={124} radius="card" />
          </>
        ) : saved.status === 'error' ? (
          <ErrorState message="We couldn't load your addresses." onRetry={saved.refetch} />
        ) : (
          addresses.map((address) => {
            const selected = address.id === saved.data.selectedId;
            const label = addressLabels[address.label];
            return (
              <Card key={address.id} style={[styles.card, selected && styles.cardSelected]}>
                <Pressable
                  onPress={() => choose(address)}
                  disabled={busyId !== null}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected, busy: busyId === address.id }}
                  accessibilityLabel={`${label.title}: ${formatAddress(address)}`}
                  accessibilityHint={selected ? undefined : 'Deliver to this address'}
                  style={styles.row}
                  testID={`address-${address.id}`}
                >
                  <View style={[styles.icon, selected && styles.iconSelected]}>
                    <Icon name={label.icon} color={selected ? 'onPrimary' : 'primary'} />
                  </View>
                  <View style={styles.flex}>
                    <View style={styles.titleRow}>
                      <Text variant="h3">{label.title}</Text>
                      {selected && (
                        <Badge label="Delivering here" tone="success" icon="checkmark" />
                      )}
                    </View>
                    <Text variant="body" color="textSecondary">
                      {addressLines(address).join('\n')}
                    </Text>
                  </View>
                </Pressable>
                <View style={styles.actions}>
                  <IconButton
                    icon="create-outline"
                    variant="ghost"
                    accessibilityLabel={`Edit ${label.title} address`}
                    onPress={() =>
                      router.push({ pathname: '/address-form', params: { id: address.id } })
                    }
                    disabled={busyId !== null}
                  />
                  <IconButton
                    icon="trash-outline"
                    variant="ghost"
                    iconColor={onlyOne ? 'onDisabled' : 'error'}
                    accessibilityLabel={`Remove ${label.title} address`}
                    onPress={() => setToDelete(address)}
                    disabled={busyId !== null || onlyOne}
                  />
                </View>
              </Card>
            );
          })
        )}

        {error && (
          <Text variant="bodySmall" color="error" accessibilityLiveRegion="polite">
            {error}
          </Text>
        )}

        {saved.status === 'success' && (
          <>
            <Button
              label="Add new address"
              icon="add"
              variant="outline"
              onPress={() =>
                // Picking for checkout: the new address is selected as soon as it's saved.
                router.push(
                  pickMode
                    ? { pathname: '/address-form', params: { select: '1' } }
                    : '/address-form',
                )
              }
              fullWidth
            />
            {onlyOne && (
              <View style={styles.note}>
                <Icon name="information-circle-outline" size="sm" color="textSecondary" />
                <Text variant="bodySmall" color="textSecondary" style={styles.flex}>
                  You need at least one address. Add another one to remove this.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      <ConfirmDialog
        visible={toDelete !== null}
        title="Remove this address?"
        message={toDelete ? formatAddress(toDelete) : ''}
        confirmLabel="Remove"
        destructive
        onCancel={() => setToDelete(null)}
        onConfirm={remove}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: screenGutter, paddingBottom: spacing['2xl'], gap: spacing.lg },
  card: { padding: spacing.lg, gap: spacing.sm, borderWidth: 1, borderColor: 'transparent' },
  cardSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  row: { flexDirection: 'row', gap: spacing.md },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  iconSelected: { backgroundColor: colors.primary },
  flex: { flex: 1, gap: spacing.xxs },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.xs },
  note: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
});
