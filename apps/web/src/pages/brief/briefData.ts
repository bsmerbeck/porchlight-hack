// Content for the unlisted /brief-p7k3 investor brief.
// Source: .planning/quick/260922-pmf-valuation/PMF-VALUATION.md

export interface BriefSection {
  id: string;
  chip: string;
  title: string;
}

export const SECTIONS: BriefSection[] = [
  { id: 'what', chip: 'What', title: 'What Porchlight is' },
  { id: 'who', chip: 'Customer', title: 'Who the customer is' },
  { id: 'benefit', chip: 'Benefit', title: 'The benefit' },
  { id: 'integrations', chip: 'Integrations', title: 'Integrations & market taps' },
  { id: 'pricing', chip: 'Pricing', title: 'Pricing & business model' },
  { id: 'forecast', chip: 'Forecast', title: 'Year-1 forecast: Low / Mid / High' },
  { id: 'forecast2', chip: 'Year 2', title: 'Year-2 forecast: Low / Mid / High' },
  { id: 'valuation', chip: 'Valuation', title: 'Valuation: High ~$35M (month 12), ~$140M (month 24)' },
  { id: 'sources', chip: 'Sources', title: 'Sources' },
];

export const INTENT =
  "Porchlight is an AI guardian for an elderly parent's phone. It answers unknown calls, spots scam scripts and cloned voices live, and makes anyone claiming to be family get confirmed by the real family member. The senior never opens an app: a lamp by the phone glows green for verified family and red for scams.";

export const HOW_IT_WORKS: { step: string; detail: string }[] = [
  { step: 'AI answers unknown calls', detail: 'A voice agent picks up before Mom does.' },
  {
    step: 'Live scam scoring',
    detail: 'Urgency, secrecy, odd payment (gift cards, crypto), impersonation.',
  },
  {
    step: 'Family confirms in one tap',
    detail: '"Is this really your son?" The real son taps and approves with Face ID.',
  },
  {
    step: 'The lamp glows green or red',
    detail: 'Lamp or smart lights by the phone. The senior never reads an app.',
  },
];

export const PAYER = {
  label: 'Primary payer',
  who: 'Adult children, 40–65 (the sandwich generation), of parents 70+',
  why: 'They carry the worry and the cleanup when a parent is scammed. $12–20/mo buys a notification instead of a wire transfer.',
};

export const USER = {
  label: 'Protected user',
  who: 'The senior',
  why: 'Keeps their own phone and routine. Nothing to learn: just watch the light.',
};

export const B2B_BUYERS: { who: string; why: string }[] = [
  { who: 'Home-care agencies', why: 'Client safety is the product; a scam on their watch costs trust and contracts.' },
  { who: 'Senior-living operators', why: 'Resident safety and a differentiator for move-in decisions.' },
  { who: 'Banks & credit unions', why: 'Every stopped scam is a fraud reimbursement they do not pay.' },
  { who: 'Carriers', why: 'A value-add line feature for senior and family plans.' },
  { who: 'Insurers', why: 'Lower elder-fraud claims; a retention perk for older policyholders.' },
];

export const HEADLINE_STATS: { value: string; label: string }[] = [
  { value: '$4.8–4.9B', label: 'lost to fraud by people over 60 in 2024 (FBI IC3)' },
  { value: '+43%', label: 'year over year' },
  { value: '~$83K', label: 'average loss per victim' },
  { value: '61M', label: 'Americans are 65+ (Census 2024)' },
];

export const BENEFITS: { who: string; tone: 'verified' | 'idle' | 'screening'; points: string[] }[] = [
  {
    who: 'Senior',
    tone: 'verified',
    points: ['Never judges a suspicious call alone', 'Keeps independence: same phone, same home', 'Dignity: no app, no lecture, just a light'],
  },
  {
    who: 'Family',
    tone: 'idle',
    points: [
      'Peace of mind: a scam becomes a notification',
      'Visibility: transcripts and risk reasons',
      'One-tap control with Face ID',
      'Stay connected: one-tap video calls',
    ],
  },
  {
    who: 'B2B',
    tone: 'screening',
    points: ['Lower fraud losses and reimbursements', 'Differentiation vs. competitors', 'Resident and client safety'],
  },
];

export const INTEGRATIONS: { group: string; items: string[] }[] = [
  {
    group: 'Home',
    items: ['Philips Hue', 'Amazon Alexa', 'Google Home', 'Echo Show / Nest Hub: one-tap family video calls'],
  },
  {
    group: 'Wearables',
    items: ['Vibration / flash alerts for hearing-impaired seniors', 'Apple Watch', 'Fall-detection pendants'],
  },
  { group: 'Phone network', items: ['Landline support', 'Carrier integration (covers flip phones)'] },
  { group: 'Financial', items: ['Bank / credit-union transaction-alert tie-ins'] },
  { group: 'Care', items: ['Caregiver / agency dashboard', 'Medical-alert partners: Lively, Life Alert'] },
];

export const CONSUMER_PRICING: { name: string; price: string; detail: string }[] = [
  { name: 'Guardian', price: '$12/mo', detail: 'AI call screening, family confirmation, dashboard' },
  { name: 'Family', price: '$20/mo', detail: 'Up to 5 family verifiers, "call my family" button, priority alerts' },
  { name: 'Porchlight Kit', price: '$99', detail: 'One-time: lamp, hub and button' },
];

export const B2B_PRICING: { who: string; price: string }[] = [
  { who: 'Home-care & senior living', price: '$3–5 per resident / mo, or $5–15K/mo pilot' },
  { who: 'Banks & credit unions', price: '$1–2 per member / mo (white-label)' },
  { who: 'Carriers & landline providers', price: '~$5/mo per line (revenue share)' },
];

export const BLENDED_ARPU = 'Blended ARPU assumed at $15/mo.';

/** Monthly ramp, optimistic case: [month, subscribers end, total revenue $]. */
export const MONTHLY_RAMP: { month: number; subs: number; total: number }[] = [
  { month: 1, subs: 200, total: 8940 },
  { month: 2, subs: 450, total: 14175 },
  { month: 3, subs: 800, total: 22395 },
  { month: 4, subs: 1300, total: 39350 },
  { month: 5, subs: 2000, total: 55790 },
  { month: 6, subs: 2900, total: 85230 },
  { month: 7, subs: 4000, total: 107670 },
  { month: 8, subs: 5300, total: 133110 },
  { month: 9, subs: 6800, total: 186550 },
  { month: 10, subs: 8500, total: 217990 },
  { month: 11, subs: 10400, total: 262430 },
  { month: 12, subs: 12500, total: 299870 },
];

export const Y1_SPLIT: { label: string; value: string }[] = [
  { label: 'Subscriptions', value: '$827K' },
  { label: 'Lamp kits', value: '$371K' },
  { label: 'B2B pilots', value: '$235K' },
];

export const COMPS: { name: string; value: string; note: string }[] = [
  { name: 'Aura', value: '~11.4x', note: '$2.5B valuation on $220M+ revenue' },
  { name: 'Private cybersecurity avg.', value: '~15.2x', note: 'revenue multiple, 2025 (Finro)' },
];

export const FINANCING: { stage: string; detail: string }[] = [
  { stage: 'Seed (now)', detail: '~$2.5M at $10–12M post: working product, waitlist live' },
  { stage: 'Series A (month 12)', detail: '~$8M at ~$35M post' },
];

export const ASSUMPTIONS: string[] = [
  '~30% of smartphone-owning seniors have an engaged adult child who would pay.',
  '$15 blended ARPU across Guardian and Family.',
  '30% of new subscribers buy the $99 kit (hardware excluded from ARR).',
  'Ramp to 12,500 subscribers and 4 paid B2B pilots by month 12, fully funded.',
  'Year 2: smart-display video calling and wearable alerts launch; 2–3 carrier/bank distribution deals close.',
  'Year 2: ARPU rises to ~$16 with Family-plan mix; subscribers grow 12,500 → 55,000; kit attach stays 30%.',
  'Year 2: B2B ramps from $50K/mo to $250K/mo; a lower ~10x multiple is used as the base grows.',
  'Low / Mid / High differ by distribution: word-of-mouth only; one agency channel + paid acquisition; smart-display/wearable launch + 2–3 carrier/bank deals.',
];

export const SOURCES: { label: string; url: string }[] = [
  { label: 'FBI IC3 2024 Annual Report', url: 'https://www.ic3.gov/AnnualReport/Reports/2024_IC3Report.pdf' },
  { label: 'AARP: FBI fraud report 2024', url: 'https://www.aarp.org/money/scams-fraud/fbi-report-fraud-2024/' },
  {
    label: 'U.S. Census, Vintage 2024 population estimates',
    url: 'https://www.census.gov/newsroom/press-kits/2025/2024-population-estimates-characteristics.html',
  },
  {
    label: 'Pew: smartphone ownership (2026)',
    url: 'https://www.pewresearch.org/short-reads/2026/01/08/internet-use-smartphone-ownership-digital-divides-in-u-s/',
  },
  {
    label: 'SecurityWeek: Aura raises at $2.5B',
    url: 'https://www.securityweek.com/consumer-security-firm-aura-raises-200-million-25-billion-valuation/',
  },
  { label: 'MyScamGuide: EverSafe review', url: 'https://myscamguide.com/eversafe-review/' },
  { label: 'U.S. News: Lively review', url: 'https://www.usnews.com/360-reviews/services/cell-phone-plans/lively-review' },
  {
    label: 'TechRepublic: RoboKiller vs Nomorobo',
    url: 'https://www.techrepublic.com/article/robokiller-vs-nomorobo-which-robocall-blocker-should-ios-users-choose/',
  },
  { label: 'Finro: cybersecurity valuations mid-2025', url: 'https://www.finrofca.com/news/cybersecurity-valuation-mid-2025' },
];

// ---- Year 2 (optimistic projection, orchestrator-derived) ----

export const Y2_DRIVERS: string[] = [
  'Smart-display video calling and wearable alerts launch',
  '2–3 carrier / bank distribution deals',
  'ARPU rises to ~$16 with Family-plan mix',
  'Subscribers 12,500 → 55,000 by month 24',
];

export const Y2_REVENUE: { label: string; value: string; math: string }[] = [
  { label: 'Subscriptions', value: '≈ $6.5M', math: '~33.75K avg subscribers × $16 × 12' },
  { label: 'Lamp / wearable kits', value: '≈ $1.3M', math: '42.5K new subscribers × 30% attach × $99' },
  { label: 'B2B', value: '≈ $1.8M', math: 'ramping $50K/mo → $250K/mo' },
];

export const Y2_ARR = {
  total: '≈ $13.6M',
  math: '55K × $16 × 12 ≈ $10.6M consumer + $3.0M B2B',
};

export const VALUATION_M24 = {
  headline: '~$140M',
  math: '≈ $13.6M ARR × ~10x (more conservative multiple as the base grows)',
  range: '10–15x → $136–204M',
  financing: 'Series B-ready',
};

// ---- Low / Mid / High scenarios (High is the headline) ----

export type ScenarioKey = 'low' | 'mid' | 'high';

export interface ScenarioYear {
  revenue: string;
  arr: string;
  arrMath: string;
  valuation: string;
  valuationMath: string;
}

export interface Scenario {
  key: ScenarioKey;
  name: string;
  driver: string;
  y1: ScenarioYear;
  y2: ScenarioYear;
}

export const SCENARIO_SET: Scenario[] = [
  {
    key: 'low',
    name: 'Low',
    driver: 'Consumer word-of-mouth only; no distribution deal.',
    y1: {
      revenue: '≈ $0.15M',
      arr: '≈ $0.27M',
      arrMath: '~1,200 subscribers, no B2B',
      valuation: '≈ $4M',
      valuationMath: 'Seed-stage post-money; ARR multiples not meaningful at this size',
    },
    y2: {
      revenue: '≈ $1.2M',
      arr: '≈ $1.8M',
      arrMath: '~8,000 subscribers × $14 × 12 + small B2B',
      valuation: '≈ $15M',
      valuationMath: '~8x ARR',
    },
  },
  {
    key: 'mid',
    name: 'Mid',
    driver: 'One agency / senior-living channel plus paid acquisition.',
    y1: {
      revenue: '≈ $0.55M',
      arr: '≈ $1.1M',
      arrMath: '~5,000 subscribers + 1–2 pilots',
      valuation: '≈ $12M',
      valuationMath: '~11x ARR',
    },
    y2: {
      revenue: '≈ $4.1M',
      arr: '≈ $6.0M',
      arrMath: '~25,000 × $15 × 12 = $4.5M + $1.5M B2B',
      valuation: '≈ $60M',
      valuationMath: '~10x ARR',
    },
  },
  {
    key: 'high',
    name: 'High',
    driver: 'Smart-display / wearable launch plus 2–3 carrier / bank deals.',
    y1: {
      revenue: '≈ $1.43M',
      arr: '≈ $2.85M',
      arrMath: '12,500 × $15 × 12 = $2.25M + 4 pilots × $50K × 12 = $0.6M',
      valuation: '≈ $35M',
      valuationMath: '~12x ARR (Aura ~11.4x, private cyber avg ~15.2x); range $28–43M',
    },
    y2: {
      revenue: '≈ $9.5M',
      arr: '≈ $13.6M',
      arrMath: '55,000 × $16 × 12 ≈ $10.6M + $3.0M B2B',
      valuation: '≈ $140M',
      valuationMath: '~10x ARR; range $136–204M at 10–15x',
    },
  },
];
