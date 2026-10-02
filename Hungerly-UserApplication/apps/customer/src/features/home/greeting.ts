/** Time-aware greeting; food intent changes through the day, so the copy does too. */
export function greetingFor(date: Date, name: string | null | undefined): string {
  const hour = date.getHours();
  const part =
    hour < 5
      ? 'Late-night cravings'
      : hour < 12
        ? 'Good morning'
        : hour < 17
          ? 'Good afternoon'
          : 'Good evening';
  const firstName = name?.trim().split(/\s+/)[0];
  return firstName ? `${part}, ${firstName}` : part;
}

export function mealPromptFor(date: Date): string {
  const hour = date.getHours();
  if (hour < 5) return 'Kitchens still open near you';
  if (hour < 11) return 'What’s for breakfast?';
  if (hour < 16) return 'Lunch, sorted in minutes';
  if (hour < 19) return 'Time for a snack break?';
  return 'What’s for dinner tonight?';
}
