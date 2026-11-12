import { DeclarationAcceptanceSchema, DeclarationStatusSchema, paths } from '@hungerly/api-client';
import {
  Badge,
  Button,
  Card,
  Screen,
  screenGutter,
  ScreenHeader,
  spacing,
  Text,
} from '@hungerly/ui';
import { router } from 'expo-router';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { useActiveBranch } from '@/features/branch/useActiveBranch';
import { api } from '@/lib/api';
import { useApiQuery, useMutation } from '@/lib/hooks';
import { QueryView } from '@/features/shell/ScreenState';
import { formatIstDateTime } from '@/features/wallet/format';

export default function DeclarationScreen() {
  const { branchId } = useActiveBranch();
  const query = useApiQuery(
    branchId ? paths.partner.branchDeclaration(branchId) : null,
    DeclarationStatusSchema,
  );

  const { run: accept, pending: accepting } = useMutation(async () => {
    if (!branchId) return;
    const { current } = query.data ?? {};
    if (!current) return;
    Alert.alert(
      'Accept declaration',
      'By accepting, you confirm that you have read and agree to all terms.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: async () => {
            await api.request('POST', paths.partner.branchDeclaration(branchId), {
              schema: DeclarationAcceptanceSchema,
              body: { version: current.version, textSha256: current.textSha256 },
            });
            query.refetch?.();
          },
        },
      ],
    );
  });

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader onBack={() => router.back()} title="Restaurant declaration" />
      <QueryView query={query} loadingLabel="Loading declaration">
        {({ current, acceptance }) => {
          const accepted = acceptance !== null && acceptance.isCurrentVersion;
          return (
            <ScrollView contentContainerStyle={styles.content}>
              <Card style={styles.header}>
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <Text variant="h2">{current.title}</Text>
                    <Text variant="caption" color="textSecondary">
                      Version {current.version}
                    </Text>
                  </View>
                  {accepted ? (
                    <Badge label="Accepted" tone="success" />
                  ) : (
                    <Badge label="Pending" tone="warning" />
                  )}
                </View>
                {accepted && acceptance !== null && (
                  <Text variant="bodySmall" color="textSecondary">
                    Accepted on {formatIstDateTime(acceptance.acceptedAt)}
                  </Text>
                )}
                {acceptance !== null && !acceptance.isCurrentVersion && (
                  <Text variant="caption" color="warning">
                    A new version of the declaration is available. Please review and accept it.
                  </Text>
                )}
              </Card>

              {current.clauses.map((clause, idx) => (
                <Card key={idx} style={styles.clause}>
                  <Text variant="label">{clause.heading}</Text>
                  <Text variant="bodySmall" color="textSecondary">
                    {clause.body}
                  </Text>
                </Card>
              ))}

              {!accepted && (
                <Button
                  label="Accept declaration"
                  icon="checkmark-circle-outline"
                  onPress={() => accept()}
                  loading={accepting}
                  fullWidth
                />
              )}
            </ScrollView>
          );
        }}
      </QueryView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingHorizontal: screenGutter, paddingBottom: spacing['3xl'] },
  header: { padding: spacing.lg, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  flex: { flex: 1, gap: spacing.xs },
  clause: { padding: spacing.lg, gap: spacing.sm },
});
