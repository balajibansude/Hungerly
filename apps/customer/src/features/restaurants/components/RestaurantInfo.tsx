import type { Restaurant } from '@hungerly/types';
import { Badge, Card, Divider, Icon, Rating, spacing, Text, type IconName } from '@hungerly/ui';
import { formatDistance, formatMinutesRange, formatMoney } from '@hungerly/utils';
import { StyleSheet, View } from 'react-native';

/** The facts customers check before ordering, grouped in one scannable card. */
export function RestaurantInfo({ restaurant }: { restaurant: Restaurant }) {
  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text variant="h1" accessibilityRole="header">
            {restaurant.name}
          </Text>
          <Text variant="body" color="textSecondary">
            {restaurant.cuisines.join(' · ')}
          </Text>
          <Text variant="bodySmall" color="textTertiary">
            {restaurant.locality}
          </Text>
        </View>
        <Rating rating={restaurant.rating} showCount size="md" />
      </View>

      {!restaurant.isOpen && (
        <Badge label="Closed now · you can browse the menu" tone="warning" icon="time-outline" />
      )}

      <Divider />
      <View style={styles.facts}>
        <Fact
          icon="time-outline"
          label="Delivery"
          value={formatMinutesRange(restaurant.deliveryTimeMinutes)}
        />
        <Fact
          icon="navigate-outline"
          label="Distance"
          value={formatDistance(restaurant.distanceMeters)}
        />
        <Fact
          icon="bicycle-outline"
          label="Delivery fee"
          value={formatMoney(restaurant.deliveryFee)}
        />
        <Fact icon="people-outline" label="For two" value={formatMoney(restaurant.costForTwo)} />
      </View>

      {restaurant.offer && (
        <View
          style={styles.offer}
          accessible
          accessibilityLabel={`Offer: ${restaurant.offer.label}. ${restaurant.offer.description}`}
        >
          <Icon name="pricetag" color="primary" />
          <View style={styles.flex}>
            <Text variant="label" color="primaryText">
              {restaurant.offer.label}
            </Text>
            <Text variant="bodySmall" color="textSecondary">
              {restaurant.offer.description}
            </Text>
          </View>
        </View>
      )}
    </Card>
  );
}

function Fact({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <View style={styles.fact} accessible accessibilityLabel={`${label}: ${value}`}>
      <Icon name={icon} size="sm" color="textTertiary" />
      <Text variant="label">{value}</Text>
      <Text variant="caption" color="textTertiary">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.lg, gap: spacing.md },
  header: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  flex: { flex: 1 },
  facts: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  fact: { flex: 1, alignItems: 'center', gap: spacing.xxs },
  offer: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
});
