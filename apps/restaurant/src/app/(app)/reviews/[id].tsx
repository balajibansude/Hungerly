import { paths, ReviewPageSchema, ReplyToReviewSchema } from '@hungerly/api-client';
import {
  Button,
  Card,
  colors,
  Icon,
  Rating,
  Screen,
  screenGutter,
  ScreenHeader,
  spacing,
  Text,
  TextField,
} from '@hungerly/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { useActiveBranch } from '@/features/branch/useActiveBranch';
import { api } from '@/lib/api';
import { useApiQuery, useMutation } from '@/lib/hooks';
import { QueryView } from '@/features/shell/ScreenState';
import { formatIstDateTime } from '@/features/wallet/format';

export default function ReviewDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { branchId } = useActiveBranch();
  const [replyText, setReplyText] = useState('');
  const [showReply, setShowReply] = useState(false);

  const reviewsQuery = useApiQuery(
    branchId ? paths.partner.reviews(branchId) : null,
    ReviewPageSchema,
  );

  const { run: submitReply, pending: replying, error: replyError } = useMutation(
    async () => {
      if (!branchId || !id) return;
      await api.request('POST', paths.partner.reviewReply(branchId, id), {
        schema: ReplyToReviewSchema,
        body: { body: replyText.trim() },
      });
      reviewsQuery.refetch?.();
      setShowReply(false);
      setReplyText('');
    },
  );

  const { run: reportReview, pending: reporting } = useMutation(async () => {
    if (!branchId || !id) return;
    await api.request('POST', paths.partner.reviewReport(branchId, id), {
      schema: ReplyToReviewSchema,
      body: { reason: 'other', note: null },
    });
    Alert.alert('Reported', 'This review has been flagged for Swaadone to review.');
  });

  const review = reviewsQuery.status === 'success'
    ? reviewsQuery.data.items.find((r) => r.id === id)
    : undefined;

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader onBack={() => router.back()} title="Review" />
      <QueryView query={reviewsQuery} loadingLabel="Loading review">
        {() =>
          !review ? (
            <View style={styles.center}>
              <Text variant="body" color="textSecondary">
                Review not found.
              </Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.content}>
              <Card style={styles.reviewCard}>
                <View style={styles.header}>
                  <View style={styles.avatar}>
                    <Text variant="label" color="onPrimary">
                      {review.customerName[0]?.toUpperCase() ?? '?'}
                    </Text>
                  </View>
                  <View style={styles.flex}>
                    <Text variant="label">{review.customerName}</Text>
                    <Text variant="caption" color="textSecondary">
                      {formatIstDateTime(review.createdAt)}
                    </Text>
                    {review.orderNumber && (
                      <Text variant="caption" color="textSecondary">
                        Order #{review.orderNumber}
                      </Text>
                    )}
                  </View>
                  <Rating rating={{ average: review.rating, count: 0 }} />
                </View>

                {review.comment ? (
                  <Text variant="body">{review.comment}</Text>
                ) : (
                  <Text variant="bodySmall" color="textSecondary">
                    No comment left
                  </Text>
                )}
              </Card>

              {/* Existing reply */}
              {review.reply && (
                <Card style={styles.replyCard}>
                  <View style={styles.replyHeader}>
                    <Icon name="chatbubble-outline" color="primary" />
                    <Text variant="label">Your reply</Text>
                  </View>
                  <Text variant="body">{review.reply.body}</Text>
                  <Text variant="caption" color="textSecondary">
                    {formatIstDateTime(review.reply.createdAt)}
                  </Text>
                </Card>
              )}

              {/* Reply form */}
              {!review.reply && (
                showReply ? (
                  <Card style={styles.replyForm}>
                    <TextField
                      label="Your reply"
                      value={replyText}
                      onChangeText={setReplyText}
                      multiline
                      numberOfLines={4}
                      placeholder="Thank the customer or address their feedback..."
                    />
                    {replyError && (
                      <Text variant="caption" color="error">
                        {replyError}
                      </Text>
                    )}
                    <View style={styles.replyActions}>
                      <Button
                        label="Cancel"
                        variant="outline"
                        onPress={() => setShowReply(false)}
                        style={styles.flex}
                      />
                      <Button
                        label="Submit reply"
                        onPress={() => submitReply()}
                        loading={replying}
                        disabled={replyText.trim().length < 2}
                        style={styles.flex}
                      />
                    </View>
                  </Card>
                ) : (
                  <Button
                    label="Reply to review"
                    variant="outline"
                    icon="chatbubble-outline"
                    onPress={() => setShowReply(true)}
                    fullWidth
                  />
                )
              )}

              {!review.reported && (
                <Button
                  label="Report this review"
                  variant="ghost"
                  icon="flag-outline"
                  onPress={() => reportReview()}
                  loading={reporting}
                  fullWidth
                />
              )}
            </ScrollView>
          )
        }
      </QueryView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingHorizontal: screenGutter, paddingBottom: spacing['3xl'] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  reviewCard: { padding: spacing.lg, gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  flex: { flex: 1 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  replyCard: { padding: spacing.lg, gap: spacing.sm, backgroundColor: colors.primarySoft },
  replyHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  replyForm: { padding: spacing.lg, gap: spacing.md },
  replyActions: { flexDirection: 'row', gap: spacing.sm },
});
