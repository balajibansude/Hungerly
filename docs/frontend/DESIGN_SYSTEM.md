# Swaadone Design System

> Package: `@hungerly/ui` (`packages/ui`). Used by all mobile apps. Source of truth for values is the code in `packages/ui/src/theme`; this document explains intent and rules.

## 1. Principles

1. **Food first, chrome second.** Photography carries the appetite appeal; UI surfaces stay clean (white background, rounded cards, soft shadows). Visual direction: the Foodu food-delivery UI kit.
2. **Every value is a token.** Screens never hard-code colours, font sizes or spacing. If a value is missing, add a token.
3. **Accessible by default.** Components ship with roles, labels, 44–48 pt touch targets, dynamic type support (up to 2×) and AA contrast.
4. **Motion with a purpose.** Animate feedback and state changes (press, count change, sheet entry), never decoration. Respect reduce-motion.
5. **Original identity.** Food-delivery conventions (veg marks, add pill, floating cart) are used where they aid recognition; colour, type and shapes are Swaadone's own.

## 2. Colour

Brand: fresh **green** primary on **white**, near-black ink for text, and bright **promo accents** (orange, pink-red, blue) used only in promotional banners. Food classification has its own colours, distinct from the brand green.

| Token | Value | Use |
|---|---|---|
| `primary` / `primaryPressed` / `primarySoft` / `primarySoftBorder` | `#1BAC4B` / `#16913F` / `#E8F7EE` / `#C9EDD6` | Buttons (with `elevation.brand` glow), active tab icon, selected chips, focus / light-green fills |
| `primaryText` / `textLink` | `#127A37` | Green **text** on white or `primarySoft` (4.7–4.9:1) — small text never uses `primary` |
| `onPrimary` | `#FFFFFF` | Text on primary buttons (client spec; 3.0:1 — passes for large/bold text only, see note) |
| `secondary` | `#212121` | Dark surfaces: CLOSED pills, dark badges, closed banner |
| `background` / `surface` / `card` | `#FFFFFF` | Screens and cards |
| `surfaceMuted` / `surfacePressed` | `#FAFAFA` / `#F5F5F5` | Input fill, muted panels, pressed state |
| `textPrimary` / `textSecondary` / `textTertiary` | `#212121` / `#616161` / `#757575` | 16.1:1 / 6.2:1 / 4.6:1 on white |
| `textMuted` | `#9E9E9E` | Placeholders only (below text contrast by design) |
| `border` / `borderStrong` | `#EEEEEE` / `#E0E0E0` | Hairlines / outlines |
| `error` / `danger` | `#D32F2F` / `#F75555` | Error text (5:1) / destructive fills and icons |
| `success` / `warning` / `info` (+ `…Soft`) | `#127A37` / `#B45309` / `#1D4ED8` | Status text on their soft backgrounds |
| `rating` | `#FFC107` | Star icon |
| `veg` / `nonVeg` / `egg` / `jain` / `jainInk` | `#0F8A3C` / `#E53935` / `#C77A0A` / `#F2A900` / `#9A6B00` | Food-type marks; `jainInk` is used for Jain icons/text because the yellow is too light on white |
| `promoGreen` / `promoOrange` / `promoPink` / `promoBlue` | `#1BAC4B` / `#FF9800` / `#FF5A5F` / `#246BFD` | `PromoBanner` backgrounds only |

**Contrast note.** White text on `#1BAC4B` (buttons) and on the orange/pink banners is below 4.5:1. It follows the client palette and is limited to bold 15 pt+ labels and very large banner numbers; if accessibility review requires AA for these, darken `primary` towards `#13853A` (4.7:1) in `colors.ts` — no component changes are needed.

**Food types** (`theme/foodType.ts`, `foodTypeStyles`): one mapping drives `FoodTypeMark`, `FoodCartControl` (add button and stepper) and any other food-type styling. Veg = green square + circle; non-veg = red square + triangle; egg = amber square + triangle; Jain = yellow square + circle + the word "JAIN".

## 3. Typography

Typeface: **Plus Jakarta Sans** (open source) — friendly geometric forms, good digits for prices. Five weights are bundled (400–800). The Foodu kit uses Urbanist; Plus Jakarta Sans was kept because it is already bundled in both apps and is visually very close, so no new font dependency was added.

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
- **Radius:** `sm 8 · md 12 · lg 16 · xl 24 · pill` plus semantic `card 20 · button pill · input 16 · image 18 · modal 28`.
- **Touch target:** `minTouchTarget = 48`; smaller visual controls get `hitSlop`.
- **Elevation:** `none`, `low` (cards on white, tab bar), `high` (cart bar, dialogs), `brand` (soft green glow under primary buttons).
- **Motion:** durations `fast 150 · normal 250 · slow 400`; one spring for press feedback; press scale 0.97; skeleton pulse honours reduce-motion.

## 5. Components

| Component | Purpose | Accessibility notes |
|---|---|---|
| `Text` | All text, by variant + colour token | Font scaling capped at 2× |
| `Icon` | Ionicons wrapper (one icon set on both platforms) | Decorative by default |
| `Button` | Full-width-capable pill; primary (green, white label, green glow) / secondary / outline / ghost / danger; md / lg; icon; loading | Role button, disabled/busy state |
| `IconButton` | Icon-only actions; surface / ghost / overlay / primary | **Requires** `accessibilityLabel`; 44 pt + hitSlop |
| `PressableScale` | Pressable with spring scale feedback | — |
| `TextField` | Labelled input on a light-grey rounded fill; focused = green border + light-green fill; helper/error, leading/trailing slots | Label is the accessible name; errors announced politely |
| `OtpInput` | Boxed one-time-code entry driven by one hidden input | Keeps SMS autofill, paste and screen readers working |
| `Switch` / `SwitchRow` | Immediate on/off setting (availability, open/closed); row variant has label + description | `Switch` **requires** `accessibilityLabel`; the row is one switch-role element |
| `SearchBarButton` / `SearchBarInput` | Search entry point / live search field with clear | Role search |
| `Chip` | Pill filter: green outline, filled green when selected | Toggle role with checked state |
| `Badge` | Status or offer label (offer, neutral, info, success, warning, error, dark) | Non-interactive |
| `OrderStatusBadge` | Order status pill from the shared `orderStatusMeta` vocabulary (wording per audience: customer / partner; one colour and icon per status) | Non-interactive; label is the status text |
| `Card` | Bordered surface; pressable cards are a single accessible element | One label per card instead of many focus stops |
| `Rating` | Star + average (+ count) | Reads "Rated 4.6 out of 5 from 5.5k ratings" |
| `Price` | Money display, optional struck-through compare-at | Reads "₹149, reduced from ₹199" |
| `QuantitySelector` | "Add" pill → − n + stepper; `min`/`max`; bin icon only when removal is possible (cart lines, dish sheet) | Adjustable role with increment/decrement actions |
| `FoodCartControl` | Food-card control: 48 pt round + in the food-type colour (2 pt border, white fill) → compact − n + stepper; `blocked` turns it grey and calls `onBlockedPress` to explain (removal still allowed) | Adjustable role; blocked state announced with the reason |
| `FoodTypeMark` | Veg / non-veg / egg / Jain mark (Jain adds "JAIN") | Shape differs (circle vs triangle) and Jain has a word, not colour alone |
| `PromoBanner` | Large promo banner: big discount, title, subtitle, optional code, circular food photo; tones green / orange / pink / blue | One button with a full spoken summary |
| `Skeleton` | Pulsing placeholder matching real layout | Hidden from screen readers |
| `EmptyState` / `ErrorState` / `LoadingState` | Standard data states with one clear action / retry | Live regions |
| `ConfirmDialog` | Consequential confirmations; single-button info mode | Modal, back button cancels |
| `RemoteImage` | Cached image with placeholder and fallback tile | `decorative` for images that repeat adjacent text |
| `Avatar` | Initials avatar | Labelled |
| `Screen`, `ScreenHeader`, `SectionHeader`, `Divider` | Layout primitives with safe areas and gutters | Headers use header role |
| `BrandSplash` | White JS continuation of the native splash (logo, or wordmark when no logo is given) while the session restores | One "<name> is loading" label |

Domain-specific compositions (food card, restaurant card, cart line, bill summary) live in the app's `src/features`, not in `@hungerly/ui`, until a second app needs them.

## 6. Adding to the system

- New colour/size/spacing → add a token in `packages/ui/src/theme`, document it here, check contrast.
- New component → only when used (or clearly needed) by more than one screen; include accessibility props, all states (disabled/loading/error), and use tokens only.
- Keep components presentational: no data fetching, no navigation, no business rules.
