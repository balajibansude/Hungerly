import {
  BranchSchema,
  BusinessSchema,
  paths,
} from '@hungerly/api-client';
import {
  Button,
  Card,
  Chip,
  colors,
  Icon,
  Screen,
  screenGutter,
  ScreenHeader,
  spacing,
  Text,
  TextField,
} from '@hungerly/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { useSessionStore } from '@/features/auth/session';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';

const TOTAL_STEPS = 6;

const CUISINES = [
  'North Indian', 'South Indian', 'Chinese', 'Italian', 'Fast Food',
  'Biryani', 'Street Food', 'Snacks', 'Bakery', 'Beverages',
  'Desserts', 'Pizza', 'Burger', 'Rolls', 'Thali', 'Seafood', 'Continental',
];

const PREP_OPTIONS = [10, 15, 20, 25, 30, 40, 45, 60] as const;

const ENTITY_OPTIONS = [
  { value: 'individual', label: 'Sole proprietor' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'llp', label: 'LLP' },
  { value: 'company', label: 'Company' },
  { value: 'other', label: 'Other' },
] as const;

type EntityType = 'individual' | 'partnership' | 'llp' | 'company' | 'other';

function ProgressBar({ step }: { step: number }) {
  return (
    <View style={styles.progressBar}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <View
          key={i}
          style={[styles.progressSegment, i < step && styles.progressSegmentFilled]}
        />
      ))}
    </View>
  );
}

// --- Step 1: Name ---

function Step1Name({
  onNext,
}: {
  onNext: (branchId: string, name: string) => void;
}) {
  const [name, setName] = useState('');
  const [fieldError, setFieldError] = useState('');

  const { run: create, pending, error } = useMutation(async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) { setFieldError('Restaurant name must be at least 2 characters.'); return; }
    if (trimmed.length > 80) { setFieldError('Name must be 80 characters or fewer.'); return; }
    setFieldError('');
    const branch = await api.request('POST', paths.partner.branches, {
      schema: BranchSchema,
      body: { name: trimmed },
    });
    onNext(branch.id, trimmed);
  });

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.stepHeader}>
          <Text variant="label" color="textSecondary">STEP 1 OF {TOTAL_STEPS}</Text>
          <Text variant="h2">Name your restaurant</Text>
          <Text variant="body" color="textSecondary">
            This is the name customers will see on Swaadone.
          </Text>
        </View>
        <TextField
          label="Restaurant name"
          value={name}
          onChangeText={(v) => { setName(v); setFieldError(''); }}
          placeholder="e.g. Masala Kitchen"
          maxLength={80}
          returnKeyType="done"
          onSubmitEditing={() => create()}
          errorText={fieldError || error || undefined}
          autoFocus
        />
        <View style={styles.spacer} />
        <Button label="Continue" onPress={() => create()} loading={pending} fullWidth />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// --- Step 2: Restaurant type ---

function Step2Type({
  branchId,
  onNext,
}: {
  branchId: string;
  onNext: (foodType: 'veg_only' | 'mixed', cuisines: string[], prep: number, minOrder: string) => void;
}) {
  const [foodType, setFoodType] = useState<'veg_only' | 'mixed'>('mixed');
  const [cuisines, setCuisines] = useState<string[]>([]);
  const [prep, setPrep] = useState<number>(20);
  const [minOrder, setMinOrder] = useState('');
  const [fieldError, setFieldError] = useState('');

  const { run: save, pending, error } = useMutation(async () => {
    if (cuisines.length === 0) { setFieldError('Select at least one cuisine.'); return; }
    setFieldError('');
    const minOrderMinor = minOrder.trim() ? Math.round(parseFloat(minOrder) * 100) : 0;
    await api.request('PATCH', paths.partner.branch(branchId), {
      schema: BranchSchema,
      body: { foodType, cuisines, avgPrepMinutes: prep, minimumOrderMinor: minOrderMinor },
    });
    onNext(foodType, cuisines, prep, minOrder);
  });

  const toggleCuisine = (c: string) => {
    setCuisines((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : prev.length < 8 ? [...prev, c] : prev,
    );
    setFieldError('');
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.stepHeader}>
          <Text variant="label" color="textSecondary">STEP 2 OF {TOTAL_STEPS}</Text>
          <Text variant="h2">Restaurant type</Text>
        </View>

        <Card style={styles.card}>
          <Text variant="label">Food type</Text>
          <View style={styles.chipRow}>
            <Chip
              label="Veg only"
              selected={foodType === 'veg_only'}
              onPress={() => setFoodType('veg_only')}
            />
            <Chip
              label="Veg & Non-Veg"
              selected={foodType === 'mixed'}
              onPress={() => setFoodType('mixed')}
            />
          </View>
        </Card>

        <Card style={styles.card}>
          <Text variant="label">Cuisines (pick up to 8)</Text>
          <View style={styles.chipWrap}>
            {CUISINES.map((c) => (
              <Chip
                key={c}
                label={c}
                selected={cuisines.includes(c)}
                onPress={() => toggleCuisine(c)}
              />
            ))}
          </View>
          {fieldError ? (
            <Text variant="caption" color="error">{fieldError}</Text>
          ) : null}
        </Card>

        <Card style={styles.card}>
          <Text variant="label">Average prep time</Text>
          <View style={styles.chipRow}>
            {PREP_OPTIONS.map((m) => (
              <Chip
                key={m}
                label={`${m} min`}
                selected={prep === m}
                onPress={() => setPrep(m)}
              />
            ))}
          </View>
        </Card>

        <TextField
          label="Minimum order (₹, optional)"
          value={minOrder}
          onChangeText={setMinOrder}
          keyboardType="decimal-pad"
          placeholder="e.g. 150"
          helperText="Leave blank for no minimum"
        />

        {error ? <Text variant="caption" color="error">{error}</Text> : null}
        <Button label="Continue" onPress={() => save()} loading={pending} fullWidth />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// --- Step 3: Location ---

function Step3Location({
  branchId,
  onNext,
}: {
  branchId: string;
  onNext: (addr: { line1: string; line2: string; locality: string; city: string; state: string; postalCode: string }) => void;
}) {
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [locality, setLocality] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { run: save, pending, error } = useMutation(async () => {
    const errs: Record<string, string> = {};
    if (line1.trim().length < 3) errs.line1 = 'Enter at least 3 characters.';
    if (locality.trim().length < 2) errs.locality = 'Enter locality.';
    if (city.trim().length < 2) errs.city = 'Enter city.';
    if (state.trim().length < 2) errs.state = 'Enter state.';
    if (!/^[1-9]\d{5}$/.test(postalCode.trim())) errs.postalCode = 'Enter a valid 6-digit PIN code.';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    const address = {
      line1: line1.trim(),
      line2: line2.trim() || null,
      locality: locality.trim(),
      city: city.trim(),
      state: state.trim(),
      postalCode: postalCode.trim(),
    };
    await api.request('PATCH', paths.partner.branch(branchId), {
      schema: BranchSchema,
      body: { address },
    });
    onNext({ line1: line1.trim(), line2: line2.trim(), locality: locality.trim(), city: city.trim(), state: state.trim(), postalCode: postalCode.trim() });
  });

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.stepHeader}>
          <Text variant="label" color="textSecondary">STEP 3 OF {TOTAL_STEPS}</Text>
          <Text variant="h2">Restaurant address</Text>
          <Text variant="body" color="textSecondary">Where customers and riders will find you.</Text>
        </View>
        <TextField label="Address line 1" value={line1} onChangeText={(v) => { setLine1(v); setErrors((e) => ({ ...e, line1: '' })); }} placeholder="Building, street, area" errorText={errors.line1} />
        <TextField label="Address line 2 (optional)" value={line2} onChangeText={setLine2} placeholder="Landmark or floor" />
        <TextField label="Locality / Area" value={locality} onChangeText={(v) => { setLocality(v); setErrors((e) => ({ ...e, locality: '' })); }} placeholder="e.g. Koregaon Park" errorText={errors.locality} />
        <TextField label="City" value={city} onChangeText={(v) => { setCity(v); setErrors((e) => ({ ...e, city: '' })); }} placeholder="e.g. Pune" errorText={errors.city} />
        <TextField label="State" value={state} onChangeText={(v) => { setState(v); setErrors((e) => ({ ...e, state: '' })); }} placeholder="e.g. Maharashtra" errorText={errors.state} />
        <TextField label="PIN code" value={postalCode} onChangeText={(v) => { setPostalCode(v); setErrors((e) => ({ ...e, postalCode: '' })); }} keyboardType="numeric" maxLength={6} placeholder="411001" errorText={errors.postalCode} />
        {error ? <Text variant="caption" color="error">{error}</Text> : null}
        <Button label="Continue" onPress={() => save()} loading={pending} fullWidth />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// --- Step 4: Contact ---

function Step4Contact({
  branchId,
  onNext,
}: {
  branchId: string;
  onNext: (phone: string, email: string) => void;
}) {
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { run: save, pending, error } = useMutation(async () => {
    const errs: Record<string, string> = {};
    if (!/^[6-9]\d{9}$/.test(phone.trim())) errs.phone = 'Enter a valid 10-digit mobile number starting with 6-9.';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    await api.request('PATCH', paths.partner.branch(branchId), {
      schema: BranchSchema,
      body: { phoneE164: `+91${phone.trim()}`, email: email.trim() || null },
    });
    onNext(phone.trim(), email.trim());
  });

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.stepHeader}>
          <Text variant="label" color="textSecondary">STEP 4 OF {TOTAL_STEPS}</Text>
          <Text variant="h2">Contact details</Text>
          <Text variant="body" color="textSecondary">How customers and Swaadone can reach your restaurant.</Text>
        </View>
        <TextField
          label="Restaurant phone"
          value={phone}
          onChangeText={(v) => { setPhone(v.replace(/\D/g, '')); setErrors((e) => ({ ...e, phone: '' })); }}
          keyboardType="phone-pad"
          maxLength={10}
          placeholder="98765 43210"
          leading={<Text variant="bodyLarge" color="textSecondary">+91</Text>}
          errorText={errors.phone}
        />
        <TextField
          label="Restaurant email (optional)"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="restaurant@example.com"
        />
        {error ? <Text variant="caption" color="error">{error}</Text> : null}
        <Button label="Continue" onPress={() => save()} loading={pending} fullWidth />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// --- Step 5: Business details ---

function Step5Business({
  onNext,
}: {
  onNext: (displayName: string, legalName: string, entityType: EntityType, gstin: string) => void;
}) {
  const [displayName, setDisplayName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [entityType, setEntityType] = useState<EntityType>('individual');
  const [gstin, setGstin] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { run: save, pending, error } = useMutation(async () => {
    const errs: Record<string, string> = {};
    if (displayName.trim().length < 2) errs.displayName = 'Enter at least 2 characters.';
    if (legalName.trim().length < 2) errs.legalName = 'Enter at least 2 characters.';
    if (gstin.trim() && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin.trim())) {
      errs.gstin = 'Enter a valid 15-character GSTIN or leave blank.';
    }
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    await api.request('PATCH', paths.partner.business, {
      schema: BusinessSchema,
      body: {
        displayName: displayName.trim(),
        legalName: legalName.trim(),
        entityType,
        gstin: gstin.trim() || null,
      },
    });
    onNext(displayName.trim(), legalName.trim(), entityType, gstin.trim());
  });

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.stepHeader}>
          <Text variant="label" color="textSecondary">STEP 5 OF {TOTAL_STEPS}</Text>
          <Text variant="h2">Business details</Text>
          <Text variant="body" color="textSecondary">Legal information about your business entity.</Text>
        </View>
        <TextField
          label="Business display name"
          value={displayName}
          onChangeText={(v) => { setDisplayName(v); setErrors((e) => ({ ...e, displayName: '' })); }}
          placeholder="Name as shown to customers"
          errorText={errors.displayName}
        />
        <TextField
          label="Legal / registered name"
          value={legalName}
          onChangeText={(v) => { setLegalName(v); setErrors((e) => ({ ...e, legalName: '' })); }}
          placeholder="Official registered name"
          errorText={errors.legalName}
        />
        <Card style={styles.card}>
          <Text variant="label">Business type</Text>
          <View style={styles.chipWrap}>
            {ENTITY_OPTIONS.map((opt) => (
              <Chip
                key={opt.value}
                label={opt.label}
                selected={entityType === opt.value}
                onPress={() => setEntityType(opt.value)}
              />
            ))}
          </View>
        </Card>
        <TextField
          label="GSTIN (optional)"
          value={gstin}
          onChangeText={(v) => { setGstin(v.toUpperCase()); setErrors((e) => ({ ...e, gstin: '' })); }}
          autoCapitalize="characters"
          placeholder="27AAAPL1234C1Z5"
          helperText="15-character GST Identification Number"
          errorText={errors.gstin}
        />
        {error ? <Text variant="caption" color="error">{error}</Text> : null}
        <Button label="Continue" onPress={() => save()} loading={pending} fullWidth />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// --- Step 6: Review & Submit ---

function Step6Review({
  branchId,
  name,
  foodType,
  cuisines,
  prep,
  minOrder,
  address,
  phone,
  email,
  displayName,
  legalName,
  entityType,
}: {
  branchId: string;
  name: string;
  foodType: 'veg_only' | 'mixed';
  cuisines: string[];
  prep: number;
  minOrder: string;
  address: { line1: string; line2: string; locality: string; city: string; state: string; postalCode: string };
  phone: string;
  email: string;
  displayName: string;
  legalName: string;
  entityType: EntityType;
}) {
  const reload = useSessionStore((s) => s.reload);

  const { run: submit, pending, error } = useMutation(async () => {
    await api.request('POST', paths.partner.branchSubmit(branchId), {
      schema: BranchSchema,
      body: {},
    });
    await reload();
    router.replace('/');
  });

  const rows: { label: string; value: string }[] = [
    { label: 'Restaurant', value: name },
    { label: 'Food type', value: foodType === 'veg_only' ? 'Veg only' : 'Veg & Non-Veg' },
    { label: 'Cuisines', value: cuisines.join(', ') || '—' },
    { label: 'Avg prep time', value: `${prep} min` },
    { label: 'Min order', value: minOrder ? `₹${minOrder}` : 'None' },
    { label: 'Address', value: [address.line1, address.line2, address.locality, address.city, address.state, address.postalCode].filter(Boolean).join(', ') },
    { label: 'Phone', value: `+91 ${phone}` },
    { label: 'Email', value: email || '—' },
    { label: 'Business name', value: displayName },
    { label: 'Legal name', value: legalName },
    { label: 'Entity type', value: ENTITY_OPTIONS.find((o) => o.value === entityType)?.label ?? entityType },
  ];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.stepHeader}>
        <Text variant="label" color="textSecondary">STEP 6 OF {TOTAL_STEPS}</Text>
        <Text variant="h2">Review & submit</Text>
        <Text variant="body" color="textSecondary">
          Swaadone will review your restaurant. You&apos;ll be notified once approved — usually within 1–2 business days.
        </Text>
      </View>

      <Card style={styles.card}>
        {rows.map(({ label, value }, i) => (
          <View key={label} style={[styles.reviewRow, i > 0 && styles.reviewRowBorder]}>
            <Text variant="caption" color="textSecondary" style={styles.reviewLabel}>{label}</Text>
            <Text variant="body" style={styles.flex}>{value}</Text>
          </View>
        ))}
      </Card>

      <Card style={[styles.card, styles.infoCard]}>
        <View style={styles.infoRow}>
          <Icon name="information-circle-outline" color="primary" />
          <Text variant="bodySmall" color="textSecondary" style={styles.flex}>
            You can continue setting up opening hours, upload your FSSAI food licence, and add your bank account from the app after submission.
          </Text>
        </View>
      </Card>

      {error ? <Text variant="caption" color="error" align="center">{error}</Text> : null}

      <Button
        label="Submit for review"
        icon="checkmark-circle-outline"
        onPress={() => submit()}
        loading={pending}
        fullWidth
      />
    </ScrollView>
  );
}

// --- Main wizard ---

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

export default function NewBranchScreen() {
  const [step, setStep] = useState<WizardStep>(1);
  const [branchId, setBranchId] = useState('');
  const [name, setName] = useState('');
  const [foodType, setFoodType] = useState<'veg_only' | 'mixed'>('mixed');
  const [cuisines, setCuisines] = useState<string[]>([]);
  const [prep, setPrep] = useState(20);
  const [minOrder, setMinOrder] = useState('');
  const [address, setAddress] = useState({ line1: '', line2: '', locality: '', city: '', state: '', postalCode: '' });
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [entityType, setEntityType] = useState<EntityType>('individual');

  const goBack = () => {
    if (step === 1) { router.back(); return; }
    setStep((s) => (s - 1) as WizardStep);
  };

  const title = [
    '', 'Name', 'Type', 'Location', 'Contact', 'Business', 'Review',
  ][step] ?? 'Registration';

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader
        onBack={goBack}
        backLabel={step === 1 ? 'Cancel' : 'Back'}
        title={`Register restaurant · ${title}`}
      />
      <ProgressBar step={step} />

      {step === 1 && (
        <Step1Name
          onNext={(id, n) => { setBranchId(id); setName(n); setStep(2); }}
        />
      )}
      {step === 2 && (
        <Step2Type
          branchId={branchId}
          onNext={(ft, cs, p, mo) => { setFoodType(ft); setCuisines(cs); setPrep(p); setMinOrder(mo); setStep(3); }}
        />
      )}
      {step === 3 && (
        <Step3Location
          branchId={branchId}
          onNext={(addr) => { setAddress(addr); setStep(4); }}
        />
      )}
      {step === 4 && (
        <Step4Contact
          branchId={branchId}
          onNext={(ph, em) => { setPhone(ph); setEmail(em); setStep(5); }}
        />
      )}
      {step === 5 && (
        <Step5Business
          onNext={(dn, ln, et, _g) => { setDisplayName(dn); setLegalName(ln); setEntityType(et); setStep(6); }}
        />
      )}
      {step === 6 && (
        <Step6Review
          branchId={branchId}
          name={name}
          foodType={foodType}
          cuisines={cuisines}
          prep={prep}
          minOrder={minOrder}
          address={address}
          phone={phone}
          email={email}
          displayName={displayName}
          legalName={legalName}
          entityType={entityType}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  progressBar: {
    flexDirection: 'row',
    height: 4,
    backgroundColor: colors.border,
    gap: 2,
  },
  progressSegment: {
    flex: 1,
    backgroundColor: colors.border,
  },
  progressSegmentFilled: {
    backgroundColor: colors.primary,
  },
  content: {
    gap: spacing.lg,
    paddingHorizontal: screenGutter,
    paddingTop: spacing.xl,
    paddingBottom: spacing['3xl'],
  },
  stepHeader: { gap: spacing.xs },
  card: { padding: spacing.lg, gap: spacing.md },
  infoCard: { backgroundColor: colors.primarySoft },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  spacer: { flex: 1, minHeight: spacing['2xl'] },
  reviewRow: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm },
  reviewRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  reviewLabel: { width: 100 },
  infoRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
});
