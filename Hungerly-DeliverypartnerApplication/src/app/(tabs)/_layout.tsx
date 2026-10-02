import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fontFamily, Icon, type IconName } from '@/ui';

const TABS: { name: string; title: string; icon: IconName; active: IconName }[] = [
  { name: 'home', title: 'Home', icon: 'map-outline', active: 'map' },
  { name: 'earnings', title: 'Earnings', icon: 'wallet-outline', active: 'wallet' },
  { name: 'history', title: 'Trips', icon: 'time-outline', active: 'time' },
  { name: 'profile', title: 'Profile', icon: 'person-outline', active: 'person' },
];

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarLabelStyle: { fontFamily: fontFamily.semibold, fontSize: 11, lineHeight: 14 },
        tabBarIconStyle: { marginBottom: 2 },
        // Height follows the device's safe area so gesture-navigation phones never overlap the labels.
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 64 + Math.max(insets.bottom, 8),
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 8),
        },
        sceneStyle: { backgroundColor: colors.background },
        animation: 'shift',
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarIcon: ({ focused }) => <Icon name={focused ? t.active : t.icon} size="lg" color={focused ? 'primary' : 'textTertiary'} />,
          }}
        />
      ))}
    </Tabs>
  );
}
