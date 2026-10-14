import {
  Badge,
  Button,
  Card,
  EmptyState,
  Screen,
  screenGutter,
  ScreenHeader,
  spacing,
  Text,
} from '@hungerly/ui';
import { router } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';

import { useSessionStore } from '@/features/auth/session';
import { branchStatusMeta } from '@/features/branch/status';

export default function BranchListScreen() {
  const branches = useSessionStore((s) => s.session?.branches ?? []);

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader onBack={() => router.back()} title="Your branches" />
      <FlatList
        data={branches}
        keyExtractor={(b) => b.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <Button
            label="Add new branch"
            icon="add"
            onPress={() => router.push('/branches/new')}
            style={styles.addBtn}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="storefront-outline"
            title="No branches yet"
            message="Your branches will appear here after setup."
          />
        }
        renderItem={({ item: branch }) => {
          const meta = branchStatusMeta[branch.status];
          return (
            <Card
              onPress={() =>
                router.push({ pathname: '/branches/[id]', params: { id: branch.id } })
              }
              style={styles.card}
            >
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Text variant="label">{branch.name}</Text>
                  {(branch.locality ?? branch.city) && (
                    <Text variant="caption" color="textSecondary">
                      {[branch.locality, branch.city].filter(Boolean).join(', ')}
                    </Text>
                  )}
                  <Text variant="caption" color="textSecondary">
                    {meta.hint}
                  </Text>
                </View>
                <Badge label={meta.label} tone={meta.tone} />
              </View>
            </Card>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.sm, paddingHorizontal: screenGutter, paddingBottom: spacing['3xl'] },
  addBtn: { marginBottom: spacing.sm },
  card: { padding: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  flex: { flex: 1, gap: spacing.xs },
});
