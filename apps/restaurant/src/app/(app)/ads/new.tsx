import { Button, Card, Screen, screenGutter, ScreenHeader, spacing, Text } from '@hungerly/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, ScrollView, StyleSheet } from 'react-native';

const PLAN_NAMES: Record<string, string> = {
  basic: 'Spotlight',
  standard: 'Priority listing',
  premium: 'Zone dominator',
};

const PLAN_PRICES: Record<string, string> = {
  basic: '₹499 / week',
  standard: '₹1,499 / week',
  premium: '₹3,999 / week',
};

export default function NewAdScreen() {
  const { plan } = useLocalSearchParams<{ plan: string }>();
  const planName = PLAN_NAMES[plan ?? ''] ?? 'Selected plan';
  const planPrice = PLAN_PRICES[plan ?? ''] ?? '';

  const handleSubmit = () => {
    Alert.alert(
      'Request submitted',
      'Our team will review your request and contact you within 1 business day to confirm payment and activation.',
      [{ text: 'OK', onPress: () => router.back() }],
    );
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader onBack={() => router.back()} title="Request promotion" />
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.planCard}>
          <Text variant="label" color="textSecondary">
            SELECTED PLAN
          </Text>
          <Text variant="h2">{planName}</Text>
          <Text variant="price">{planPrice}</Text>
        </Card>

        <Card style={styles.infoCard}>
          <Text variant="h3">What happens next?</Text>
          <Text variant="bodySmall" color="textSecondary">
            1. Our partner success team reviews your request (usually within 1 business day).
          </Text>
          <Text variant="bodySmall" color="textSecondary">
            2. You receive payment instructions via email or phone.
          </Text>
          <Text variant="bodySmall" color="textSecondary">
            3. Your promotion goes live within 24 hours of payment confirmation.
          </Text>
          <Text variant="bodySmall" color="textSecondary">
            4. You get a weekly performance report showing impressions, clicks and orders attributed to your promotion.
          </Text>
        </Card>

        <Button
          label="Submit request"
          icon="send-outline"
          onPress={handleSubmit}
          fullWidth
        />
        <Button
          label="Cancel"
          variant="ghost"
          onPress={() => router.back()}
          fullWidth
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingHorizontal: screenGutter, paddingBottom: spacing['3xl'] },
  planCard: { padding: spacing.lg, gap: spacing.xs },
  infoCard: { padding: spacing.lg, gap: spacing.md },
});
