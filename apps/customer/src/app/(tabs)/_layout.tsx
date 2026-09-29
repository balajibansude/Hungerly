import { colors, Icon, typography, type IconName } from '@hungerly/ui';
import { Tabs } from 'expo-router';

function tabIcon(active: IconName, inactive: IconName) {
  return function TabIcon({ focused }: { focused: boolean }) {
    return (
      <Icon
        name={focused ? active : inactive}
        size="lg"
        color={focused ? 'primary' : 'textTertiary'}
      />
    );
  };
}

/**
 * Four destinations only: Home, Search, Orders, Account. The cart is not a tab — it is a
 * floating bar that appears when it has items, so it never competes for attention empty.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarLabelStyle: {
          fontFamily: typography.caption.fontFamily,
          fontSize: typography.caption.fontSize,
        },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{ title: 'Home', tabBarIcon: tabIcon('home', 'home-outline') }}
      />
      <Tabs.Screen
        name="search"
        options={{ title: 'Search', tabBarIcon: tabIcon('search', 'search-outline') }}
      />
      <Tabs.Screen
        name="orders"
        options={{ title: 'Orders', tabBarIcon: tabIcon('receipt', 'receipt-outline') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Account', tabBarIcon: tabIcon('person', 'person-outline') }}
      />
    </Tabs>
  );
}
