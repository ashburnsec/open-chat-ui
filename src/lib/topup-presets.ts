/**
 * Top-up preset cards driving the marketing-flavoured anchor row at
 * the top of /purchase (M25). Pure constants — safe to import from
 * client and server alike.
 *
 * Why pre-set amounts at all: a blank "enter any number" input has
 * the highest decision friction. Cards with named tiers ("$50 ·
 * Recommended for daily use") let users self-identify into a bucket
 * and click. Same data is reused on the landing page's pricing
 * section so SEO-acquired visitors see the same anchor before they
 * sign up.
 *
 * The real `amount_options` list new-api ships in `/topup/info`
 * usually overlaps these — we don't try to merge them. The small
 * button group inside OnlineTopupCard stays as the admin-driven
 * shortcut row; the cards above are our marketing-side anchor.
 */

export type TopupPreset = {
  /** Stable id used as React key + `selectedPreset` discriminator. */
  id: 'trial' | 'personal' | 'team' | 'enterprise';
  /** USD amount that lands in the customer's wallet. */
  amount: number;
  /** i18n key under `purchase.presets.<id>.label` — short noun phrase. */
  labelKey: string;
  /** i18n key under `purchase.presets.<id>.hint` — soft "lasts about" copy. */
  hintKey: string;
  /** Show a small "recommended" badge on this tier. Exactly one. */
  recommended: boolean;
};

export const TOPUP_PRESETS: readonly TopupPreset[] = [
  {
    id: 'trial',
    amount: 10,
    labelKey: 'purchase.presets.trial.label',
    hintKey: 'purchase.presets.trial.hint',
    recommended: false,
  },
  {
    id: 'personal',
    amount: 50,
    labelKey: 'purchase.presets.personal.label',
    hintKey: 'purchase.presets.personal.hint',
    recommended: true,
  },
  {
    id: 'team',
    amount: 100,
    labelKey: 'purchase.presets.team.label',
    hintKey: 'purchase.presets.team.hint',
    recommended: false,
  },
  {
    id: 'enterprise',
    amount: 500,
    labelKey: 'purchase.presets.enterprise.label',
    hintKey: 'purchase.presets.enterprise.hint',
    recommended: false,
  },
];

/** Map an amount (e.g. typed into the custom input) back to a preset
 *  id. Returns null when the amount doesn't exactly match any preset
 *  — the cards then drop their selected state and the user sees
 *  their custom input as the source of truth. */
export function presetIdForAmount(amount: number): TopupPreset['id'] | null {
  const hit = TOPUP_PRESETS.find((p) => p.amount === amount);
  return hit?.id ?? null;
}
