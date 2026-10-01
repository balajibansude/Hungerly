import { Chip, TextField } from '@hungerly/ui';

import { ChoiceGroup } from '@/features/onboarding/components/ChoiceGroup';
import { StepLayout } from '@/features/onboarding/components/StepLayout';
import { CUISINE_OPTIONS, FOOD_TYPE_OPTIONS } from '@/features/onboarding/options';
import { useStepForm } from '@/features/onboarding/useStepForm';

/** Step 1 — Restaurant details: name, cuisines (several), veg only or mixed. */
export default function RestaurantDetailsStep() {
  const form = useStepForm('restaurant');
  const { name, cuisines, foodType } = form.values;

  const toggleCuisine = (cuisine: string) => {
    form.touch('cuisines');
    form.set({
      cuisines: cuisines.includes(cuisine)
        ? cuisines.filter((c) => c !== cuisine)
        : [...cuisines, cuisine],
    });
  };

  return (
    <StepLayout
      step="restaurant"
      subtitle="How customers will find you on Hungerly."
      primary={form.primary}
      footerNote={form.footerNote}
    >
      <TextField
        label="Restaurant name"
        value={name}
        onChangeText={(value) => form.set({ name: value })}
        onBlur={() => form.touch('name')}
        placeholder="e.g. Spice Garden"
        autoCapitalize="words"
        returnKeyType="done"
        maxLength={80}
        errorText={form.errorFor('name')}
      />

      <ChoiceGroup
        label="Cuisines"
        helperText="Choose all that apply."
        errorText={form.errorFor('cuisines')}
      >
        {CUISINE_OPTIONS.map((cuisine) => (
          <Chip
            key={cuisine}
            label={cuisine}
            selected={cuisines.includes(cuisine)}
            onPress={() => toggleCuisine(cuisine)}
          />
        ))}
      </ChoiceGroup>

      <ChoiceGroup
        label="Food type"
        helperText={FOOD_TYPE_OPTIONS.find((o) => o.value === foodType)?.hint}
        errorText={form.errorFor('foodType')}
      >
        {FOOD_TYPE_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            icon={option.value === 'veg_only' ? 'leaf-outline' : 'restaurant-outline'}
            selected={foodType === option.value}
            onPress={() => {
              form.touch('foodType');
              form.set({ foodType: option.value });
            }}
          />
        ))}
      </ChoiceGroup>
    </StepLayout>
  );
}
