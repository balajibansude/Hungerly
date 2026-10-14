import { colors, Icon, spacing, typography, type IconName } from '@hungerly/ui';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Matches the customer app: React Navigation's default height clips 12/16 caption labels. */
const TAB_BAR_HEIGHT = 60;

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
 * Five destinations around the owner's day: Home (dashboard) · Orders · Menu · Wallet ·
 * More. Wallet replaces the former Insights tab; earnings analytics live inside Wallet.
 * Everything else (branches, hours, documents, offers, reviews, settings) is under More.
 */
export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primaryText,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarLabelStyle: {
          fontFamily: typography.caption.fontFamily,
          fontSize: typography.caption.fontSize,
          lineHeight: typography.caption.lineHeight,
        },
        tabBarStyle: {
          height: TAB_BAR_HEIGHT + insets.bottom,
          paddingTop: spacing.xs,
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{ title: 'Home', tabBarIcon: tabIcon('home', 'home-outline') }}
      />
      <Tabs.Screen
        name="orders"
        options={{ title: 'Orders', tabBarIcon: tabIcon('receipt', 'receipt-outline') }}
      />
      <Tabs.Screen
        name="menu"
        options={{ title: 'Menu', tabBarIcon: tabIcon('restaurant', 'restaurant-outline') }}
      />
      <Tabs.Screen
        name="wallet"
        options={{ title: 'Wallet', tabBarIcon: tabIcon('wallet', 'wallet-outline') }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: tabIcon('ellipsis-horizontal-circle', 'ellipsis-horizontal-circle-outline'),
        }}
      />
    </Tabs>
  );
}
