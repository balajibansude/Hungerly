import { Button, colors, Icon, radius, spacing, Text, TextField } from '@hungerly/ui';
import * as Location from 'expo-location';
import { useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type LatLng } from 'react-native-maps';

import { INDIA_REGION, isValidPoint, streetRegion, type MapPoint } from './location';

interface LocationPickerProps {
  /** The selected pin, or nulls while nothing is selected. */
  latitude: number | null;
  longitude: number | null;
  onChange: (point: MapPoint) => void;
  /** Prefills the search box (for example from the address typed above). */
  suggestedQuery: string;
  /** Validation message from the step, e.g. when continuing without a pin. */
  errorText?: string;
  /** True while a finger is on the map, so the parent ScrollView can stop scrolling. */
  onInteractionChange?: (active: boolean) => void;
}

/**
 * Search for the restaurant, then fine-tune with a draggable pin (or tap the map).
 * Google Maps on Android; iOS uses Apple Maps unless a Google Maps iOS key is configured
 * (see app.config.ts). Search uses the device geocoder, so no Places API key is needed.
 */
export function LocationPicker({
  latitude,
  longitude,
  onChange,
  suggestedQuery,
  errorText,
  onInteractionChange,
}: LocationPickerProps) {
  const mapRef = useRef<MapView>(null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  const pin = { latitude, longitude };
  const selected = isValidPoint(pin) ? pin : null;
  const searchText = query.trim() || suggestedQuery.trim();

  const select = (point: LatLng, zoom: boolean) => {
    onChange({ latitude: point.latitude, longitude: point.longitude });
    if (zoom) mapRef.current?.animateToRegion(streetRegion(point), 500);
  };

  const search = async () => {
    if (!searchText || searching) return;
    setSearchError('');
    setSearching(true);
    try {
      // Android's geocoder needs location permission; only the search uses it, never GPS.
      if (Platform.OS === 'android') {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setSearchError('Allow location access to search, or tap the map and drag the pin to your restaurant.');
          return;
        }
      }
      const [first] = await Location.geocodeAsync(searchText);
      if (!first) {
        setSearchError('No place found. Try a nearby landmark or area, or move the pin yourself.');
        return;
      }
      select({ latitude: first.latitude, longitude: first.longitude }, true);
    } catch {
      setSearchError('Search is not available right now. Tap the map and drag the pin to your restaurant.');
    } finally {
      setSearching(false);
    }
  };

  return (
    <View style={styles.container}>
      <TextField
        label="Search for your restaurant"
        value={query}
        onChangeText={(v) => { setQuery(v); setSearchError(''); }}
        placeholder={suggestedQuery || 'Area, street or landmark'}
        returnKeyType="search"
        onSubmitEditing={search}
        autoCorrect={false}
      />
      <Button
        label="Find on map"
        icon="search-outline"
        variant="outline"
        onPress={search}
        loading={searching}
        disabled={!searchText}
        fullWidth
      />
      {searchError ? <Text variant="bodySmall" color="error">{searchError}</Text> : null}

      <View
        style={[styles.mapFrame, errorText ? styles.mapFrameError : null]}
        onTouchStart={() => onInteractionChange?.(true)}
        onTouchEnd={() => onInteractionChange?.(false)}
        onTouchCancel={() => onInteractionChange?.(false)}
      >
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          initialRegion={selected ? streetRegion(selected) : INDIA_REGION}
          onPress={(e) => select(e.nativeEvent.coordinate, false)}
          toolbarEnabled={false}
          accessibilityLabel="Map. Tap to place your restaurant pin, then drag it to the exact spot."
        >
          {selected && (
            <Marker
              coordinate={selected}
              draggable
              onDragEnd={(e) => select(e.nativeEvent.coordinate, false)}
              pinColor={colors.primary}
              title="Your restaurant"
            />
          )}
        </MapView>
      </View>

      {selected ? (
        <View style={styles.selectedRow}>
          <Icon name="location" color="success" size="sm" />
          <Text variant="bodySmall" color="success">
            Pinned at {selected.latitude.toFixed(6)}, {selected.longitude.toFixed(6)} · drag the pin to adjust
          </Text>
        </View>
      ) : (
        <Text variant="bodySmall" color={errorText ? 'error' : 'textSecondary'}>
          {errorText ?? 'Search, or tap the map to drop a pin, then drag it onto your entrance.'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  mapFrame: {
    height: 280,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  mapFrameError: { borderColor: colors.error },
  selectedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
