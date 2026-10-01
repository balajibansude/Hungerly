# Hungerly Design System

> Package: `@hungerly/ui` (`packages/ui`). Used by all mobile apps. Source of truth for values is the code in `packages/ui/src/theme`; this document explains intent and rules.

## 1. Principles

1. **Food first, chrome second.** Photography carries the appetite appeal; UI surfaces stay calm (warm paper background, hairline borders, few shadows).
2. **Every value is a token.** Screens never hard-code colours, font sizes or spacing. If a value is missing, add a token.
3. **Accessible by default.** Components ship with roles, labels, 44–48 pt touch targets, dynamic type support (up to 2×) and AA contrast.
4. **Motion with a purpose.** Animate feedback and state changes (press, count change, sheet entry), never decoration. Respect reduce-motion.
5. **Original identity.** Food-delivery conventions (veg marks, add pill, floating cart) are used where they aid recognition; colour, type and shapes are Hungerly's own.

## 2. Colour

Brand: warm **terracotta** primary (appetising, distinct from the bright orange/red common in the category), deep **herb-ink** for dark surfaces, **saffron** for highlights, on a warm **paper** background.

| Token | Value | Use |
|---|---|---|
| `primary` / `primaryPressed` / `primarySoft` | `#C2410C` / `#9A3412` / `#FDF3EC` | Primary actions, links, active tab, offer ribbons / soft tints |
| `onPrimary` | `#FFFFFF` | Text/icons on primary (5.2:1) |
| `secondary` / `secondaryMuted` | `#1F332C` / `#2C4A40` | Dark surfaces (offer cards, selected chips, avatar) |
| `accent` / `accentSoft` / `onAccentSoft` | `#E8A13A` / `#FDF1D8` / `#945607` | Highlights, promo codes, rating star |
| `background` | `#FAF7F2` | Screen background |
| `surface` / `card` / `surfaceMuted` / `surfacePressed` | `#FFFFFF` / `#FFFFFF` / `#F5F1EA` / `#EFE9DF` | Cards, inputs, muted panels, pressed state |
| `textPrimary` / `textSecondary` / `textTertiary` | `#1C1917` / `#57534E` / `#6E6762` | 16.4:1 / 7.1:1 / 5.2:1 on background |
| `border` / `borderStrong` | `#E4DDD1` / `#D3CCC0` | Hairlines / outlines |
| `success` / `warning` / `error` / `info` (+ `…Soft`) | `#15803D` / `#B45309` / `#B91C1C` / `#1D4ED8` | Status text on their soft backgrounds (all ≥ 4.5:1) |
| `disabled` / `onDisabled` | `#E4DDD1` / `#A8A097` | Disabled controls |
| `veg` / `nonVeg` / `egg` | `#1E7B34` / `#A12B26` / `#C77A0A` | Food-type marks (graphics ≥ 3:1) |

All text pairs were checked against WCAG 2.1 AA (4.5:1); two tokens were darkened during review to pass. A dark theme can be added by providing a second token map — components only read semantic tokens.

## 3. Typography

Typeface: **Plus Jakarta Sans** (open source) — friendly geometric forms, good digits for prices. Five weights are bundled (400–800).

| Variant | Size / line | Weight | Use |
|---|---|---|---|
| `brand` | 44 / 52 | 800 | Wordmark moments (splash, login) |
| `display` | 32 / 38 | 800 | Onboarding headlines |
| `h1` | 26 / 32 | 700 | Screen titles |
| `h2` | 21 / 28 | 700 | Section titles, offer headlines |
| `h3` | 17 / 24 | 600 | Card titles, dialog titles |
| `bodyLarge` | 16 / 24 | 400 | Inputs, long-form lead text |
| `body` | 15 / 22 | 400 | Default text |
| `bodySmall` | 13 / 18 | 400 | Descriptions, helper text |
| `caption` | 12 / 16 | 500 | Captions, tab labels |
| `label` | 13 / 18 | 600 | Chips, field labels, emphasised small text |
| `button` | 15 / 20 | 700 | Button labels |
| `price` | 15 / 20 | 700, tabular digits | Prices |
| `metadata` | 12 / 16 | 500 | ETA, distance, counts |

Text always renders through `<Text variant color>`; font scaling is allowed up to `maxFontSizeMultiplier = 2`.

## 4. Spacing, radius, elevation, motion

- **Spacing (4-pt scale):** `xxs 2 · xs 4 · sm 8 · md 12 · lg 16 · xl 20 · 2xl 24 · 3xl 32 · 4xl 40 · 5xl 56`. Screen gutter = `xl` (20). Sections on Home are separated by `2xl`.
- **Radius:** `sm 8 · md 12 · lg 16 · xl 24 · pill` plus semantic `card 20 · button 14 · input 14 · image 16 · modal 28`.
- **Touch target:** `minTouchTarget = 48`; smaller visual controls get `hitSlop`.
- **Elevation:** `none`, `low`, `high` (iOS shadow / Android elevation). Only floating elements (cart bar, dialogs) use elevation; cards use hairline borders.
- **Motion:** durations `fast 150 · normal 250 · slow 400`; one spring for press feedback; press scale 0.97; skeleton pulse honours reduce-motion.

## 5. Components

| Component | Purpose | Accessibility notes |
|---|---|---|
| `Text` | All text, by variant + colour token | Font scaling capped at 2× |
| `Icon` | Ionicons wrapper (one icon set on both platforms) | Decorative by default |
| `Button` | primary / secondary / outline / ghost / danger; md / lg; icon; loading | Role button, disabled/busy state |
| `IconButton` | Icon-only actions; surface / ghost / overlay / primary | **Requires** `accessibilityLabel`; 44 pt + hitSlop |
| `PressableScale` | Pressable with spring scale feedback | — |
| `TextField` | Labelled input with helper/error, leading/trailing slots; label and box focus the input | Label is the accessible name; errors announced politely |
| `OtpInput` | Boxed one-time-code entry driven by one hidden input | Keeps SMS autofill, paste and screen readers working |
| `Switch` / `SwitchRow` | Immediate on/off setting (availability, open/closed); row variant has label + description | `Switch` **requires** `accessibilityLabel`; the row is one switch-role element |
| `SearchBarButton` / `SearchBarInput` | Search entry point / live search field with clear | Role search |
| `Chip` | Toggleable filter | Toggle role with checked state |
| `Badge` | Status or offer label (offer, neutral, info, success, warning, error, dark) | Non-interactive |
| `OrderStatusBadge` | Order status pill from the shared `orderStatusMeta` vocabulary (wording per audience: customer / partner; one colour and icon per status) | Non-interactive; label is the status text |
| `Card` | Bordered surface; pressable cards are a single accessible element | One label per card instead of many focus stops |
| `Rating` | Star + average (+ count) | Reads "Rated 4.6 out of 5 from 5.5k ratings" |
| `Price` | Money display, optional struck-through compare-at | Reads "₹149, reduced from ₹199" |
| `QuantitySelector` | "Add" pill → − n + stepper; `min`/`max`; bin icon only when removal is possible | Adjustable role with increment/decrement actions |
| `FoodTypeMark` | Veg / non-veg / egg mark | Shape differs (circle vs triangle), not colour alone |
| `Skeleton` | Pulsing placeholder matching real layout | Hidden from screen readers |
| `EmptyState` / `ErrorState` / `LoadingState` | Standard data states with one clear action / retry | Live regions |
| `ConfirmDialog` | Consequential confirmations; single-button info mode | Modal, back button cancels |
| `RemoteImage` | Cached image with placeholder and fallback tile | `decorative` for images that repeat adjacent text |
| `Avatar` | Initials avatar | Labelled |
| `Screen`, `ScreenHeader`, `SectionHeader`, `Divider` | Layout primitives with safe areas and gutters | Headers use header role |
| `BrandSplash` | JS continuation of the native splash (wordmark + app tagline) while the session restores | One "Hungerly is loading" label |

Domain-specific compositions (restaurant card, menu row, cart line, bill summary) live in the app's `src/features`, not in `@hungerly/ui`, until a second app needs them.

## 6. Adding to the system

- New colour/size/spacing → add a token in `packages/ui/src/theme`, document it here, check contrast.
- New component → only when used (or clearly needed) by more than one screen; include accessibility props, all states (disabled/loading/error), and use tokens only.
- Keep components presentational: no data fetching, no navigation, no business rules.
