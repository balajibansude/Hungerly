import { colors, Icon, radius, spacing, Text, type IconName } from '@hungerly/ui';
import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import { summaryAccessibilityLabel, summaryValue, type SummarySource } from '../summary';

export interface SummaryItem {
  key: string;
  icon: IconName;
  label: string;
  source: SummarySource;
}

/** Four equal cells (Orders · Wallet · Offers · Saved) in a soft accent panel. */
export function SummaryGrid({ items }: { items: SummaryItem[] }) {
  return (
    <View style={styles.panel}>
      {items.map((item, index) => (
        <Fragment key={item.key}>
          {index > 0 && <View style={styles.separator} />}
          <View
            style={styles.cell}
            accessible
            accessibilityLabel={summaryAccessibilityLabel(item.label, item.source)}
            testID={`summary-${item.key}`}
          >
            <Icon name={item.icon} color="primary" />
            <Text variant="h3" numberOfLines={1} adjustsFontSizeToFit>
              {summaryValue(item.source)}
            </Text>
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              {item.label}
            </Text>
          </View>
        </Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primarySoftBorder,
    backgroundColor: colors.primarySoft,
  },
  cell: { flex: 1, alignItems: 'center', gap: spacing.xxs, paddingHorizontal: spacing.xs },
  separator: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: colors.primarySoftBorder,
  },
});
