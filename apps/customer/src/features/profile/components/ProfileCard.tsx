import type { User } from '@hungerly/types';
import { Button, colors, Icon, minTouchTarget, radius, spacing, Text } from '@hungerly/ui';
import { formatE164India } from '@hungerly/utils';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

const AVATAR_SIZE = 64;

function initialOf(name: string | null | undefined): string {
  return name?.trim().charAt(0).toUpperCase() ?? '';
}

function ProfileAvatar({ name }: { name?: string | null }) {
  const initial = initialOf(name);
  return (
    <View style={styles.avatar} accessible accessibilityRole="image" accessibilityLabel="Profile">
      {initial ? (
        <Text variant="h1" color="primaryText">
          {initial}
        </Text>
      ) : (
        <Icon name="person" size="xl" color="textTertiary" />
      )}
    </View>
  );
}

/**
 * Who is signed in, with the summary grid underneath. Guests see why an account helps
 * and the way to log in, instead of an empty profile.
 */
export function ProfileCard({
  user,
  onEdit,
  onLogin,
  summary,
}: {
  user: User | undefined;
  onEdit: () => void;
  onLogin: () => void;
  summary: ReactNode;
}) {
  return (
    <View style={styles.card}>
      {user ? (
        <View style={styles.identity}>
          <ProfileAvatar name={user.fullName} />
          <View style={styles.flex}>
            <Text variant="h2" numberOfLines={2}>
              {user.fullName ?? 'Add your name'}
            </Text>
            <View style={styles.phone}>
              <Icon name="call-outline" size="sm" color="textSecondary" />
              <Text variant="body" color="textSecondary">
                {formatE164India(user.phoneE164)}
              </Text>
              {/* Only when the auth system confirmed the number by OTP — never assumed. */}
              {user.phoneVerifiedAt && (
                <View style={styles.verified} accessible accessibilityLabel="Verified phone number">
                  <Icon name="checkmark-circle" size="sm" color="success" />
                  <Text variant="caption" color="success">
                    Verified
                  </Text>
                </View>
              )}
            </View>
            {user.email && (
              <Text variant="bodySmall" color="textSecondary" numberOfLines={1}>
                {user.email}
              </Text>
            )}
          </View>
          <Pressable
            onPress={onEdit}
            accessibilityRole="button"
            accessibilityLabel="Edit profile"
            hitSlop={spacing.xs}
            style={({ pressed }) => [styles.edit, pressed && styles.editPressed]}
            testID="edit-profile"
          >
            <Icon name="pencil" color="primary" />
          </Pressable>
        </View>
      ) : (
        <View style={styles.guest}>
          <View style={styles.identity}>
            <ProfileAvatar />
            <View style={styles.flex}>
              <Text variant="h2">Hello, guest</Text>
              <Text variant="bodySmall" color="textSecondary">
                Log in to place orders, track deliveries and save favourites.
              </Text>
            </View>
          </View>
          <Button label="Log in or sign up" icon="log-in-outline" onPress={onLogin} fullWidth />
        </View>
      )}
      {summary}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  guest: { gap: spacing.lg },
  flex: { flex: 1, gap: spacing.xxs },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  phone: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
  verified: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  edit: {
    width: minTouchTarget,
    height: minTouchTarget,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primarySoftBorder,
    backgroundColor: colors.primarySoft,
  },
  editPressed: { backgroundColor: colors.primarySoftBorder },
});
