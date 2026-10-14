import { DocumentsResponseSchema, paths } from '@hungerly/api-client';
import {
  Badge,
  Card,
  Divider,
  EmptyState,
  Screen,
  screenGutter,
  ScreenHeader,
  spacing,
  Text,
} from '@hungerly/ui';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useActiveBranch } from '@/features/branch/useActiveBranch';
import { useApiQuery } from '@/lib/hooks';
import { QueryView } from '@/features/shell/ScreenState';
import { formatIstDateTime } from '@/features/wallet/format';

const TYPE_LABEL: Record<string, string> = {
  fssai_license: 'FSSAI Licence',
  bank_proof: 'Bank proof',
  gst_certificate: 'GST certificate',
  pan_card: 'PAN card',
  shop_establishment: 'Shop establishment',
  other: 'Other document',
};

const STATE_TONE = {
  not_submitted: 'neutral',
  pending_review: 'info',
  approved: 'success',
  resubmission_required: 'error',
  expired: 'warning',
} as const;

const STATE_LABEL = {
  not_submitted: 'Not submitted',
  pending_review: 'In review',
  approved: 'Approved',
  resubmission_required: 'Resubmission needed',
  expired: 'Expired',
} as const;

const DOC_STATUS_TONE = {
  pending_review: 'info',
  approved: 'success',
  rejected: 'error',
  expired: 'warning',
  superseded: 'neutral',
} as const;

export default function DocumentsScreen() {
  const { branchId } = useActiveBranch();
  const query = useApiQuery(
    branchId ? paths.partner.documents(branchId) : null,
    DocumentsResponseSchema,
  );

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader onBack={() => router.back()} title="Licence & documents" />
      <QueryView query={query} loadingLabel="Loading documents">
        {({ requirements, history }) => (
          <ScrollView contentContainerStyle={styles.content}>
            <Card style={styles.notice}>
              <Text variant="label">Uploading documents</Text>
              <Text variant="bodySmall" color="textSecondary">
                To upload or replace a document, contact Swaadone partner support. Include the
                document type and your branch name.
              </Text>
            </Card>

            <Text variant="h3">Requirements</Text>
            {requirements.length === 0 ? (
              <EmptyState
                icon="document-text-outline"
                title="No documents required"
                message="No document requirements are configured for this branch."
              />
            ) : (
              <Card style={styles.list}>
                {requirements.map((req, idx) => (
                  <View key={req.type}>
                    {idx > 0 && <Divider />}
                    <View style={styles.reqRow}>
                      <View style={styles.flex}>
                        <View style={styles.titleRow}>
                          <Text variant="label">
                            {TYPE_LABEL[req.type] ?? req.type}
                          </Text>
                          {req.required && (
                            <Text variant="caption" color="error">
                              Required
                            </Text>
                          )}
                        </View>
                        {req.current !== null && (
                          <Text variant="caption" color="textSecondary">
                            {req.current.fileName}
                            {req.current.documentNumber !== null ? ` · ${req.current.documentNumber}` : ''}
                            {req.current.expiresOn !== null ? ` · Expires ${req.current.expiresOn}` : ''}
                          </Text>
                        )}
                        {req.nextAction !== null && (
                          <Text variant="caption" color="textSecondary">
                            {req.nextAction}
                          </Text>
                        )}
                        {req.current?.rejectionReason !== null && req.current?.rejectionReason && (
                          <Text variant="caption" color="error">
                            {req.current.rejectionReason}
                          </Text>
                        )}
                      </View>
                      <Badge
                        label={STATE_LABEL[req.state]}
                        tone={STATE_TONE[req.state]}
                      />
                    </View>
                  </View>
                ))}
              </Card>
            )}

            {history.length > 0 && (
              <>
                <Text variant="h3">Upload history</Text>
                <Card style={styles.list}>
                  {history.map((doc, idx) => (
                    <View key={doc.id}>
                      {idx > 0 && <Divider />}
                      <View style={styles.reqRow}>
                        <View style={styles.flex}>
                          <Text variant="label">{TYPE_LABEL[doc.type] ?? doc.type}</Text>
                          <Text variant="caption" color="textSecondary">
                            {doc.fileName} · {formatIstDateTime(doc.submittedAt)}
                          </Text>
                          {doc.rejectionReason !== null && (
                            <Text variant="caption" color="error">
                              {doc.rejectionReason}
                            </Text>
                          )}
                        </View>
                        <Badge
                          label={doc.status.replace('_', ' ')}
                          tone={DOC_STATUS_TONE[doc.status]}
                        />
                      </View>
                    </View>
                  ))}
                </Card>
              </>
            )}
          </ScrollView>
        )}
      </QueryView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingHorizontal: screenGutter, paddingBottom: spacing['3xl'] },
  notice: { padding: spacing.lg, gap: spacing.xs },
  list: { gap: 0 },
  reqRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.lg },
  flex: { flex: 1, gap: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
