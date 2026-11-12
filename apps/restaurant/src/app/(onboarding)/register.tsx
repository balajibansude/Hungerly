/**
 * Seven-step restaurant registration wizard.
 * State lives in the parent RegisterScreen (lifted state pattern).
 * API calls happen at each step's "Continue" action.
 *
 * DEV NOTE: In prototype/mock mode, all OTP codes accept 123456 and
 * document uploads are simulated. No real network requests are made.
 */

import {
  BranchDetailSchema,
  BusinessSchema,
  DeclarationAcceptanceSchema,
  DeclarationStatusSchema,
  HoursResponseSchema,
  OtpChallengeSchema,
  PartnerSessionSchema,
  PayoutAccountResponseSchema,
  paths,
  SignInResponseSchema,
} from '@hungerly/api-client';
import {
  Badge,
  Button,
  Card,
  Chip,
  colors,
  Divider,
  Icon,
  OtpInput,
  radius,
  Screen,
  screenGutter,
  ScreenHeader,
  spacing,
  SwitchRow,
  Text,
  TextField,
} from '@hungerly/ui';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  type TextInputInstance,
  View,
} from 'react-native';

import { resumableBranch, useSessionStore } from '@/features/auth/session';
import { ensureBusiness } from '@/features/onboarding/business';
import { LocationPicker } from '@/features/onboarding/LocationPicker';
import { addressSearchText, mapPinLocation } from '@/features/onboarding/location';
import { daysFromSessions, saveOperations } from '@/features/onboarding/operations';
import { buildPayoutAccountBody } from '@/features/onboarding/payoutAccount';
import { uploadBranchDocument } from '@/features/onboarding/uploadDocument';
import { IS_PROTOTYPE_MODE, api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { useApiQuery, useMutation } from '@/lib/hooks';

/**
 * Picker options for upload documents. On Android the picker's default copy lands in
 * `cache/DocumentPicker/`, outside the app's file-system sandbox in Expo Go, so expo-file-system
 * refuses to read it ("Missing 'READ' permission"). Keeping the picker's own content:// URI uses
 * the read grant the system picker gave us. iOS copies into the app's scoped cache, which is readable.
 */
const DOCUMENT_PICKER_OPTIONS: DocumentPicker.DocumentPickerOptions = {
  type: ['application/pdf', 'image/jpeg', 'image/png', 'image/*'],
  copyToCacheDirectory: Platform.OS !== 'android',
};

// ─── Types ───────────────────────────────────────────────────────────────────

type DayOfWeek =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

interface DayHours {
  day: DayOfWeek;
  label: string;
  isOpen: boolean;
  opensAt: string;
  closesAt: string;
  /** Optional break, saved as two sessions for the day (open–break start, break end–close). */
  hasBreak: boolean;
  breakStart: string;
  breakEnd: string;
}

interface S1 {
  restaurantName: string;
  logoUri: string | null;
  coverUri: string | null;
  restaurantType: string;
  cuisines: string[];
  description: string;
  foodType: 'veg_only' | 'mixed';
  hasJainFood: boolean;
}

interface S2 {
  ownerName: string;
  ownerEmail: string;
  ownerRole: string;
  additionalPhone: string;
  additionalPhoneVerified: boolean;
}

interface S3 {
  country: string;
  state: string;
  city: string;
  pinCode: string;
  addressLine1: string;
  addressLine2: string;
  locality: string;
  landmark: string;
  latitude: number | null;
  longitude: number | null;
  deliveryRadiusKm: string;
  offerPickup: boolean;
}

interface S4 {
  hours: DayHours[];
  avgPrepMinutes: number;
  offersDelivery: boolean;
  offersTakeaway: boolean;
  offersDineIn: boolean;
  minOrderAmount: string;
}

interface S5 {
  fssaiNumber: string;
  fssaiDocUri: string | null;
  fssaiDocName: string | null;
  panNumber: string;
  businessType: string;
  gstin: string;
  gstDocUri: string | null;
  gstDocName: string | null;
}

interface S6 {
  accountHolderName: string;
  bankAccountNumber: string;
  confirmAccountNumber: string;
  ifscCode: string;
  bankDocUri: string | null;
  bankDocName: string | null;
}

interface S7 {
  termsAccepted: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CUISINES = [
  'North Indian', 'South Indian', 'Chinese', 'Italian', 'Fast Food',
  'Biryani', 'Street Food', 'Snacks', 'Bakery', 'Beverages',
  'Desserts', 'Pizza', 'Burger', 'Rolls', 'Thali', 'Seafood', 'Continental',
];

const RESTAURANT_TYPES = [
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'cafe', label: 'Café' },
  { value: 'dhaba', label: 'Dhaba' },
  { value: 'bakery', label: 'Bakery' },
  { value: 'cloud_kitchen', label: 'Cloud Kitchen' },
  { value: 'food_truck', label: 'Food Truck' },
];

const OWNER_ROLES = [
  { value: 'owner', label: 'Owner' },
  { value: 'manager', label: 'Manager' },
  { value: 'partner', label: 'Partner' },
  { value: 'authorized_rep', label: 'Authorized Rep.' },
];

const ENTITY_OPTIONS = [
  { value: 'individual', label: 'Sole proprietor' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'llp', label: 'LLP' },
  { value: 'company', label: 'Company' },
  { value: 'other', label: 'Other' },
];

const PREP_OPTIONS = [10, 15, 20, 25, 30, 40, 45, 60] as const;

const DAYS_OF_WEEK: { day: DayOfWeek; label: string }[] = [
  { day: 'monday', label: 'Monday' },
  { day: 'tuesday', label: 'Tuesday' },
  { day: 'wednesday', label: 'Wednesday' },
  { day: 'thursday', label: 'Thursday' },
  { day: 'friday', label: 'Friday' },
  { day: 'saturday', label: 'Saturday' },
  { day: 'sunday', label: 'Sunday' },
];

const DEFAULT_HOURS: DayHours[] = DAYS_OF_WEEK.map(({ day, label }) => ({
  day,
  label,
  isOpen: day !== 'sunday',
  opensAt: '11:00',
  closesAt: '23:00',
  hasBreak: false,
  breakStart: '15:00',
  breakEnd: '17:00',
}));

const TOTAL_STEPS = 7;

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: number }) {
  return (
    <View style={progressStyles.bar}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <View
          key={i}
          style={[progressStyles.segment, i < step && progressStyles.filled]}
        />
      ))}
    </View>
  );
}

const progressStyles = StyleSheet.create({
  bar: { flexDirection: 'row', height: 4, backgroundColor: colors.border, gap: 2 },
  segment: { flex: 1, backgroundColor: colors.border },
  filled: { backgroundColor: colors.primary },
});

// ─── Step 1: Restaurant Details ───────────────────────────────────────────────

interface Step1Props {
  data: S1;
  onChange: (d: S1) => void;
  /** Branch already created by an earlier pass through this step ('' if none). */
  branchId: string;
  /** Records a newly created branch at once, so a failed later request never re-creates it. */
  onBranchCreated: (branchId: string) => void;
  onNext: (branchId: string) => Promise<void>;
}

function Step1({ data, onChange, branchId, onBranchCreated, onNext }: Step1Props) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { run, pending, error: apiError } = useMutation(async () => {
    const errs: Record<string, string> = {};
    if (data.restaurantName.trim().length < 2) errs.name = 'Restaurant name must be at least 2 characters.';
    if (data.cuisines.length === 0) errs.cuisines = 'Select at least one cuisine.';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});

    const name = data.restaurantName.trim();
    // Branch routes need the owner's business, so make sure it exists first. Coming back to
    // this step reuses the branch already created instead of creating a duplicate.
    let id = branchId;
    if (!id) {
      await ensureBusiness(api, name);
      const created = await api.request('POST', paths.partner.branches, {
        schema: BranchDetailSchema,
        body: { name },
      });
      id = created.branch.id;
      onBranchCreated(id);
    }
    if (branchId || data.description.trim() || data.cuisines.length || data.foodType) {
      await api.request('PATCH', paths.partner.branch(id), {
        schema: BranchDetailSchema,
        body: {
          ...(branchId ? { name } : {}),
          description: data.description.trim() || undefined,
          cuisines: data.cuisines.length ? data.cuisines : undefined,
          foodType: data.foodType,
        },
      });
    }
    await onNext(id);
  });

  const pickImage = async (field: 'logoUri' | 'coverUri') => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      onChange({ ...data, [field]: result.assets[0].uri });
    }
  };

  const toggleCuisine = (c: string) => {
    const next = data.cuisines.includes(c)
      ? data.cuisines.filter((x) => x !== c)
      : data.cuisines.length < 8
        ? [...data.cuisines, c]
        : data.cuisines;
    onChange({ ...data, cuisines: next });
    if (next.length) setErrors((e) => ({ ...e, cuisines: '' }));
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.stepHeader}>
          <Text variant="label" color="textSecondary">STEP 1 OF {TOTAL_STEPS}</Text>
          <Text variant="h2">Restaurant details</Text>
          <Text variant="body" color="textSecondary">Tell us about your restaurant.</Text>
        </View>

        <TextField
          label="Restaurant name"
          value={data.restaurantName}
          onChangeText={(v) => { onChange({ ...data, restaurantName: v }); setErrors((e) => ({ ...e, name: '' })); }}
          placeholder="e.g. Masala Kitchen"
          maxLength={80}
          returnKeyType="done"
          errorText={errors.name}
          autoFocus
        />

        {/* Images */}
        <Card style={styles.card}>
          <Text variant="label">Photos (optional)</Text>
          <View style={styles.imageRow}>
            <Pressable style={styles.imagePicker} onPress={() => pickImage('logoUri')} accessibilityRole="button" accessibilityLabel="Add logo">
              {data.logoUri ? (
                <Image source={{ uri: data.logoUri }} style={styles.imagePreview} contentFit="cover" />
              ) : (
                <View style={styles.imagePlaceholder}>
                  <Icon name="storefront-outline" color="textSecondary" />
                  <Text variant="caption" color="textSecondary">Logo</Text>
                </View>
              )}
            </Pressable>
            <Pressable style={[styles.imagePicker, styles.imagePickerWide]} onPress={() => pickImage('coverUri')} accessibilityRole="button" accessibilityLabel="Add cover photo">
              {data.coverUri ? (
                <Image source={{ uri: data.coverUri }} style={styles.imagePreview} contentFit="cover" />
              ) : (
                <View style={styles.imagePlaceholder}>
                  <Icon name="image-outline" color="textSecondary" />
                  <Text variant="caption" color="textSecondary">Cover photo</Text>
                </View>
              )}
            </Pressable>
          </View>
        </Card>

        {/* Restaurant type */}
        <Card style={styles.card}>
          <Text variant="label">Restaurant type</Text>
          <View style={styles.chipWrap}>
            {RESTAURANT_TYPES.map((t) => (
              <Chip
                key={t.value}
                label={t.label}
                selected={data.restaurantType === t.value}
                onPress={() => onChange({ ...data, restaurantType: t.value })}
              />
            ))}
          </View>
        </Card>

        {/* Cuisines */}
        <Card style={styles.card}>
          <Text variant="label">Cuisines (pick up to 8)</Text>
          <View style={styles.chipWrap}>
            {CUISINES.map((c) => (
              <Chip
                key={c}
                label={c}
                selected={data.cuisines.includes(c)}
                onPress={() => toggleCuisine(c)}
              />
            ))}
          </View>
          {errors.cuisines ? <Text variant="caption" color="error">{errors.cuisines}</Text> : null}
        </Card>

        <TextField
          label="Description (optional)"
          value={data.description}
          onChangeText={(v) => onChange({ ...data, description: v })}
          placeholder="Tell customers what makes your restaurant special..."
          maxLength={500}
          multiline
          numberOfLines={3}
        />

        {/* Food type */}
        <Card style={styles.card}>
          <Text variant="label">Food served</Text>
          <View style={styles.chipRow}>
            <Chip label="Veg only" selected={data.foodType === 'veg_only'} onPress={() => onChange({ ...data, foodType: 'veg_only' })} />
            <Chip label="Veg & Non-Veg" selected={data.foodType === 'mixed'} onPress={() => onChange({ ...data, foodType: 'mixed' })} />
          </View>
        </Card>

        <Card style={styles.card}>
          <SwitchRow
            label="Jain food available"
            description="We cater to Jain dietary requirements"
            value={data.hasJainFood}
            onValueChange={(v) => onChange({ ...data, hasJainFood: v })}
          />
        </Card>

        {apiError ? <Text variant="caption" color="error" align="center">{apiError}</Text> : null}

        <Button label="Continue" onPress={() => run()} loading={pending} fullWidth />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Step 2: Owner Information ────────────────────────────────────────────────

type OtpState = 'idle' | 'sending' | 'sent' | 'verifying' | 'verified';

interface Step2Props {
  data: S2;
  onChange: (d: S2) => void;
  branchId: string;
  onNext: () => Promise<void>;
}

function Step2({ data, onChange, branchId, onNext }: Step2Props) {
  const signInPhone = useSessionStore((s) => s.session?.user.phoneE164 ?? null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [otpState, setOtpState] = useState<OtpState>('idle');
  const [otpRequestId, setOtpRequestId] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState('');
  const otpInputRef = useRef<TextInputInstance>(null);

  const { run, pending, error: apiError } = useMutation(async () => {
    const errs: Record<string, string> = {};
    if (data.ownerName.trim().length < 2) errs.ownerName = 'Enter your full name.';
    if (!data.ownerEmail.trim().match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) errs.ownerEmail = 'Enter a valid email address.';
    // Submission requires a contact phone on the branch: the verified extra number, else the sign-in number.
    const contactPhone = data.additionalPhoneVerified ? `+91${data.additionalPhone}` : signInPhone;
    if (!contactPhone) errs.additionalPhone = 'Add and verify a mobile number customers and riders can reach.';
    if (Object.keys(errs).length || !contactPhone) { setErrors(errs); if (errs.additionalPhone) setOtpError(errs.additionalPhone); return; }
    setErrors({});

    // The profile endpoint only takes the name; the email is saved as the branch contact.
    await api.request('PATCH', paths.partner.me, {
      schema: PartnerSessionSchema,
      body: { fullName: data.ownerName.trim() },
    });
    await api.request('PATCH', paths.partner.branch(branchId), {
      schema: BranchDetailSchema,
      body: { phoneE164: contactPhone, email: data.ownerEmail.trim() },
    });
    await onNext();
  });

  const sendAdditionalOtp = async () => {
    if (!data.additionalPhone.match(/^[6-9]\d{9}$/)) {
      setOtpError('Enter a valid 10-digit mobile number starting with 6–9.');
      return;
    }
    setOtpError('');
    setOtpState('sending');
    try {
      const challenge = await api.request('POST', paths.auth.otpRequest, {
        schema: OtpChallengeSchema,
        anonymous: true,
        body: { channel: 'phone', phoneE164: `+91${data.additionalPhone}` },
      });
      setOtpRequestId(challenge.requestId);
      setOtpState('sent');
      setTimeout(() => otpInputRef.current?.focus(), 200);
    } catch (e) {
      setOtpError(errorMessage(e));
      setOtpState('idle');
    }
  };

  const verifyAdditionalOtp = async (code = otpCode) => {
    if (code.length !== 6) return;
    setOtpState('verifying');
    setOtpError('');
    try {
      await api.request('POST', paths.auth.otpVerify, {
        schema: SignInResponseSchema,
        anonymous: true,
        body: { requestId: otpRequestId, code },
      });
      onChange({ ...data, additionalPhoneVerified: true });
      setOtpState('verified');
    } catch (e) {
      setOtpError(errorMessage(e));
      setOtpCode('');
      setOtpState('sent');
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.stepHeader}>
          <Text variant="label" color="textSecondary">STEP 2 OF {TOTAL_STEPS}</Text>
          <Text variant="h2">Owner information</Text>
          <Text variant="body" color="textSecondary">Tell us who's responsible for this restaurant.</Text>
        </View>

        <TextField
          label="Your full name"
          value={data.ownerName}
          onChangeText={(v) => { onChange({ ...data, ownerName: v }); setErrors((e) => ({ ...e, ownerName: '' })); }}
          placeholder="e.g. Rahul Sharma"
          errorText={errors.ownerName}
          textContentType="name"
          autoComplete="name"
        />

        <TextField
          label="Email address"
          value={data.ownerEmail}
          onChangeText={(v) => { onChange({ ...data, ownerEmail: v }); setErrors((e) => ({ ...e, ownerEmail: '' })); }}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="emailAddress"
          autoComplete="email"
          errorText={errors.ownerEmail}
        />

        <Card style={styles.card}>
          <Text variant="label">Your role</Text>
          <View style={styles.chipWrap}>
            {OWNER_ROLES.map((r) => (
              <Chip
                key={r.value}
                label={r.label}
                selected={data.ownerRole === r.value}
                onPress={() => onChange({ ...data, ownerRole: r.value })}
              />
            ))}
          </View>
        </Card>

        <Divider />

        <Card style={styles.card}>
          <Text variant="label">Additional contact number</Text>
          <Text variant="bodySmall" color="textSecondary">Optional – a second number for our team to reach you.</Text>

          {otpState !== 'verified' ? (
            <>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <TextField
                    label="Mobile number"
                    value={data.additionalPhone}
                    onChangeText={(v) => { onChange({ ...data, additionalPhone: v.replace(/\D/g, '') }); setOtpError(''); }}
                    keyboardType="phone-pad"
                    maxLength={10}
                    placeholder="98765 43210"
                    leading={<Text variant="bodyLarge" color="textSecondary">+91</Text>}
                    editable={otpState === 'idle'}
                  />
                </View>
                {data.additionalPhone.length === 10 && otpState === 'idle' && (
                  <Button
                    label="Send OTP"
                    variant="outline"
                    onPress={sendAdditionalOtp}
                    style={styles.sendOtpBtn}
                  />
                )}
                {otpState === 'sending' && (
                  <Button label="Sending…" variant="outline" loading onPress={() => {}} style={styles.sendOtpBtn} />
                )}
              </View>

              {otpState === 'sent' || otpState === 'verifying' ? (
                <View style={styles.otpSection}>
                  {IS_PROTOTYPE_MODE && (
                    <Badge tone="warning" icon="construct-outline" label="Dev mode: use OTP 123456" />
                  )}
                  <OtpInput
                    ref={otpInputRef}
                    value={otpCode}
                    onChange={(v) => { setOtpCode(v); setOtpError(''); }}
                    onComplete={verifyAdditionalOtp}
                    length={6}
                    hasError={Boolean(otpError)}
                  />
                  <Button
                    label="Verify number"
                    onPress={() => verifyAdditionalOtp()}
                    loading={otpState === 'verifying'}
                    disabled={otpCode.length !== 6}
                    fullWidth
                  />
                </View>
              ) : null}
              {otpError ? <Text variant="bodySmall" color="error">{otpError}</Text> : null}
            </>
          ) : (
            <View style={styles.row}>
              <Text variant="body">+91 {data.additionalPhone}</Text>
              <Badge tone="success" icon="checkmark-circle-outline" label="Verified" />
            </View>
          )}
        </Card>

        <Card style={[styles.card, styles.infoCard]}>
          <View style={styles.row}>
            <Icon name="information-circle-outline" color="primary" />
            <Text variant="bodySmall" color="textSecondary" style={styles.flex}>
              Identity documents (PAN card, Aadhaar) will be requested in the Business Verification step.
            </Text>
          </View>
        </Card>

        {apiError ? <Text variant="caption" color="error" align="center">{apiError}</Text> : null}
        <Button label="Continue" onPress={() => run()} loading={pending} fullWidth />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Step 3: Restaurant Address ───────────────────────────────────────────────

interface Step3Props {
  data: S3;
  onChange: (d: S3) => void;
  branchId: string;
  onNext: () => Promise<void>;
}

function Step3({ data, onChange, branchId, onNext }: Step3Props) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  // While a finger is on the map, the page must not scroll (so pans and pin drags work).
  const [mapActive, setMapActive] = useState(false);

  const { run, pending, error: apiError } = useMutation(async () => {
    const errs: Record<string, string> = {};
    if (data.state.trim().length < 2) errs.state = 'Enter your state.';
    if (data.city.trim().length < 2) errs.city = 'Enter your city.';
    if (!/^[1-9]\d{5}$/.test(data.pinCode.trim())) errs.pinCode = 'Enter a valid 6-digit PIN code.';
    if (data.addressLine1.trim().length < 3) errs.addressLine1 = 'Enter your address.';
    if (data.locality.trim().length < 2) errs.locality = 'Enter your locality/area.';
    const locationBody = mapPinLocation(data);
    if (!locationBody) errs.location = 'Pin your restaurant on the map to continue.';
    if (Object.keys(errs).length || !locationBody) { setErrors(errs); return; }
    setErrors({});

    await api.request('PATCH', paths.partner.branch(branchId), {
      schema: BranchDetailSchema,
      body: {
        address: {
          line1: data.addressLine1.trim(),
          line2: data.addressLine2.trim() || null,
          locality: data.locality.trim(),
          city: data.city.trim(),
          state: data.state.trim(),
          postalCode: data.pinCode.trim(),
        },
        location: locationBody,
      },
    });
    await onNext();
  });

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" scrollEnabled={!mapActive}>
        <View style={styles.stepHeader}>
          <Text variant="label" color="textSecondary">STEP 3 OF {TOTAL_STEPS}</Text>
          <Text variant="h2">Restaurant address</Text>
          <Text variant="body" color="textSecondary">Where customers and riders will find you.</Text>
        </View>

        <TextField label="Country" value={data.country} onChangeText={(v) => onChange({ ...data, country: v })} placeholder="India" />
        <TextField label="State" value={data.state} onChangeText={(v) => { onChange({ ...data, state: v }); setErrors((e) => ({ ...e, state: '' })); }} placeholder="Maharashtra" errorText={errors.state} />
        <TextField label="City" value={data.city} onChangeText={(v) => { onChange({ ...data, city: v }); setErrors((e) => ({ ...e, city: '' })); }} placeholder="Pune" errorText={errors.city} />
        <TextField label="PIN code" value={data.pinCode} onChangeText={(v) => { onChange({ ...data, pinCode: v.replace(/\D/g, '') }); setErrors((e) => ({ ...e, pinCode: '' })); }} keyboardType="numeric" maxLength={6} placeholder="411001" errorText={errors.pinCode} />
        <TextField label="Address line 1" value={data.addressLine1} onChangeText={(v) => { onChange({ ...data, addressLine1: v }); setErrors((e) => ({ ...e, addressLine1: '' })); }} placeholder="Building, street, area" errorText={errors.addressLine1} />
        <TextField label="Address line 2 (optional)" value={data.addressLine2} onChangeText={(v) => onChange({ ...data, addressLine2: v })} placeholder="Floor, landmark" />
        <TextField label="Locality / Area" value={data.locality} onChangeText={(v) => { onChange({ ...data, locality: v }); setErrors((e) => ({ ...e, locality: '' })); }} placeholder="e.g. Koregaon Park" errorText={errors.locality} />
        <TextField label="Landmark (optional)" value={data.landmark} onChangeText={(v) => onChange({ ...data, landmark: v })} placeholder="Near XYZ Mall" />

        {/* Map location (required) */}
        <Card style={styles.card}>
          <Text variant="label">Pin your restaurant on the map</Text>
          <Text variant="bodySmall" color="textSecondary">Customers and delivery partners are guided to this exact spot.</Text>
          <LocationPicker
            latitude={data.latitude}
            longitude={data.longitude}
            onChange={(point) => {
              onChange({ ...data, latitude: point.latitude, longitude: point.longitude });
              setErrors((e) => ({ ...e, location: '' }));
            }}
            suggestedQuery={addressSearchText(data)}
            errorText={errors.location || undefined}
            onInteractionChange={setMapActive}
          />
        </Card>

        <TextField
          label="Delivery radius (km)"
          value={data.deliveryRadiusKm}
          onChangeText={(v) => onChange({ ...data, deliveryRadiusKm: v.replace(/[^0-9.]/g, '') })}
          keyboardType="decimal-pad"
          placeholder="5"
          helperText="Approximate area you serve"
        />

        <Card style={styles.card}>
          <SwitchRow
            label="Offer pickup"
            description="Customers can pick up orders from your location"
            value={data.offerPickup}
            onValueChange={(v) => onChange({ ...data, offerPickup: v })}
          />
        </Card>

        {apiError ? <Text variant="caption" color="error" align="center">{apiError}</Text> : null}
        <Button label="Continue" onPress={() => run()} loading={pending} fullWidth />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Step 4: Operating Information ───────────────────────────────────────────

interface Step4Props {
  data: S4;
  onChange: (d: S4) => void;
  branchId: string;
  onNext: () => Promise<void>;
}

function Step4({ data, onChange, branchId, onNext }: Step4Props) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const updateHour = (day: DayOfWeek, field: keyof DayHours, value: boolean | string) => {
    onChange({
      ...data,
      hours: data.hours.map((h) => (h.day === day ? { ...h, [field]: value } : h)),
    });
    setErrors((e) => ({ ...e, hours: '' }));
  };

  const { run, pending, error: apiError } = useMutation(async () => {
    const result = await saveOperations(api, branchId, data);
    if (!result.ok) { setErrors(result.errors); return; }
    setErrors({});
    await onNext();
  });

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.stepHeader}>
          <Text variant="label" color="textSecondary">STEP 4 OF {TOTAL_STEPS}</Text>
          <Text variant="h2">Operating information</Text>
          <Text variant="body" color="textSecondary">Set your hours and the services you offer.</Text>
        </View>

        {/* Hours */}
        <Text variant="label">Opening hours</Text>
        <Card style={styles.card}>
          {data.hours.map((h, i) => (
            <View key={h.day}>
              {i > 0 && <Divider />}
              <SwitchRow
                label={h.label}
                value={h.isOpen}
                onValueChange={(v) => updateHour(h.day, 'isOpen', v)}
              />
              {h.isOpen && (
                <View style={styles.daySchedule}>
                  <TextField
                    label="Opening time"
                    value={h.opensAt}
                    onChangeText={(v) => updateHour(h.day, 'opensAt', v)}
                    placeholder="11:00"
                    maxLength={5}
                    keyboardType="numeric"
                  />
                  <SwitchRow
                    label="Break time"
                    description="Closed for a while during the day"
                    value={h.hasBreak}
                    onValueChange={(v) => updateHour(h.day, 'hasBreak', v)}
                  />
                  {h.hasBreak && (
                    <View style={styles.timeRow}>
                      <View style={styles.flex}>
                        <TextField
                          label="Break starts"
                          value={h.breakStart}
                          onChangeText={(v) => updateHour(h.day, 'breakStart', v)}
                          placeholder="15:00"
                          maxLength={5}
                          keyboardType="numeric"
                        />
                      </View>
                      <Text variant="body" color="textSecondary" style={styles.timeSep}>–</Text>
                      <View style={styles.flex}>
                        <TextField
                          label="Break ends"
                          value={h.breakEnd}
                          onChangeText={(v) => updateHour(h.day, 'breakEnd', v)}
                          placeholder="17:00"
                          maxLength={5}
                          keyboardType="numeric"
                        />
                      </View>
                    </View>
                  )}
                  <TextField
                    label="Closing time"
                    value={h.closesAt}
                    onChangeText={(v) => updateHour(h.day, 'closesAt', v)}
                    placeholder="23:00"
                    maxLength={5}
                    keyboardType="numeric"
                  />
                </View>
              )}
            </View>
          ))}
        </Card>
        {errors.hours ? <Text variant="caption" color="error">{errors.hours}</Text> : null}

        {/* Services */}
        <Text variant="label">Services offered</Text>
        <Card style={styles.card}>
          <SwitchRow label="Delivery" description="We deliver to customers" value={data.offersDelivery} onValueChange={(v) => onChange({ ...data, offersDelivery: v })} />
          <Divider />
          <SwitchRow label="Takeaway" description="Customers pick up their orders" value={data.offersTakeaway} onValueChange={(v) => onChange({ ...data, offersTakeaway: v })} />
          <Divider />
          <SwitchRow label="Dine-in" description="Customers eat at our premises" value={data.offersDineIn} onValueChange={(v) => onChange({ ...data, offersDineIn: v })} />
        </Card>

        {/* Prep time */}
        <Card style={styles.card}>
          <Text variant="label">Average prep time</Text>
          <View style={styles.chipWrap}>
            {PREP_OPTIONS.map((m) => (
              <Chip key={m} label={`${m} min`} selected={data.avgPrepMinutes === m} onPress={() => onChange({ ...data, avgPrepMinutes: m })} />
            ))}
          </View>
          {errors.avgPrepMinutes ? <Text variant="caption" color="error">{errors.avgPrepMinutes}</Text> : null}
        </Card>

        <TextField
          label="Minimum order amount (₹, optional)"
          value={data.minOrderAmount}
          onChangeText={(v) => { onChange({ ...data, minOrderAmount: v }); setErrors((e) => ({ ...e, minOrderAmount: '' })); }}
          keyboardType="decimal-pad"
          placeholder="e.g. 150"
          helperText="Leave blank for no minimum order requirement"
          errorText={errors.minOrderAmount}
        />

        {apiError ? <Text variant="caption" color="error" align="center">{apiError}</Text> : null}
        <Button label="Continue" onPress={() => run()} loading={pending} fullWidth />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Step 5: Business Verification ───────────────────────────────────────────

interface Step5Props {
  data: S5;
  onChange: (d: S5) => void;
  branchId: string;
  restaurantName: string;
  ownerName: string;
  onNext: () => Promise<void>;
}

function Step5({ data, onChange, branchId, restaurantName, ownerName, onNext }: Step5Props) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const pickDocument = async (field: 'fssaiDocUri' | 'gstDocUri', nameField: 'fssaiDocName' | 'gstDocName') => {
    try {
      const result = await DocumentPicker.getDocumentAsync(DOCUMENT_PICKER_OPTIONS);
      if (!result.canceled && result.assets[0]) {
        onChange({ ...data, [field]: result.assets[0].uri, [nameField]: result.assets[0].name });
      }
    } catch {
      Alert.alert('Document picker', 'Could not open document picker.');
    }
  };

  const { run, pending, error: apiError } = useMutation(async () => {
    const errs: Record<string, string> = {};
    if (!/^\d{14}$/.test(data.fssaiNumber.trim())) errs.fssaiNumber = 'FSSAI number must be 14 digits.';
    if (data.panNumber.trim() && !/^[A-Z]{5}\d{4}[A-Z]$/.test(data.panNumber.trim())) errs.panNumber = 'Enter a valid PAN (e.g. AAAPL1234C).';
    if (data.gstin.trim() && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(data.gstin.trim())) errs.gstin = 'Enter a valid 15-character GSTIN.';
    if (!data.fssaiDocUri) errs.fssaiDoc = 'Upload your FSSAI certificate to continue.';
    if (Object.keys(errs).length || !data.fssaiDocUri) { setErrors(errs); return; }
    setErrors({});

    // Update business profile
    await api.request('PUT', paths.partner.business, {
      schema: BusinessSchema,
      body: {
        displayName: restaurantName || 'Restaurant',
        legalName: ownerName || restaurantName || 'Owner',
        entityType: data.businessType,
        gstin: data.gstin.trim() || null,
      },
    });

    // Submission requires the FSSAI licence on file with its 14-digit number.
    await uploadBranchDocument(
      branchId,
      'fssai_license',
      { uri: data.fssaiDocUri, name: data.fssaiDocName },
      { documentNumber: data.fssaiNumber.trim() },
    );

    await onNext();
  });

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.stepHeader}>
          <Text variant="label" color="textSecondary">STEP 5 OF {TOTAL_STEPS}</Text>
          <Text variant="h2">Business verification</Text>
          <Text variant="body" color="textSecondary">We need these to verify your restaurant is legitimate and food-safe.</Text>
        </View>

        {IS_PROTOTYPE_MODE && (
          <Badge tone="warning" icon="construct-outline" label="Dev mode: document uploads are simulated — no real files are sent" />
        )}

        <Text variant="label">FSSAI food licence</Text>
        <TextField
          label="FSSAI licence number"
          value={data.fssaiNumber}
          onChangeText={(v) => { onChange({ ...data, fssaiNumber: v.replace(/\D/g, '') }); setErrors((e) => ({ ...e, fssaiNumber: '' })); }}
          keyboardType="numeric"
          maxLength={14}
          placeholder="14-digit FSSAI number"
          helperText="e.g. 11222334445566"
          errorText={errors.fssaiNumber}
        />

        <Pressable
          style={[styles.docPickerBtn, data.fssaiDocUri ? styles.docPickerBtnFilled : null]}
          onPress={() => pickDocument('fssaiDocUri', 'fssaiDocName')}
          accessibilityRole="button"
        >
          <Icon name={data.fssaiDocUri ? 'document-text' : 'cloud-upload-outline'} color={data.fssaiDocUri ? 'primary' : 'textSecondary'} />
          <Text variant="label" color={data.fssaiDocUri ? 'primaryText' : 'textSecondary'}>
            {data.fssaiDocName ?? 'Upload FSSAI certificate'}
          </Text>
        </Pressable>
        {errors.fssaiDoc ? <Text variant="caption" color="error">{errors.fssaiDoc}</Text> : null}

        <Divider />

        <Text variant="label">Business details</Text>
        <TextField
          label="PAN number (optional)"
          value={data.panNumber}
          onChangeText={(v) => { onChange({ ...data, panNumber: v.toUpperCase() }); setErrors((e) => ({ ...e, panNumber: '' })); }}
          autoCapitalize="characters"
          placeholder="AAAPL1234C"
          maxLength={10}
          errorText={errors.panNumber}
        />

        <Card style={styles.card}>
          <Text variant="label">Business type</Text>
          <View style={styles.chipWrap}>
            {ENTITY_OPTIONS.map((opt) => (
              <Chip
                key={opt.value}
                label={opt.label}
                selected={data.businessType === opt.value}
                onPress={() => onChange({ ...data, businessType: opt.value })}
              />
            ))}
          </View>
        </Card>

        <TextField
          label="GSTIN (optional)"
          value={data.gstin}
          onChangeText={(v) => { onChange({ ...data, gstin: v.toUpperCase() }); setErrors((e) => ({ ...e, gstin: '' })); }}
          autoCapitalize="characters"
          placeholder="27AAAPL1234C1Z5"
          maxLength={15}
          helperText="15-character GST Identification Number"
          errorText={errors.gstin}
        />

        {data.gstin.trim().length === 15 && (
          <Pressable
            style={[styles.docPickerBtn, data.gstDocUri ? styles.docPickerBtnFilled : null]}
            onPress={() => pickDocument('gstDocUri', 'gstDocName')}
            accessibilityRole="button"
          >
            <Icon name={data.gstDocUri ? 'document-text' : 'cloud-upload-outline'} color={data.gstDocUri ? 'primary' : 'textSecondary'} />
            <Text variant="label" color={data.gstDocUri ? 'primaryText' : 'textSecondary'}>
              {data.gstDocName ?? 'Upload GST certificate (optional)'}
            </Text>
          </Pressable>
        )}

        {apiError ? <Text variant="caption" color="error" align="center">{apiError}</Text> : null}
        <Button label="Continue" onPress={() => run()} loading={pending} fullWidth />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Step 6: Bank & Payout ────────────────────────────────────────────────────

interface Step6Props {
  data: S6;
  onChange: (d: S6) => void;
  branchId: string;
  onNext: () => Promise<void>;
}

function Step6({ data, onChange, branchId, onNext }: Step6Props) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync(DOCUMENT_PICKER_OPTIONS);
      if (!result.canceled && result.assets[0]) {
        onChange({ ...data, bankDocUri: result.assets[0].uri, bankDocName: result.assets[0].name });
      }
    } catch {
      Alert.alert('Document picker', 'Could not open document picker.');
    }
  };

  const { run, pending, error: apiError } = useMutation(async () => {
    const errs: Record<string, string> = {};
    if (data.accountHolderName.trim().length < 3) errs.accountHolderName = 'Enter the account holder name (at least 3 characters).';
    if (!/^\d{9,18}$/.test(data.bankAccountNumber.trim())) errs.bankAccountNumber = 'Enter a valid account number (9–18 digits).';
    if (data.bankAccountNumber.trim() !== data.confirmAccountNumber.trim()) errs.confirmAccountNumber = 'Account numbers do not match.';
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(data.ifscCode.trim().toUpperCase())) errs.ifscCode = 'Enter a valid IFSC code (e.g. HDFC0001234).';
    if (!data.bankDocUri) errs.bankDoc = 'Upload a cancelled cheque or bank statement to continue.';
    if (Object.keys(errs).length || !data.bankDocUri) { setErrors(errs); return; }
    setErrors({});

    await api.request('PUT', paths.partner.payoutAccount(branchId), {
      schema: PayoutAccountResponseSchema,
      body: buildPayoutAccountBody(data),
    });
    // Submission requires a bank proof alongside the payout account.
    await uploadBranchDocument(branchId, 'bank_proof', { uri: data.bankDocUri, name: data.bankDocName });
    await onNext();
  });

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.stepHeader}>
          <Text variant="label" color="textSecondary">STEP 6 OF {TOTAL_STEPS}</Text>
          <Text variant="h2">Bank & payout</Text>
          <Text variant="body" color="textSecondary">Where should we send your earnings?</Text>
        </View>

        <Badge tone="info" icon="lock-closed-outline" label="Your banking details are encrypted and stored securely. We never expose your full account number." />

        <TextField
          label="Account holder name"
          value={data.accountHolderName}
          onChangeText={(v) => { onChange({ ...data, accountHolderName: v }); setErrors((e) => ({ ...e, accountHolderName: '' })); }}
          placeholder="As on bank account"
          textContentType="name"
          errorText={errors.accountHolderName}
        />
        <TextField
          label="Bank account number"
          value={data.bankAccountNumber}
          onChangeText={(v) => { onChange({ ...data, bankAccountNumber: v.replace(/\D/g, '') }); setErrors((e) => ({ ...e, bankAccountNumber: '' })); }}
          keyboardType="numeric"
          secureTextEntry
          placeholder="Account number"
          errorText={errors.bankAccountNumber}
        />
        <TextField
          label="Confirm account number"
          value={data.confirmAccountNumber}
          onChangeText={(v) => { onChange({ ...data, confirmAccountNumber: v.replace(/\D/g, '') }); setErrors((e) => ({ ...e, confirmAccountNumber: '' })); }}
          keyboardType="numeric"
          secureTextEntry
          placeholder="Re-enter account number"
          errorText={errors.confirmAccountNumber}
        />
        <TextField
          label="IFSC code"
          value={data.ifscCode}
          onChangeText={(v) => { onChange({ ...data, ifscCode: v.toUpperCase() }); setErrors((e) => ({ ...e, ifscCode: '' })); }}
          autoCapitalize="characters"
          placeholder="e.g. HDFC0001234"
          maxLength={11}
          helperText="11-character code on your cheque or bank statement"
          errorText={errors.ifscCode}
        />

        <Pressable
          style={[styles.docPickerBtn, data.bankDocUri ? styles.docPickerBtnFilled : null]}
          onPress={pickDocument}
          accessibilityRole="button"
        >
          <Icon name={data.bankDocUri ? 'document-text' : 'cloud-upload-outline'} color={data.bankDocUri ? 'primary' : 'textSecondary'} />
          <Text variant="label" color={data.bankDocUri ? 'primaryText' : 'textSecondary'}>
            {data.bankDocName ?? 'Upload bank proof'}
          </Text>
        </Pressable>
        <Text variant="caption" color={errors.bankDoc ? 'error' : 'textSecondary'}>
          {errors.bankDoc || 'Cancelled cheque or recent bank statement'}
        </Text>

        {apiError ? <Text variant="caption" color="error" align="center">{apiError}</Text> : null}
        <Button label="Continue" onPress={() => run()} loading={pending} fullWidth />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Step 7: Review & Submit ─────────────────────────────────────────────────

interface Step7Props {
  data: S7;
  onChange: (d: S7) => void;
  branchId: string;
  s1: S1;
  s2: S2;
  s3: S3;
  s4: S4;
  s5: S5;
  s6: S6;
  onSubmit: () => Promise<void>;
  onEditStep: (step: number) => void;
}

function Step7({
  data, onChange, branchId: _branchId,
  s1, s2, s3, s4, s5, s6,
  onSubmit, onEditStep,
}: Step7Props) {
  const [submitError, setSubmitError] = useState('');

  const { run: submitRun, pending: submitPending, error: submitApiError } = useMutation(async () => {
    if (!data.termsAccepted) { setSubmitError('Please accept the terms and privacy policy.'); return; }
    setSubmitError('');
    await onSubmit();
  });

  const reviewRows: { label: string; value: string }[] = [
    { label: 'Restaurant', value: s1.restaurantName || '—' },
    { label: 'Type', value: RESTAURANT_TYPES.find((t) => t.value === s1.restaurantType)?.label ?? s1.restaurantType },
    { label: 'Cuisines', value: s1.cuisines.join(', ') || '—' },
    { label: 'Food', value: s1.foodType === 'veg_only' ? 'Veg only' : 'Veg & Non-Veg' },
    { label: 'Jain food', value: s1.hasJainFood ? 'Available' : 'Not available' },
    { label: 'Owner', value: s2.ownerName || '—' },
    { label: 'Email', value: s2.ownerEmail || '—' },
    { label: 'Role', value: OWNER_ROLES.find((r) => r.value === s2.ownerRole)?.label ?? s2.ownerRole },
    { label: 'Address', value: [s3.addressLine1, s3.locality, s3.city, s3.state, s3.pinCode].filter(Boolean).join(', ') || '—' },
    { label: 'Delivery', value: s4.offersDelivery ? 'Yes' : 'No' },
    { label: 'Takeaway', value: s4.offersTakeaway ? 'Yes' : 'No' },
    { label: 'Prep time', value: `${s4.avgPrepMinutes} min` },
    { label: 'FSSAI', value: s5.fssaiNumber || '—' },
    { label: 'Business', value: ENTITY_OPTIONS.find((o) => o.value === s5.businessType)?.label ?? s5.businessType },
    { label: 'Bank a/c', value: s6.bankAccountNumber ? `****${s6.bankAccountNumber.slice(-4)}` : '—' },
  ];

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.stepHeader}>
          <Text variant="label" color="textSecondary">STEP 7 OF {TOTAL_STEPS}</Text>
          <Text variant="h2">Review & submit</Text>
          <Text variant="body" color="textSecondary">Check everything looks right before submitting for review.</Text>
        </View>

        <Card style={styles.card}>
          {reviewRows.map(({ label, value }, i) => (
            <View key={label} style={[styles.reviewRow, i > 0 && styles.reviewRowBorder]}>
              <Text variant="caption" color="textSecondary" style={styles.reviewLabel}>{label}</Text>
              <Text variant="body" style={styles.flex}>{value}</Text>
            </View>
          ))}
        </Card>

        <Card style={styles.card}>
          <Text variant="label">Edit a section</Text>
          <View style={styles.chipWrap}>
            {['Details', 'Owner', 'Address', 'Hours', 'Business', 'Bank'].map((label, i) => (
              <Chip key={label} label={label} onPress={() => onEditStep(i + 1)} />
            ))}
          </View>
        </Card>

        <Card style={[styles.card, styles.infoCard]}>
          <View style={styles.row}>
            <Icon name="time-outline" color="primary" />
            <Text variant="bodySmall" color="textSecondary" style={styles.flex}>
              After submission, our team will verify your restaurant. You&apos;ll be notified within 1–2 business days.
            </Text>
          </View>
        </Card>

        <Card style={[styles.card, styles.infoCard]}>
          <View style={styles.row}>
            <Icon name="restaurant-outline" color="primary" />
            <Text variant="bodySmall" color="textSecondary" style={styles.flex}>
              You can add your menu from the dashboard&apos;s Menu tab.
            </Text>
          </View>
        </Card>

        <Card style={styles.card}>
          <SwitchRow
            label="I accept the Partner Terms and Privacy Policy"
            value={data.termsAccepted}
            onValueChange={(v) => { onChange({ ...data, termsAccepted: v }); setSubmitError(''); }}
          />
        </Card>

        {submitError || submitApiError ? <Text variant="caption" color="error" align="center">{submitError || submitApiError}</Text> : null}

        <Button
          label="Submit for review"
          icon="checkmark-circle-outline"
          onPress={() => submitRun()}
          loading={submitPending}
          disabled={!data.termsAccepted}
          fullWidth
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Submitted Screen ─────────────────────────────────────────────────────────

function SubmittedScreen({ onGoToDashboard }: { onGoToDashboard: () => void }) {
  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.submittedContent}>
        <View style={styles.submittedHero}>
          <View style={styles.heroIcon}>
            <Icon name="checkmark-circle" size="xl" color="primary" />
          </View>
          <Text variant="h1" align="center" accessibilityRole="header">
            Registration submitted!
          </Text>
          <Text variant="body" color="textSecondary" align="center">
            Your restaurant is now under review. Our team will verify your details and notify you within 1–2 business days.
          </Text>
        </View>

        <Card style={styles.card}>
          <Text variant="label" color="textSecondary">WHAT HAPPENS NEXT</Text>
          {[
            { icon: 'document-text-outline', text: 'Our team verifies your FSSAI licence and business documents.' },
            { icon: 'card-outline', text: 'Finance verifies your bank account for payouts.' },
            { icon: 'notifications-outline', text: 'You\'ll get a notification when your restaurant goes live.' },
          ].map(({ icon, text }) => (
            <View key={text} style={styles.nextStepRow}>
              <Icon name={icon as any} color="primary" size="sm" />
              <Text variant="bodySmall" color="textSecondary" style={styles.flex}>{text}</Text>
            </View>
          ))}
        </Card>

        <View style={styles.spacer} />

        <Button label="Go to dashboard" icon="arrow-forward" iconPosition="end" onPress={onGoToDashboard} fullWidth />
      </ScrollView>
    </Screen>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

export default function RegisterScreen() {
  const session = useSessionStore((s) => s.session);
  const reload = useSessionStore((s) => s.reload);
  const sessionUser = session?.user;
  // Resume the owner's existing draft/rejected branch: Step 1 then updates it instead of
  // creating a duplicate branch on every new login.
  const existingBranch = resumableBranch(session);

  const [step, setStep] = useState(1);
  const [branchId, setBranchId] = useState(existingBranch?.id ?? '');
  const [dashboardLoading, setDashboardLoading] = useState(false);

  const [s1, setS1] = useState<S1>({
    restaurantName: existingBranch?.name ?? '', logoUri: null, coverUri: null,
    restaurantType: 'restaurant', cuisines: [], description: '',
    foodType: 'mixed', hasJainFood: false,
  });
  const [s2, setS2] = useState<S2>({
    ownerName: sessionUser?.fullName ?? '',
    ownerEmail: sessionUser?.email ?? '',
    ownerRole: 'owner',
    additionalPhone: '',
    additionalPhoneVerified: false,
  });
  const [s3, setS3] = useState<S3>({
    country: 'India', state: '', city: '', pinCode: '',
    addressLine1: '', addressLine2: '', locality: '', landmark: '',
    latitude: null, longitude: null, deliveryRadiusKm: '5', offerPickup: true,
  });
  const [s4, setS4] = useState<S4>({
    hours: DEFAULT_HOURS,
    avgPrepMinutes: 20,
    offersDelivery: true, offersTakeaway: true, offersDineIn: false,
    minOrderAmount: '',
  });
  const [s5, setS5] = useState<S5>({
    fssaiNumber: '', fssaiDocUri: null, fssaiDocName: null,
    panNumber: '', businessType: 'individual', gstin: '', gstDocUri: null, gstDocName: null,
  });
  const [s6, setS6] = useState<S6>({
    accountHolderName: '', bankAccountNumber: '', confirmAccountNumber: '',
    ifscCode: '', bankDocUri: null, bankDocName: null,
  });
  const [s7, setS7] = useState<S7>({ termsAccepted: false });

  // Resuming a draft/rejected branch: show its saved opening hours (with breaks) once,
  // instead of the defaults. A failed load keeps the defaults; nothing is overwritten
  // on the server until the owner presses Continue on the Operations step.
  const resumedBranchId = existingBranch?.id ?? null;
  useEffect(() => {
    if (!resumedBranchId) return;
    let cancelled = false;
    api
      .request('GET', paths.partner.hours(resumedBranchId), { schema: HoursResponseSchema })
      .then(({ sessions }) => {
        if (cancelled || sessions.length === 0) return;
        setS4((prev) => ({ ...prev, hours: daysFromSessions(prev.hours, sessions) }));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [resumedBranchId]);

  const goBack = useCallback(() => {
    if (step === 1) { router.back(); return; }
    setStep((s) => s - 1);
  }, [step]);

  const goToDashboard = async () => {
    setDashboardLoading(true);
    try {
      await reload();
    } finally {
      setDashboardLoading(false);
    }
    router.replace('/');
  };

  const handleStep1Next = async (newBranchId: string) => {
    setBranchId(newBranchId);
    setStep(2);
  };

  const makeStepNext = (nextStep: number) => async () => {
    setStep(nextStep);
  };

  const handleSubmit = async () => {
    // Submission requires the current restaurant declaration to be accepted for this branch.
    // (The prototype mock has no declaration text, so it is skipped there.)
    if (!IS_PROTOTYPE_MODE) {
      const { current, acceptance } = await api.request('GET', paths.partner.branchDeclaration(branchId), {
        schema: DeclarationStatusSchema,
      });
      if (acceptance?.version !== current.version) {
        await api.request('POST', paths.partner.branchDeclaration(branchId), {
          schema: DeclarationAcceptanceSchema,
          body: { version: current.version, textSha256: current.textSha256 },
        });
      }
    }
    await api.request('POST', paths.partner.branchSubmit(branchId), {
      schema: BranchDetailSchema,
      body: {},
    });
    setStep(8);
  };

  if (step === 8) {
    return <SubmittedScreen onGoToDashboard={goToDashboard} />;
  }

  const STEP_TITLE: Record<number, string> = {
    1: 'Restaurant details',
    2: 'Owner information',
    3: 'Address',
    4: 'Operations',
    5: 'Business verification',
    6: 'Bank & payout',
    7: 'Review & submit',
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader
        onBack={goBack}
        backLabel={step === 1 ? 'Cancel' : 'Back'}
        title={`Register · ${STEP_TITLE[step] ?? ''}`}
      />
      <ProgressBar step={step} />

      {step === 1 && (
        <Step1 data={s1} onChange={setS1} branchId={branchId} onBranchCreated={setBranchId} onNext={handleStep1Next} />
      )}
      {step === 2 && (
        <Step2 data={s2} onChange={setS2} branchId={branchId} onNext={makeStepNext(3)} />
      )}
      {step === 3 && (
        <Step3 data={s3} onChange={setS3} branchId={branchId} onNext={makeStepNext(4)} />
      )}
      {step === 4 && (
        <Step4 data={s4} onChange={setS4} branchId={branchId} onNext={makeStepNext(5)} />
      )}
      {step === 5 && (
        <Step5 data={s5} onChange={setS5} branchId={branchId} restaurantName={s1.restaurantName} ownerName={s2.ownerName} onNext={makeStepNext(6)} />
      )}
      {step === 6 && (
        <Step6 data={s6} onChange={setS6} branchId={branchId} onNext={makeStepNext(7)} />
      )}
      {step === 7 && (
        <Step7
          data={s7} onChange={setS7} branchId={branchId}
          s1={s1} s2={s2} s3={s3} s4={s4} s5={s5} s6={s6}
          onSubmit={handleSubmit}
          onEditStep={(s) => setStep(s)}
        />
      )}
    </Screen>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    gap: spacing.lg,
    paddingHorizontal: screenGutter,
    paddingTop: spacing.xl,
    paddingBottom: spacing['3xl'],
  },
  submittedContent: {
    flexGrow: 1,
    gap: spacing.xl,
    paddingHorizontal: screenGutter,
    paddingTop: spacing['2xl'],
    paddingBottom: spacing.lg,
  },
  stepHeader: { gap: spacing.xs },
  card: { padding: spacing.lg, gap: spacing.md },
  infoCard: { backgroundColor: colors.primarySoft },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  spacer: { flex: 1, minHeight: spacing['2xl'] },
  imageRow: { flexDirection: 'row', gap: spacing.md },
  imagePicker: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  imagePickerWide: { flex: 1 },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceMuted,
  },
  imagePreview: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  otpSection: { gap: spacing.md },
  sendOtpBtn: { marginTop: spacing.lg },
  timeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, marginTop: spacing.xs },
  daySchedule: { gap: spacing.sm, marginTop: spacing.xs, paddingBottom: spacing.sm },
  timeSep: { marginBottom: spacing.md },
  docPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    backgroundColor: colors.surfaceMuted,
  },
  docPickerBtnFilled: {
    borderColor: colors.primarySoftBorder,
    backgroundColor: colors.primarySoft,
    borderStyle: 'solid',
  },
  reviewRow: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm },
  reviewRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  reviewLabel: { width: 90 },
  nextStepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  submittedHero: { gap: spacing.sm, alignItems: 'center' },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    marginBottom: spacing.sm,
  },
});
