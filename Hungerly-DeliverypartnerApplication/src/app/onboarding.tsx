import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { LogoMark } from '@/components/Logo';
import { api, errorMessage } from '@/lib/api';
import { VEHICLES } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { Partner, VehicleType, Zone } from '@/lib/types';
import { Button, Chip, colors, Icon, PressableScale, radius, Screen, screenGutter, spacing, Text, TextField } from '@/ui';

const REG_RE = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/;
const DL_RE = /^[A-Z]{2}[0-9]{2}[ -]?[0-9]{11}$/;

export default function Onboarding() {
  const partner = useSession((s) => s.partner);
  const setPartner = useSession((s) => s.setPartner);
  const signOut = useSession((s) => s.signOut);
  const zones = useQuery({ queryKey: ['zones'], queryFn: () => api<Zone[]>('/delivery/zones') });

  const [name, setName] = useState(partner?.full_name ?? '');
  const [vehicle, setVehicle] = useState<VehicleType | null>(partner?.vehicle_type ?? null);
  const [reg, setReg] = useState('');
  const [dl, setDl] = useState('');
  const [zone, setZone] = useState<string | null>(partner?.zone_id ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const motor = vehicle !== null && vehicle !== 'bicycle';
  const regClean = reg.toUpperCase().replace(/[\s-]/g, '');
  const dlClean = dl.toUpperCase().trim();
  const errors = {
    name: name.trim().length < 2 ? 'Enter your full name as on your ID' : undefined,
    reg: motor && !REG_RE.test(regClean) ? 'Format like MH12AB1234' : undefined,
    dl: motor && !DL_RE.test(dlClean) ? 'Format like MH12 20190012345' : undefined,
  };
  const valid = !errors.name && vehicle && zone && !errors.reg && !errors.dl;

  const submit = async () => {
    setTouched(true);
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api<Partner>('/delivery/onboarding', {
        method: 'POST',
        body: {
          full_name: name.trim(),
          vehicle_type: vehicle,
          vehicle_registration: motor ? regClean : null,
          driving_license_number: motor ? dlClean : null,
          zone_id: zone,
        },
      });
      setPartner(updated);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Animated.View entering={FadeInDown.duration(400)} style={styles.head}>
            <LogoMark size={44} />
            <Text variant="h1" accessibilityRole="header">Your details</Text>
            <Text variant="body" color="textSecondary">We verify every partner before the first delivery.</Text>
          </Animated.View>

          {partner?.status === 'rejected' && (
            <View style={styles.alert}>
              <Icon name="alert-circle" color="error" />
              <View style={styles.flex}>
                <Text variant="label" color="error">Your last application needs changes</Text>
                <Text variant="bodySmall" color="error">{partner.status_reason ?? 'Please check your details and submit again.'}</Text>
              </View>
            </View>
          )}

          <TextField
            label="Full name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            textContentType="name"
            maxLength={120}
            errorText={touched ? errors.name : undefined}
          />

          <View style={styles.group}>
            <Text variant="label">Vehicle</Text>
            <View style={styles.vehicles}>
              {VEHICLES.map((v) => {
                const on = vehicle === v.value;
                return (
                  <PressableScale
                    key={v.value}
                    onPress={() => setVehicle(v.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={v.label}
                    style={[styles.vehicle, on && styles.vehicleOn]}
                  >
                    <Icon name={v.icon} size="lg" color={on ? 'primary' : 'textSecondary'} />
                    <Text variant="label" color={on ? 'primary' : 'textPrimary'}>{v.label}</Text>
                  </PressableScale>
                );
              })}
            </View>
            {touched && !vehicle && <Text variant="caption" color="error">Choose your vehicle</Text>}
          </View>

          {motor && (
            <Animated.View entering={FadeInDown.duration(300)} style={styles.group}>
              <TextField
                label="Vehicle registration number"
                value={reg}
                onChangeText={setReg}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={13}
                placeholder="MH12AB1234"
                errorText={touched ? errors.reg : undefined}
              />
              <TextField
                label="Driving licence number"
                value={dl}
                onChangeText={setDl}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={16}
                placeholder="MH12 20190012345"
                errorText={touched ? errors.dl : undefined}
              />
            </Animated.View>
          )}

          <View style={styles.group}>
            <Text variant="label">Delivery zone</Text>
            <View style={styles.chips}>
              {zones.data?.map((z) => <Chip key={z.id} label={z.name} selected={zone === z.id} icon="location-outline" onPress={() => setZone(z.id)} />)}
              {zones.isLoading && <Text variant="bodySmall" color="textTertiary">Loading zones…</Text>}
            </View>
            {touched && !zone && <Text variant="caption" color="error">Choose a delivery zone</Text>}
          </View>

          {error && <Text variant="bodySmall" color="error">{error}</Text>}
          <View style={styles.spacer} />
          <Button label="Submit" onPress={submit} loading={busy} fullWidth />
          <Button label="Sign out" variant="ghost" onPress={() => void signOut()} fullWidth />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, gap: spacing.xl, paddingHorizontal: screenGutter, paddingTop: spacing['2xl'], paddingBottom: spacing.lg },
  head: { gap: spacing.sm },
  alert: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.errorSoft },
  group: { gap: spacing.md },
  vehicles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  vehicle: {
    width: '47%',
    flexGrow: 1,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    gap: spacing.sm,
  },
  vehicleOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  spacer: { flex: 1, minHeight: spacing.md },
});
