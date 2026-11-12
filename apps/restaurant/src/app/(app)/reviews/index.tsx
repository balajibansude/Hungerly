import { paths, ReviewPageSchema, ReviewSummarySchema, type Review } from '@hungerly/api-client';
import {
  Card,
  colors,
  EmptyState,
  Rating,
  Screen,
  screenGutter,
  ScreenHeader,
  spacing,
  Text,
} from '@hungerly/ui';
import { router } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';

import { useActiveBranch } from '@/features/branch/useActiveBranch';
import { useApiQuery } from '@/lib/hooks';
import { QueryView } from '@/features/shell/ScreenState';
import { formatIstDateTime } from '@/features/wallet/format';

function StarBar({ stars, count, total }: { stars: number; count: number; total: number }) {
  const pct = total > 0 ? count / total : 0;
  return (
    <View style={styles.starBar} accessibilityLabel={`${stars} stars: ${count}`}>
      <Text variant="caption" color="textSecondary" style={styles.starLabel}>
        {stars}
      </Text>
      <View style={styles.barBg}>
        <View style={[styles.barFill, { flex: pct }]} />
        <View style={{ flex: 1 - pct }} />
      </View>
      <Text variant="caption" color="textSecondary" style={styles.starCount}>
        {count}
      </Text>
    </View>
  );
}

function ReviewRow({ review }: { review: Review }) {
  return (
    <Card
      onPress={() => router.push({ pathname: '/reviews/[id]', params: { id: review.id } })}
      style={styles.reviewCard}
    >
      <View style={styles.reviewTop}>
        <View style={styles.avatar}>
          <Text variant="label" color="onPrimary">
            {review.customerName[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
        <View style={styles.flex}>
          <Text variant="label">{review.customerName}</Text>
          <Text variant="caption" color="textSecondary">
            {formatIstDateTime(review.createdAt)}
            {review.orderNumber ? ` · #${review.orderNumber}` : ''}
          </Text>
        </View>
        <Rating rating={{ average: review.rating, count: 0 }} size="sm" />
      </View>
      {review.comment && (
        <Text variant="bodySmall" color="textSecondary" numberOfLines={2}>
          {review.comment}
        </Text>
      )}
      {review.reply && (
        <View style={styles.replyBadge}>
          <Text variant="caption" color="textSecondary">
            You replied
          </Text>
        </View>
      )}
    </Card>
  );
}

/** Reviews list with rating distribution at the top. */
export default function ReviewsScreen() {
  const { branchId } = useActiveBranch();
  const summaryQuery = useApiQuery(
    branchId ? paths.partner.reviewSummary(branchId) : null,
    ReviewSummarySchema,
  );
  const reviewsQuery = useApiQuery(
    branchId ? paths.partner.reviews(branchId) : null,
    ReviewPageSchema,
  );

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader
        onBack={() => router.back()}
        title="Reviews"
      />
      <QueryView query={reviewsQuery} loadingLabel="Loading reviews">
        {(page) => (
          <FlatList
            data={page.items}
            keyExtractor={(r) => r.id}
            contentContainerStyle={styles.content}
            ListHeaderComponent={
              summaryQuery.status === 'success' ? (
                <Card style={styles.summaryCard}>
                  <View style={styles.summaryRow}>
                    <View style={styles.avgBlock}>
                      <Text variant="display">
                        {summaryQuery.data.average?.toFixed(1) ?? '—'}
                      </Text>
                      <Text variant="caption" color="textSecondary">
                        {summaryQuery.data.count} ratings
                      </Text>
                    </View>
                    <View style={styles.bars}>
                      {([5, 4, 3, 2, 1] as const).map((s) => (
                        <StarBar
                          key={s}
                          stars={s}
                          count={summaryQuery.data.distribution[s]}
                          total={summaryQuery.data.count}
                        />
                      ))}
                    </View>
                  </View>
                  {summaryQuery.data.unanswered > 0 && (
                    <Text variant="caption" color="warning">
                      {summaryQuery.data.unanswered} unanswered{' '}
                      {summaryQuery.data.unanswered === 1 ? 'review' : 'reviews'}
                    </Text>
                  )}
                </Card>
              ) : undefined
            }
            ListEmptyComponent={
              <EmptyState
                icon="star-outline"
                title="No reviews yet"
                message="Reviews from customers will appear here."
              />
            }
            renderItem={({ item }) => <ReviewRow review={item} />}
          />
        )}
      </QueryView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingHorizontal: screenGutter, paddingBottom: spacing['3xl'] },
  summaryCard: { padding: spacing.lg, gap: spacing.sm },
  summaryRow: { flexDirection: 'row', gap: spacing.lg, alignItems: 'center' },
  avgBlock: { alignItems: 'center', gap: spacing.xs, minWidth: 64 },
  bars: { flex: 1, gap: spacing.xs },
  starBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  starLabel: { width: 12, textAlign: 'right' },
  barBg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.border, flexDirection: 'row', overflow: 'hidden' },
  barFill: { backgroundColor: colors.primary },
  starCount: { width: 24, textAlign: 'right' },
  reviewCard: { padding: spacing.lg, gap: spacing.sm },
  reviewTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  flex: { flex: 1 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  replyBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    backgroundColor: colors.successSoft,
  },
});
