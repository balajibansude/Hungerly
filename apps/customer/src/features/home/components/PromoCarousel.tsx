import { screenGutter, spacing } from '@hungerly/ui';
import { ScrollView, StyleSheet, useWindowDimensions } from 'react-native';

import { OfferBanner } from '@/features/offers/components/OfferBanner';
import type { OfferListing } from '@/services';

/** "Special offers" on Home: the same banners as the Offers tab, in a snapping rail. */
export function PromoCarousel({
  listings,
  onPress,
}: {
  listings: OfferListing[];
  onPress: (listing: OfferListing) => void;
}) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(width - screenGutter * 2 - spacing.xl, 360);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={cardWidth + spacing.md}
      decelerationRate="fast"
      contentContainerStyle={styles.rail}
    >
      {listings.map((listing, index) => (
        <OfferBanner
          key={listing.offer.id}
          listing={listing}
          index={index}
          onPress={() => onPress(listing)}
          style={{ width: cardWidth }}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  rail: { paddingHorizontal: screenGutter, gap: spacing.md },
});
