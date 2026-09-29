import { Button, RemoteImage, Screen, screenGutter, spacing, Text } from '@hungerly/ui';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View, type FlatList } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';

import { PageDots } from '@/features/auth/components/PageDots';
import { onboardingSlides, type OnboardingSlide } from '@/features/auth/onboardingSlides';
import { useSessionStore } from '@/features/auth/session';

export default function OnboardingScreen() {
  const { width, height } = useWindowDimensions();
  const listRef = useRef<FlatList<OnboardingSlide>>(null);
  const [page, setPage] = useState(0);
  const progress = useSharedValue(0);
  const completeOnboarding = useSessionStore((s) => s.completeOnboarding);

  const isLast = page === onboardingSlides.length - 1;
  // Image height adapts to the device so text and buttons always fit on small phones.
  const imageHeight = Math.min(height * 0.46, width * 1.1);

  const onScroll = useAnimatedScrollHandler((event) => {
    progress.set(event.contentOffset.x / width);
  });

  const finish = () => {
    completeOnboarding();
    router.replace('/');
  };

  const next = () => {
    if (isLast) return finish();
    listRef.current?.scrollToIndex({ index: page + 1, animated: true });
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        {!isLast && (
          <Pressable
            onPress={finish}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Skip introduction"
          >
            <Text variant="label" color="textSecondary">
              Skip
            </Text>
          </Pressable>
        )}
      </View>

      <Animated.FlatList
        ref={listRef}
        style={styles.pager}
        data={onboardingSlides}
        keyExtractor={(slide) => slide.key}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(event) =>
          setPage(Math.round(event.nativeEvent.contentOffset.x / width))
        }
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        renderItem={({ item, index }) => (
          <View
            style={[styles.slide, { width }]}
            accessible
            accessibilityLabel={`${item.title}. ${item.body}. Step ${index + 1} of ${onboardingSlides.length}`}
          >
            <RemoteImage
              image={item.image}
              decorative
              radius="modal"
              style={{ height: imageHeight }}
            />
            <View style={styles.copy}>
              <Text variant="display">{item.title}</Text>
              <Text variant="bodyLarge" color="textSecondary">
                {item.body}
              </Text>
            </View>
          </View>
        )}
      />

      <View style={styles.footer}>
        <PageDots count={onboardingSlides.length} progress={progress} />
        <Button
          label={isLast ? 'Get started' : 'Next'}
          icon={isLast ? undefined : 'arrow-forward'}
          iconPosition="end"
          onPress={next}
          style={styles.cta}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    minHeight: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: screenGutter,
  },
  pager: { flex: 1 },
  slide: { paddingHorizontal: screenGutter, gap: spacing['2xl'] },
  copy: { gap: spacing.md },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenGutter,
    paddingVertical: spacing.lg,
  },
  cta: { minWidth: 148 },
});
