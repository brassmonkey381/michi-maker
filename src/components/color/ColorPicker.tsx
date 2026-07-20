/**
 * Building blocks for the search-by-color picker:
 *   · GradientMixBar — a Photoshop-style gradient bar with up to 3 draggable color STOPS. A stop's
 *     POSITION sets that color's weight (each owns the bar region to the midpoints of its
 *     neighbours, so weights always sum to 1). Drag a stop to reweight; tap one to edit its color.
 *   · HsvColorPicker — a continuous color picker (hue bar + saturation/value square) for any color.
 * Cross-platform (web + native) via the RN responder system + expo-linear-gradient; no extra deps.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';

import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';

export type RGB = [number, number, number];
export interface Stop {
  pos: number; // 0..1 along the bar
  rgb: RGB;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const rgbToHex = ([r, g, b]: RGB) =>
  '#' + [r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');

export function hsvToRgb(h: number, s: number, v: number): RGB {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

export function rgbToHsv([r, g, b]: RGB): { h: number; s: number; v: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn), d = max - min;
  let h = 0;
  if (d) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

/** Per-stop weight from positions: each stop owns the region to its neighbours' midpoints (sum = 1). */
export function stopWeights(stops: Stop[]): number[] {
  const order = stops.map((s, i) => ({ pos: s.pos, i })).sort((a, b) => a.pos - b.pos);
  const bounds = [0];
  for (let k = 0; k < order.length - 1; k += 1) bounds.push((order[k].pos + order[k + 1].pos) / 2);
  bounds.push(1);
  const w = new Array(stops.length).fill(0);
  order.forEach((o, k) => {
    w[o.i] = bounds[k + 1] - bounds[k];
  });
  return w;
}

/** The gradient bar + draggable stops. Touching/dragging a stop makes it ACTIVE (highlighted +
 *  edited by the HSV picker); the active stop is enlarged with a pulsing glow. */
export function GradientMixBar({
  stops,
  active,
  onChange,
  onActive,
}: {
  stops: Stop[];
  active: number;
  onChange: (stops: Stop[]) => void;
  onActive: (index: number) => void;
}) {
  const [w, setW] = useState(0);
  const dragging = useRef(-1);

  // Pulsing glow on the active stop (JS-driven so it also animates opacity/scale on web).
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 750, useNativeDriver: false }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  const nearest = (x: number) => {
    let best = 0, bd = Infinity;
    stops.forEach((s, i) => {
      const d = Math.abs(s.pos * w - x);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  };
  const move = (i: number, x: number) =>
    onChange(stops.map((s, j) => (j === i ? { ...s, pos: clamp01(w > 0 ? x / w : 0) } : s)));

  const sorted = [...stops].sort((a, b) => a.pos - b.pos);
  const colors = sorted.map((s) => rgbToHex(s.rgb)) as [string, string, ...string[]];
  const locations = sorted.map((s) => clamp01(s.pos)) as [number, number, ...number[]];
  const act = stops[active];

  return (
    <View style={styles.barWrap}>
      <LinearGradient
        colors={colors.length >= 2 ? colors : [colors[0] ?? '#000', colors[0] ?? '#000']}
        locations={locations.length >= 2 ? locations : undefined}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.bar}
      />
      <View
        style={styles.thumbRow}
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e: GestureResponderEvent) => {
          const x = e.nativeEvent.locationX;
          dragging.current = nearest(x);
          onActive(dragging.current);
          move(dragging.current, x);
        }}
        onResponderMove={(e: GestureResponderEvent) => {
          if (dragging.current >= 0) move(dragging.current, e.nativeEvent.locationX);
        }}
        onResponderRelease={() => {
          dragging.current = -1;
        }}>
        {act ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.glow,
              {
                left: `${clamp01(act.pos) * 100}%`,
                backgroundColor: rgbToHex(act.rgb),
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.6] }),
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1.3, 2.0] }) }],
              },
            ]}
          />
        ) : null}
        {stops.map((s, i) => (
          <View
            key={i}
            style={[
              i === active ? styles.thumbActive : styles.thumb,
              { left: `${clamp01(s.pos) * 100}%`, backgroundColor: rgbToHex(s.rgb) },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

/** Continuous HSV picker: hue bar + saturation/value square. Emits RGB live. */
export function HsvColorPicker({ rgb, onChange, onClose }: { rgb: RGB; onChange: (rgb: RGB) => void; onClose?: () => void }) {
  const init = rgbToHsv(rgb);
  const [h, setH] = useState(init.h);
  const [s, setS] = useState(init.s);
  const [v, setV] = useState(init.v);
  const [sq, setSq] = useState({ w: 0, h: 0 });
  const [hueW, setHueW] = useState(0);

  const emit = (nh: number, ns: number, nv: number) => {
    setH(nh); setS(ns); setV(nv);
    onChange(hsvToRgb(nh, ns, nv));
  };
  const HUE: [string, string, ...string[]] = ['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ff0000'];

  return (
    <View style={styles.pickerCard}>
      {/* Saturation (x) / Value (y) square */}
      <View
        style={styles.sv}
        onLayout={(e) => setSq({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => emit(h, clamp01(e.nativeEvent.locationX / (sq.w || 1)), 1 - clamp01(e.nativeEvent.locationY / (sq.h || 1)))}
        onResponderMove={(e) => emit(h, clamp01(e.nativeEvent.locationX / (sq.w || 1)), 1 - clamp01(e.nativeEvent.locationY / (sq.h || 1)))}>
        <LinearGradient colors={['#ffffff', rgbToHex(hsvToRgb(h, 1, 1))]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['rgba(0,0,0,0)', '#000000']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
        <View pointerEvents="none" style={[styles.svThumb, { left: `${s * 100}%`, top: `${(1 - v) * 100}%` }]} />
      </View>

      {/* Hue bar */}
      <View
        style={styles.hue}
        onLayout={(e) => setHueW(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => emit(clamp01(e.nativeEvent.locationX / (hueW || 1)) * 360, s, v)}
        onResponderMove={(e) => emit(clamp01(e.nativeEvent.locationX / (hueW || 1)) * 360, s, v)}>
        <LinearGradient colors={HUE} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
        <View pointerEvents="none" style={[styles.hueThumb, { left: `${(h / 360) * 100}%` }]} />
      </View>

      <View style={styles.pickerFooter}>
        <View style={[styles.preview, { backgroundColor: rgbToHex(hsvToRgb(h, s, v)) }]} />
        <Text style={styles.hex}>{rgbToHex(hsvToRgb(h, s, v)).toUpperCase()}</Text>
        {onClose ? (
          <Text onPress={onClose} style={styles.done} accessibilityRole="button">
            Done
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  barWrap: { gap: 6 },
  bar: { height: 26, borderRadius: Radius.control, borderWidth: 1, borderColor: Palette.hairline },
  thumbRow: { height: 34, marginHorizontal: 0, justifyContent: 'center' },
  thumb: {
    position: 'absolute',
    width: 18,
    height: 18,
    marginLeft: -9,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: Palette.surface,
    top: 8,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 1 },
  },
  thumbActive: {
    position: 'absolute',
    width: 28,
    height: 28,
    marginLeft: -14,
    borderRadius: 7,
    borderWidth: 3,
    borderColor: Palette.ink,
    top: 3,
    zIndex: 2,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  glow: {
    position: 'absolute',
    width: 30,
    height: 30,
    marginLeft: -15,
    borderRadius: 15,
    top: 2,
  },
  pickerCard: { gap: Spacing.two, marginTop: Spacing.one, marginBottom: Spacing.three },
  sv: { width: '100%', height: 150, borderRadius: Radius.control, overflow: 'hidden', borderWidth: 1, borderColor: Palette.hairline },
  svThumb: { position: 'absolute', width: 14, height: 14, marginLeft: -7, marginTop: -7, borderRadius: 7, borderWidth: 2, borderColor: '#fff' },
  hue: { width: '100%', height: 20, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: Palette.hairline },
  hueThumb: { position: 'absolute', width: 4, marginLeft: -2, top: 0, bottom: 0, backgroundColor: '#fff', borderWidth: 1, borderColor: '#000' },
  pickerFooter: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  preview: { width: 22, height: 22, borderRadius: 4, borderWidth: 1, borderColor: Palette.hairline },
  hex: { flex: 1, fontSize: FontSize.label, fontWeight: Weight.semibold, color: Palette.ink2, fontVariant: ['tabular-nums'] },
  done: { fontSize: FontSize.control, fontWeight: Weight.bold, color: Palette.accent, paddingHorizontal: Spacing.two },
});
