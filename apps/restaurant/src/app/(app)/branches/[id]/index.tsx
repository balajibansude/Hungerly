import { BranchDetailSchema, paths } from '@hungerly/api-client';
import {
  Badge,
  Button,
  Card,
  Divider,
  Icon,
  Screen,
  screenGutter,
  ScreenHeader,
  spacing,
  Text,
} from '@hungerly/ui';
import { formatMoney } from '@hungerly/utils';
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { branchStatusMeta } from '@/features/branch/status';
import { useApiQuery } from '@/lib/hooks';
import { QueryView } from '@/features/shell/ScreenState';

const FOOD_TYPE_LABEL = { veg_only: 'Veg only', mixed: 'Veg & non-veg' };

const STEP_LABEL: Record<string, string> = {
  business: 'Business profile',
  details: 'Branch details',
  location: 'Location',
  contact: 'Contact info',
  hours: 'Opening hours',
  licence: 'FSSAI licence',
  bank: 'Bank account',
  declaration: 'Declaration',
};

export default function BranchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useApiQuery(
    id ? paths.partner.branch(id) : null,
    BranchDetailSchema,
  );

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader onBack={() => router.back()} title="Branch profile" />
      <QueryView query={query} loadingLabel="Loading branch">
        {({ branch, onboarding }) => {
          const meta = branchStatusMeta[branch.status];
          return (
            <ScrollView contentContainerStyle={styles.content}>
              <Card style={styles.header}>
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <Text variant="h2">{branch.name}</Text>
                    {branch.description.length > 0 && (
                      <Text variant="bodySmall" color="textSecondary">
                        {branch.description}
                      </Text>
                    )}
                  </View>
                  <Badge label={meta.label} tone={meta.tone} />
                </View>
                <Text variant="caption" color="textSecondary">
                  {meta.hint}
                </Text>
                {branch.statusReason !== null && (
                  <Text variant="caption" color="error">
                    {branch.statusReason}
                  </Text>
                )}
              </Card>

              <Card style={styles.section}>
                <Text variant="label" color="textSecondary">
                  DETAILS
                </Text>
                <InfoRow label="Food type" value={FOOD_TYPE_LABEL[branch.foodType]} />
                {branch.cuisines.length > 0 && (
                  <InfoRow label="Cuisines" value={branch.cuisines.join(', ')} />
                )}
                <InfoRow label="Avg prep time" value={`${branch.avgPrepMinutes} min`} />
                <InfoRow label="Minimum order" value={formatMoney(branch.minimumOrder)} />
                <InfoRow label="Packaging fee" value={formatMoney(branch.packagingFee)} />
                <InfoRow
                  label="Commission"
                  value={branch.commissionBps !== null ? `${branch.commissionBps / 100}%` : 'Not set yet'}
                />
              </Card>

              {(branch.phoneE164 !== null || branch.email !== null) && (
                <Card style={styles.section}>
                  <Text variant="label" color="textSecondary">
                    CONTACT
                  </Text>
                  {branch.phoneE164 !== null && (
                    <InfoRow label="Phone" value={branch.phoneE164} />
                  )}
                  {branch.email !== null && (
                    <InfoRow label="Email" value={branch.email} />
                  )}
                </Card>
              )}

              {branch.address !== null && (
                <Card style={styles.section}>
                  <Text variant="label" color="textSecondary">
                    ADDRESS
                  </Text>
                  <Text variant="body">
                    {[
                      branch.address.line1,
                      branch.address.line2,
                      branch.address.locality,
                      branch.address.city,
                      branch.address.state,
                      branch.address.postalCode,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </Text>
                </Card>
              )}

              <Card style={styles.section}>
                <Text variant="label" color="textSecondary">
                  SETUP CHECKLIST
                </Text>
                {onboarding.steps.map((step, idx) => (
                  <View key={step.step}>
                    {idx > 0 && <Divider />}
                    <View style={styles.checkRow}>
                      <Icon
                        name={step.complete ? 'checkmark-circle' : 'ellipse-outline'}
                        color={step.complete ? 'primary' : 'textTertiary'}
                        size="sm"
                      />
                      <View style={styles.flex}>
                        <Text variant="body">{STEP_LABEL[step.step] ?? step.step}</Text>
                        {step.hint !== null && (
                          <Text variant="caption" color="textSecondary">
                            {step.hint}
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>
                ))}
              </Card>

              <View style={styles.actions}>
                <Button
                  label="Opening hours"
                  icon="time-outline"
                  variant="outline"
                  onPress={() => router.push('/hours')}
                  style={styles.flex}
                />
                <Button
                  label="Documents"
                  icon="document-text-outline"
                  variant="outline"
                  onPress={() => router.push('/documents')}
                  style={styles.flex}
                />
              </View>
              <Button
                label="Declaration"
                icon="shield-checkmark-outline"
                variant="outline"
                onPress={() => router.push('/declaration')}
                fullWidth
              />
            </ScrollView>
          );
        }}
      </QueryView>
    </Screen>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text variant="caption" color="textSecondary" style={styles.infoLabel}>
        {label}
      </Text>
      <Text variant="body" style={styles.flex}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingHorizontal: screenGutter, paddingBottom: spacing['3xl'] },
  header: { padding: spacing.lg, gap: spacing.sm },
  section: { padding: spacing.lg, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  flex: { flex: 1 },
  infoRow: { flexDirection: 'row', gap: spacing.md },
  infoLabel: { width: 100 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm },
});
