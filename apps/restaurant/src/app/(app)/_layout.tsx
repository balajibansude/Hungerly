import { colors } from '@hungerly/ui';
import { Stack } from 'expo-router';

/**
 * The restaurant workspace: the tab bar plus every detail screen pushed on top of it.
 * Screens live in this folder by feature (orders/, menu/, wallet/, branches/, ...).
 */
export default function WorkspaceLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
