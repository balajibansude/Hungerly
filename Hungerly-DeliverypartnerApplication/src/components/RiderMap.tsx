import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { colors } from '@/ui';

import type { LatLng } from '../lib/types';
import { MAP_HTML } from './mapHtml';

export interface RiderMapHandle {
  recenter: () => void;
}

export interface RiderMapProps {
  rider: LatLng | null;
  pickup?: LatLng | null;
  drop?: LatLng | null;
  /** Which leg is active: solid line to it, dashed line for the leg after. */
  leg?: 'pickup' | 'drop' | null;
  /** Space covered by overlays (top bar / bottom sheet) so pins are never hidden. */
  insets?: { top: number; bottom: number };
}

const SOURCE = { html: MAP_HTML, baseUrl: 'https://map.hungerly.invalid/' };

/**
 * Live map (Leaflet + OpenStreetMap tiles in a locked-down WebView). No API key, same rendering in Expo Go
 * on Android and iOS. The page cannot navigate anywhere and has no access to app storage or files.
 */
export const RiderMap = forwardRef<RiderMapHandle, RiderMapProps>(function RiderMap({ rider, pickup, drop, leg, insets = { top: 120, bottom: 280 } }, ref) {
  const web = useRef<WebView>(null);
  const [ready, setReady] = useState(false);

  const send = useCallback((msg: object) => {
    web.current?.injectJavaScript(`window.hg && window.dispatchEvent(new MessageEvent('message', { data: ${JSON.stringify(JSON.stringify(msg))} })); true;`);
  }, []);

  useImperativeHandle(ref, () => ({ recenter: () => send({ type: 'fit' }) }), [send]);

  // Only push when the content changes (callers pass fresh objects every render).
  const payload = JSON.stringify({ rider, pickup, drop, leg, insets });
  useEffect(() => {
    if (ready) send({ type: 'update', state: JSON.parse(payload) });
  }, [ready, payload, send]);

  return (
    <WebView
      ref={web}
      source={SOURCE}
      style={[StyleSheet.absoluteFill, styles.map]}
      containerStyle={StyleSheet.absoluteFill}
      originWhitelist={['https://*']}
      onMessage={(e: WebViewMessageEvent) => e.nativeEvent.data === 'ready' && setReady(true)}
      // Only the embedded page itself may load; taps on links never navigate.
      onShouldStartLoadWithRequest={(req) => req.url.startsWith(SOURCE.baseUrl) || req.url === 'about:blank'}
      javaScriptEnabled
      domStorageEnabled={false}
      allowFileAccess={false}
      allowingReadAccessToURL={undefined}
      setSupportMultipleWindows={false}
      scrollEnabled={false}
      bounces={false}
      overScrollMode="never"
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      cacheEnabled
      androidLayerType="hardware"
      mixedContentMode="never"
    />
  );
});

const styles = StyleSheet.create({
  map: { backgroundColor: colors.surfaceMuted },
});
