import {
  Badge,
  Button,
  Card,
  colors,
  EmptyState,
  Icon,
  Screen,
  screenGutter,
  ScreenHeader,
  spacing,
  Text,
} from '@hungerly/ui';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

interface AdPlan {
  id: string;
  name: string;
  description: string;
  reach: string;
  priceLabel: string;
  badge?: string;
}

const AD_PLANS: AdPlan[] = [
  {
    id: 'basic',
    name: 'Spotlight',
    description: 'Get a highlighted placement in customer search results and home feed in your delivery zone.',
    reach: 'Up to 2,000 impressions / day',
    priceLabel: '₹499 / week',
  },
  {
    id: 'standard',
    name: 'Priority listing',
    description: 'Appear in the top row of your category and on the featured banner during peak hours (12–2 pm, 7–9 pm).',
    reach: 'Up to 8,000 impressions / day',
    priceLabel: '₹1,499 / week',
    badge: 'Popular',
  },
  {
    id: 'premium',
    name: 'Zone dominator',
    description: 'Full-zone promotion: top search results, splash banners and push notification feature on weekends.',
    reach: 'Up to 25,000 impressions / day',
    priceLabel: '₹3,999 / week',
  },
];

const BENEFITS = [
  { icon: 'trending-up-outline', label: 'More orders' },
  { icon: 'eye-outline', label: 'Higher visibility' },
  { icon: 'bar-chart-outline', label: 'Ad performance report' },
  { icon: 'wallet-outline', label: 'Pay only for results' },
];

export default function AdsScreen() {
  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader onBack={() => router.back()} title="Promoted listings" />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <Card style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Icon name="megaphone-outline" color="primary" size="lg" />
          </View>
          <Text variant="h2" align="center">
            Reach more hungry customers
          </Text>
          <Text variant="body" color="textSecondary" align="center">
            Promote your restaurant to customers in your area. Pay a flat weekly fee — no hidden costs, no per-click charges.
          </Text>
          <View style={styles.benefitsRow}>
            {BENEFITS.map((b) => (
              <View key={b.label} style={styles.benefitItem}>
                <Icon name={b.icon as never} color="primary" size="sm" />
                <Text variant="caption" color="textSecondary" align="center">
                  {b.label}
                </Text>
              </View>
            ))}
          </View>
        </Card>

        {/* Plans */}
        <Text variant="h3">Choose a plan</Text>
        {AD_PLANS.map((plan) => (
          <Card key={plan.id} style={styles.planCard}>
            <View style={styles.planHeader}>
              <Text variant="h3" style={styles.flex}>
                {plan.name}
              </Text>
              {plan.badge && <Badge label={plan.badge} tone="offer" />}
            </View>
            <Text variant="bodySmall" color="textSecondary">
              {plan.description}
            </Text>
            <View style={styles.planMeta}>
              <View style={styles.reach}>
                <Icon name="people-outline" color="textTertiary" size="sm" />
                <Text variant="caption" color="textSecondary">
                  {plan.reach}
                </Text>
              </View>
              <Text variant="price">{plan.priceLabel}</Text>
            </View>
            <Button
              label="Request this plan"
              variant="outline"
              onPress={() => router.push({ pathname: '/ads/new', params: { plan: plan.id } })}
              fullWidth
            />
          </Card>
        ))}

        {/* Active ads */}
        <Text variant="h3">Your active promotions</Text>
        <EmptyState
          icon="megaphone-outline"
          title="No active promotions"
          message="Select a plan above to start promoting your restaurant."
        />

        {/* Disclaimer */}
        <Text variant="caption" color="textTertiary" align="center" style={styles.disclaimer}>
          Promoted listings are subject to Swaadone&apos;s advertising policy. Pricing and availability may vary by zone.
          Contact partner support for enterprise or custom campaigns.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingHorizontal: screenGutter, paddingBottom: spacing['3xl'] },
  heroCard: { padding: spacing.lg, gap: spacing.md, alignItems: 'center' },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'center' },
  benefitItem: { alignItems: 'center', gap: spacing.xs, width: '40%' },
  planCard: { padding: spacing.lg, gap: spacing.md },
  planHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  planMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reach: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  disclaimer: { marginTop: spacing.sm },
});
