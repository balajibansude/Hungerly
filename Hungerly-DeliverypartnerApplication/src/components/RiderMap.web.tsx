import { createElement, forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { RiderMapHandle, RiderMapProps } from './RiderMap';
import { MAP_HTML } from './mapHtml';

export type { RiderMapHandle } from './RiderMap';

/** Browser preview: the same Leaflet page as on phones, in a sandboxed iframe (scripts only, no same-origin). */
export const RiderMap = forwardRef<RiderMapHandle, RiderMapProps>(function RiderMap({ rider, pickup, drop, leg, insets = { top: 120, bottom: 280 } }, ref) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const send = (msg: object) => frame.current?.contentWindow?.postMessage(JSON.stringify(msg), '*');

  useImperativeHandle(ref, () => ({ recenter: () => send({ type: 'fit' }) }));

  useEffect(() => {
    const onMsg = (e: MessageEvent) => e.source === frame.current?.contentWindow && e.data === 'ready' && setReady(true);
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const payload = JSON.stringify({ rider, pickup, drop, leg, insets });
  useEffect(() => {
    if (ready) send({ type: 'update', state: JSON.parse(payload) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, payload]);

  return (
    <View style={StyleSheet.absoluteFill}>
      {createElement('iframe', {
        ref: frame,
        srcDoc: MAP_HTML,
        sandbox: 'allow-scripts',
        title: 'Map',
        style: { border: 0, width: '100%', height: '100%', display: 'block' },
      })}
    </View>
  );
});
