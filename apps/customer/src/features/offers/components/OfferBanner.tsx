import { PromoBanner } from '@hungerly/ui';
import type { StyleProp, ViewStyle } from 'react-native';

import type { OfferListing } from '@/services';

import { bannerToneAt, offerBannerContent, type OfferStatus } from '../offerDetails';

const statusPrefix: Record<OfferStatus, string> = {
  active: '',
  upcoming: 'Starts soon · ',
  expired: 'Expired · ',
};

/** One offer as a large promotional banner. Inactive offers are muted and say why. */
export function OfferBanner({
  listing,
  index,
  status = 'active',
  onPress,
  style,
}: {
  listing: OfferListing;
  /** Position in the list; picks the banner colour. */
  index: number;
  status?: OfferStatus;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const content = offerBannerContent(listing);
  return (
    <PromoBanner
      tone={bannerToneAt(index)}
      headline={content.headline}
      kicker={content.kicker}
      title={`${statusPrefix[status]}${content.title}`}
      subtitle={content.subtitle}
      footnote={content.footnote}
      image={listing.restaurant?.image}
      muted={status !== 'active'}
      onPress={onPress}
      accessibilityLabel={`${statusPrefix[status]}${content.accessibilityLabel}`}
      style={style}
    />
  );
}
