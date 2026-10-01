import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors } from '../theme/colors';
import { radius, screenGutter, spacing } from '../theme/layout';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

interface MessageProps {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

function Message({
  icon,
  tone,
  title,
  message,
  actionLabel,
  onAction,
}: MessageProps & {
  icon: IconName;
  tone: 'neutral' | 'error';
}) {
  return (
    <View style={styles.container} accessibilityLiveRegion="polite">
      <View style={[styles.iconCircle, tone === 'error' && styles.errorCircle]}>
        <Icon name={icon} size="xl" color={tone === 'error' ? 'error' : 'primary'} />
      </View>
      <Text variant="h3" align="center" accessibilityRole="header">
        {title}
      </Text>
      {message && (
        <Text variant="body" color="textSecondary" align="center">
          {message}
        </Text>
      )}
      {actionLabel && onAction && (
        <Button
          label={actionLabel}
          onPress={onAction}
          variant="outline"
          size="md"
          style={styles.action}
        />
      )}
    </View>
  );
}

export interface EmptyStateProps extends MessageProps {
  icon?: IconName;
}

/** Nothing to show yet: explains why and offers the one most useful next step. */
export function EmptyState({ icon = 'restaurant-outline', ...rest }: EmptyStateProps) {
  return <Message icon={icon} tone="neutral" {...rest} />;
}

export interface ErrorStateProps extends Partial<MessageProps> {
  onRetry?: () => void;
}

/** Recoverable failure with a retry. Messages stay human; codes go to logs. */
export function ErrorState({
  title = 'Something went wrong',
  message = 'Please check your connection and try again.',
  onRetry,
  actionLabel = 'Try again',
}: ErrorStateProps) {
  return (
    <Message
      icon="cloud-offline-outline"
      tone="error"
      title={title}
      message={message}
      actionLabel={onRetry ? actionLabel : undefined}
      onAction={onRetry}
    />
  );
}

/** Generic centred spinner. Prefer skeletons for lists and cards. */
export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <View
      style={styles.container}
      accessible
      accessibilityLabel={label}
      accessibilityRole="progressbar"
    >
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: screenGutter + spacing.lg,
    paddingVertical: spacing['4xl'],
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    marginBottom: spacing.sm,
  },
  errorCircle: { backgroundColor: colors.errorSoft },
  action: { marginTop: spacing.md },
});
