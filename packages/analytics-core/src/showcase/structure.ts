// Independent reference implementation for the Sedem Ads showcase. Not production source.
//
// Account structure for the FICTIONAL company "Northwind Advisory": campaigns, ad sets / ad
// groups, ads and creatives, plus the per-campaign performance parameters the generator uses.
// Everything here is hand-written, fictional marketing copy. All URLs are under example.com.

import { type ISODate, addDays } from '../dates.js';
import type { ShowcaseAd, ShowcaseAdGroup, ShowcaseCampaign, ShowcaseCreative, CreativeFormat, CreativeTheme, GoogleChannel, MetaObjective, PerformanceTier } from './types.js';
import type { Platform } from '../spend.js';

export interface AdSpec {
  share: number;
  format: CreativeFormat;
  /** Days after the campaign start when the ad goes live (0 = at campaign start). */
  launchOffsetDays: number;
  /** Last delivery day for a paused ad. */
  endDate: ISODate | null;
}

export interface GroupSpec {
  name: string;
  targeting: string;
  share: number;
  endDate: ISODate | null;
  ads: AdSpec[];
}

export interface CampaignSpec {
  id: string;
  platform: Platform;
  name: string;
  objective: MetaObjective | null;
  channelType: GoogleChannel | null;
  tier: PerformanceTier;
  /** Base daily spend in cents before seasonality, weekday and noise. */
  base: number;
  ctr: number;
  /** Target cost per click in cents. */
  cpcMinor: number;
  /** Leads per click (lead-generating campaigns). */
  leadRate: number;
  /** Multiplier on the probability that a lead becomes an order. */
  leadQuality: number;
  start: ISODate;
  /** Last delivery day when the campaign is paused. */
  end: ISODate | null;
  budgetLevel: 'campaign' | 'ad_group';
  themes: CreativeTheme[];
  underperforming: boolean;
  /** Planted case 1: lead rate decays over the last 60 days (CPL rises). */
  rampDownLeads?: boolean;
  groups: GroupSpec[];
}

const ad = (share: number, format: CreativeFormat, launchOffsetDays = 0, endDate: ISODate | null = null): AdSpec => ({ share, format, launchOffsetDays, endDate });
const group = (name: string, targeting: string, share: number, ads: AdSpec[], endDate: ISODate | null = null): GroupSpec => ({ name, targeting, share, endDate, ads });

export const CAMPAIGN_SPECS: CampaignSpec[] = [
  {
    id: 'meta-c1', platform: 'meta', name: 'Consultations | Prospecting', objective: 'LEADS', channelType: null, tier: 'strong',
    base: 3000, ctr: 0.019, cpcMinor: 52, leadRate: 0.05, leadQuality: 1.2, start: '2025-10-01', end: null, budgetLevel: 'campaign',
    themes: ['consultation', 'business', 'family'], underperforming: false,
    groups: [
      group('Adults 30-55 | Slovenia | small business owners', 'Adults 30-55, Slovenia, interests: small business', 0.45, [ad(0.55, 'single_image'), ad(0.45, 'carousel', 60)]),
      group('Lookalike 1% | past customers', 'Lookalike 1% of past customers, Slovenia', 0.35, [ad(0.5, 'video'), ad(0.5, 'single_image', 120)]),
      group('Interests | family and property', 'Adults 28-60, Slovenia, interests: family, home buying', 0.2, [ad(0.6, 'carousel'), ad(0.4, 'single_image', 200)]),
    ],
  },
  {
    id: 'meta-c2', platform: 'meta', name: 'Retargeting | Site visitors', objective: 'LEADS', channelType: null, tier: 'average',
    base: 1400, ctr: 0.026, cpcMinor: 80, leadRate: 0.08, leadQuality: 1.0, start: '2025-10-01', end: null, budgetLevel: 'ad_group',
    themes: ['deadline', 'consultation', 'documents'], underperforming: false,
    groups: [
      group('Visitors 30 days', 'Website visitors in the last 30 days', 0.6, [ad(0.55, 'single_image'), ad(0.45, 'video')]),
      group('Engaged on social 90 days', 'People who engaged with the page in the last 90 days', 0.4, [ad(0.6, 'carousel'), ad(0.4, 'single_image', 0, '2026-09-14')]),
    ],
  },
  {
    id: 'meta-c3', platform: 'meta', name: 'Lookalike Test | Broad', objective: 'LEADS', channelType: null, tier: 'weak',
    base: 2400, ctr: 0.011, cpcMinor: 45, leadRate: 0.028, leadQuality: 0.45, start: '2025-10-01', end: null, budgetLevel: 'campaign',
    themes: ['brand', 'chat', 'property'], underperforming: true, rampDownLeads: true,
    groups: [
      group('Broad | Slovenia 25-65', 'Adults 25-65, Slovenia, broad targeting', 0.6, [ad(0.5, 'single_image'), ad(0.5, 'video')]),
      group('Lookalike 5% | website leads', 'Lookalike 5% of website leads, Slovenia', 0.4, [ad(0.55, 'carousel'), ad(0.45, 'single_image')]),
    ],
  },
  {
    id: 'meta-c4', platform: 'meta', name: 'Guides and Templates | Traffic', objective: 'TRAFFIC', channelType: null, tier: 'average',
    base: 900, ctr: 0.014, cpcMinor: 30, leadRate: 0, leadQuality: 1.0, start: '2025-10-01', end: null, budgetLevel: 'campaign',
    themes: ['documents', 'family'], underperforming: false,
    groups: [
      group('Readers | legal basics', 'Adults 25-60, Slovenia, interests: personal finance', 0.55, [ad(0.5, 'single_image'), ad(0.5, 'carousel')]),
      group('Readers | home and family', 'Adults 28-55, Slovenia, interests: parenting, real estate', 0.45, [ad(0.5, 'single_image'), ad(0.5, 'video', 90)]),
    ],
  },
  {
    id: 'meta-c5', platform: 'meta', name: 'Document Pack | Sales', objective: 'SALES', channelType: null, tier: 'average',
    base: 1100, ctr: 0.017, cpcMinor: 60, leadRate: 0, leadQuality: 1.0, start: '2026-03-16', end: null, budgetLevel: 'campaign',
    themes: ['documents', 'business', 'property'], underperforming: false,
    groups: [
      group('Purchasers lookalike', 'Lookalike 2% of purchasers, Slovenia', 0.6, [ad(0.5, 'single_image'), ad(0.5, 'carousel')]),
      group('Cart abandoners', 'Added to cart, no purchase, 14 days', 0.4, [ad(0.5, 'video'), ad(0.5, 'single_image')]),
    ],
  },
  {
    id: 'meta-c6', platform: 'meta', name: 'Spring Webinar | Leads', objective: 'LEADS', channelType: null, tier: 'average',
    base: 1200, ctr: 0.02, cpcMinor: 60, leadRate: 0.06, leadQuality: 0.9, start: '2026-02-10', end: '2026-05-31', budgetLevel: 'campaign',
    themes: ['business', 'deadline'], underperforming: false,
    groups: [
      group('Founders and freelancers', 'Adults 25-50, Slovenia, interests: entrepreneurship', 0.6, [ad(0.5, 'video'), ad(0.5, 'single_image')]),
      group('Newsletter lookalike', 'Lookalike 2% of newsletter subscribers', 0.4, [ad(0.5, 'single_image'), ad(0.5, 'carousel')]),
    ],
  },
  {
    id: 'meta-c7', platform: 'meta', name: 'Autumn Promo | Leads', objective: 'LEADS', channelType: null, tier: 'average',
    base: 1000, ctr: 0.021, cpcMinor: 65, leadRate: 0.055, leadQuality: 1.05, start: '2026-09-01', end: null, budgetLevel: 'ad_group',
    themes: ['consultation', 'deadline', 'family'], underperforming: false,
    groups: [
      group('Adults 30-60 | Slovenia', 'Adults 30-60, Slovenia', 0.6, [ad(0.5, 'single_image'), ad(0.5, 'video')]),
      group('Parents and homeowners', 'Adults 30-55, Slovenia, interests: parenting, mortgages', 0.4, [ad(0.55, 'carousel'), ad(0.45, 'single_image')]),
    ],
  },
  {
    id: 'google-c1', platform: 'google', name: 'Search | Core Services', objective: null, channelType: 'SEARCH', tier: 'strong',
    base: 1700, ctr: 0.028, cpcMinor: 135, leadRate: 0.09, leadQuality: 1.25, start: '2025-10-01', end: null, budgetLevel: 'ad_group',
    themes: [], underperforming: false,
    groups: [
      group('Contract review', 'Keywords: contract review, check my contract', 0.55, [ad(0.55, 'responsive_search'), ad(0.45, 'responsive_search', 45)]),
      group('Legal advice online', 'Keywords: online legal advice, ask a lawyer online', 0.45, [ad(0.5, 'responsive_search'), ad(0.5, 'responsive_search', 150)]),
    ],
  },
  {
    id: 'google-c2', platform: 'google', name: 'Search | Brand Terms', objective: null, channelType: 'SEARCH', tier: 'average',
    base: 600, ctr: 0.03, cpcMinor: 60, leadRate: 0.07, leadQuality: 1.1, start: '2025-10-01', end: null, budgetLevel: 'campaign',
    themes: [], underperforming: false,
    groups: [
      group('Brand name', 'Keywords: brand name and close variants', 0.65, [ad(0.6, 'responsive_search'), ad(0.4, 'responsive_search')]),
      group('Brand and pricing', 'Keywords: brand pricing, brand reviews', 0.35, [ad(0.5, 'responsive_search'), ad(0.5, 'responsive_search', 100)]),
    ],
  },
  {
    id: 'google-c3', platform: 'google', name: 'Display | Broad Awareness', objective: null, channelType: 'DISPLAY', tier: 'weak',
    base: 700, ctr: 0.009, cpcMinor: 35, leadRate: 0.008, leadQuality: 0.5, start: '2025-10-01', end: null, budgetLevel: 'campaign',
    themes: ['brand', 'consultation', 'documents'], underperforming: false,
    groups: [
      group('In-market: legal services', 'In-market audience: legal services, Slovenia', 0.6, [ad(0.5, 'responsive_display'), ad(0.5, 'responsive_display')]),
      group('Remarketing lists', 'Past site visitors, 60 days', 0.4, [ad(0.5, 'responsive_display'), ad(0.5, 'responsive_display')], '2026-07-31'),
    ],
  },
  {
    id: 'google-c4', platform: 'google', name: 'Performance Max | All Services', objective: null, channelType: 'PERFORMANCE_MAX', tier: 'average',
    base: 1300, ctr: 0.014, cpcMinor: 80, leadRate: 0.05, leadQuality: 1.0, start: '2025-11-03', end: null, budgetLevel: 'campaign',
    themes: ['consultation', 'documents', 'business', 'chat'], underperforming: false,
    groups: [
      group('Asset group | Consultations', 'Audience signal: legal advice searchers', 0.55, [ad(1, 'pmax_asset_group')]),
      group('Asset group | Documents', 'Audience signal: contract and template searchers', 0.45, [ad(0.6, 'pmax_asset_group'), ad(0.4, 'pmax_asset_group', 120)]),
    ],
  },
];

// ---------------------------------------------------------------------------------------------
// creative copy (fictional)

interface Copy {
  headline: string;
  text: string;
  title: string;
  subtitle: string;
}

const THEME_COPY: Record<CreativeTheme, Copy[]> = {
  consultation: [
    { headline: 'Talk to a legal adviser online', text: 'Get clear answers to your legal question without the office visit. Pick a time that suits you.', title: 'Ask an adviser', subtitle: 'Online, in plain language' },
    { headline: 'Your first answer within 24 hours', text: 'Describe your situation and receive a written first answer within one working day.', title: 'Answer in 24 h', subtitle: 'Written and easy to follow' },
    { headline: 'Advice from EUR 29, fixed price', text: 'No hourly surprises. Choose a quick answer or a full consultation.', title: 'From EUR 29', subtitle: 'Fixed price, no surprises' },
    { headline: 'Not sure what to do next?', text: 'Explain the problem once. We outline your options and the next step.', title: 'Know your options', subtitle: 'Your next step, explained' },
  ],
  documents: [
    { headline: 'Ready-to-use document templates', text: 'Rental, service and employment templates you can fill in and sign in minutes.', title: 'Templates', subtitle: 'Fill in, sign, done' },
    { headline: 'Stop copying contracts from forums', text: 'Our templates are reviewed by advisers and updated when the rules change.', title: 'Reviewed templates', subtitle: 'Updated when rules change' },
    { headline: 'The document pack for small teams', text: 'Everything a new business needs on paper, in one pack.', title: 'Document pack', subtitle: 'One price, every basic' },
    { headline: 'Download, adapt, sign', text: 'Choose a template, answer a few questions and get your finished document.', title: 'Your document', subtitle: 'Guided step by step' },
  ],
  family: [
    { headline: 'Family matters, explained simply', text: 'Inheritance, custody and family agreements in plain language, with a human adviser.', title: 'Family matters', subtitle: 'Plain language, real people' },
    { headline: 'Inheritance questions? Start here', text: 'Learn what happens next and what to prepare before you decide anything.', title: 'Inheritance', subtitle: 'What happens next' },
    { headline: 'Plan ahead for your family', text: 'Wills and family agreements prepared with an adviser, on your schedule.', title: 'Plan ahead', subtitle: 'Wills and agreements' },
    { headline: 'Gentle guidance, clear steps', text: 'Difficult situations are easier with a clear checklist and someone to ask.', title: 'Clear steps', subtitle: 'A checklist and a person' },
  ],
  business: [
    { headline: 'Set up your business correctly', text: 'Choose the right form, prepare the papers and avoid costly mistakes from day one.', title: 'Start right', subtitle: 'Business setup package' },
    { headline: 'Contract review for small teams', text: 'Send us the agreement. You get a summary of risks and suggested changes.', title: 'Contract review', subtitle: 'Risks, summarised' },
    { headline: 'Protect your agreements', text: 'Clear terms with clients and suppliers save arguments later.', title: 'Clear terms', subtitle: 'Fewer arguments later' },
    { headline: 'Terms and conditions for your shop', text: 'Online shop terms that match how you actually sell.', title: 'Shop terms', subtitle: 'Written for how you sell' },
  ],
  chat: [
    { headline: 'Ask our AI assistant first', text: 'Get a first overview in minutes, then continue with an adviser if you want.', title: 'Ask the assistant', subtitle: 'Overview in minutes' },
    { headline: 'Chat now, adviser later', text: 'The assistant collects the facts so your adviser starts with the full picture.', title: 'Chat first', subtitle: 'Adviser with full picture' },
    { headline: 'Answers at 2 am', text: 'Questions do not wait for office hours. Start a chat whenever it suits you.', title: 'Always on', subtitle: 'Start any time' },
    { headline: 'A first opinion in minutes', text: 'Short answers, clear sources and a straight path to a human adviser.', title: 'First opinion', subtitle: 'Then a human adviser' },
  ],
  brand: [
    { headline: 'Northwind Advisory', text: 'Clear, friendly legal help for people and small businesses, online.', title: 'Northwind Advisory', subtitle: 'Legal help, online' },
    { headline: 'Legal help without the jargon', text: 'We explain what applies to you and what to do next.', title: 'No jargon', subtitle: 'Just what applies to you' },
    { headline: 'Advice you can act on', text: 'Every answer ends with a concrete next step.', title: 'Next steps', subtitle: 'Advice you can act on' },
    { headline: 'Online legal help for everyone', text: 'Consultations, templates and contract checks from one place.', title: 'One place', subtitle: 'Consult, draft, check' },
  ],
  deadline: [
    { headline: 'Deadline coming up?', text: 'Tell us the date. We prioritise urgent questions and answer fast.', title: 'Short on time?', subtitle: 'Urgent questions first' },
    { headline: 'Do not miss a filing date', text: 'Get the key dates for your situation and a reminder checklist.', title: 'Key dates', subtitle: 'Reminder checklist' },
    { headline: 'Same-day contract check', text: 'Send the contract before noon and get a first review the same day.', title: 'Same day', subtitle: 'Contract check before noon' },
    { headline: 'Urgent question? We answer fast', text: 'Priority handling for questions with a deadline.', title: 'Priority handling', subtitle: 'For deadline questions' },
  ],
  property: [
    { headline: 'Buying or renting? Check the contract', text: 'A lease or purchase agreement is easier to sign once you know the risks.', title: 'Check before signing', subtitle: 'Lease and purchase review' },
    { headline: 'Lease review before you sign', text: 'We highlight unusual clauses and what you can negotiate.', title: 'Lease review', subtitle: 'Unusual clauses, flagged' },
    { headline: 'Property paperwork, simplified', text: 'Handover protocols, deposits and notices explained step by step.', title: 'Paperwork', subtitle: 'Step by step' },
    { headline: 'Know your rights as a tenant', text: 'Short guides and personal advice for tenants and landlords.', title: 'Tenant rights', subtitle: 'Guides and advice' },
  ],
};

const PALETTE: Record<CreativeTheme, { background: string; accent: string }> = {
  consultation: { background: '#12355b', accent: '#ffb703' },
  documents: { background: '#1b4332', accent: '#95d5b2' },
  family: { background: '#5a189a', accent: '#ffd6a5' },
  business: { background: '#0b3954', accent: '#ff6b6b' },
  chat: { background: '#1d3557', accent: '#a8dadc' },
  brand: { background: '#222831', accent: '#00adb5' },
  deadline: { background: '#7f1d1d', accent: '#fde68a' },
  property: { background: '#3d405b', accent: '#f2cc8f' },
};

const SLUG: Record<CreativeTheme, string> = {
  consultation: 'consultation', documents: 'templates', family: 'family', business: 'business', chat: 'assistant', brand: 'about', deadline: 'urgent', property: 'property',
};

const CTAS = ['Learn more', 'Sign up', 'Get quote', 'Book now', 'Contact us'];

const SEARCH_COPY: Record<string, { headlines: string[]; descriptions: string[]; slug: string }> = {
  'google-c1': {
    headlines: ['Online Legal Advice', 'Contract Review From EUR 89', 'Talk to an Adviser Today', 'Fixed-Price Legal Help', 'Answers Within 24 Hours', 'Document Templates', 'Clear, Friendly Guidance', 'Book an Online Consultation'],
    descriptions: ['Get clear answers from an adviser online. Fixed prices, no hourly surprises.', 'Describe your situation and receive a written first answer within one working day.', 'Templates, contract checks and consultations. Start in minutes.'],
    slug: 'advice',
  },
  'google-c2': {
    headlines: ['Northwind Advisory', 'Northwind Advisory Online', 'Official Northwind Site', 'Northwind Contract Review', 'Northwind Templates', 'Northwind Consultations', 'Sign In to Northwind', 'Northwind Pricing'],
    descriptions: ['The official site of Northwind Advisory. Consultations, templates and contract checks.', 'See fixed prices for every service and book online in a few minutes.'],
    slug: 'home',
  },
};

export interface AdRuntime {
  campaign: CampaignSpec;
  group: GroupSpec;
  ad: AdSpec;
  /** Relative weight inside the campaign (group share x ad share). */
  weight: number;
  /** Per-ad CTR/lead-rate quality multiplier (deterministic from the seed). */
  quality: number;
  startDate: ISODate;
  endDate: ISODate | null;
  fatigued: boolean;
}

export interface Structure {
  campaigns: ShowcaseCampaign[];
  adGroups: ShowcaseAdGroup[];
  ads: ShowcaseAd[];
  creatives: ShowcaseCreative[];
  specs: CampaignSpec[];
  runtime: Map<string, AdRuntime>;
}

export const FATIGUED_AD_ID = 'meta-c1-g1-a1';

const roundTo = (x: number, step: number): number => Math.round(x / step) * step;
const minDate = (a: ISODate | null, b: ISODate | null): ISODate | null => (a === null ? b : b === null ? a : a < b ? a : b);

export function buildStructure(rng: () => number): Structure {
  const campaigns: ShowcaseCampaign[] = [];
  const adGroups: ShowcaseAdGroup[] = [];
  const ads: ShowcaseAd[] = [];
  const creatives: ShowcaseCreative[] = [];
  const runtime = new Map<string, AdRuntime>();
  const themeUse = new Map<CreativeTheme, number>();
  let creativeSeq = 0;
  let ctaSeq = 0;

  for (const spec of CAMPAIGN_SPECS) {
    campaigns.push({
      id: spec.id,
      platform: spec.platform,
      name: spec.name,
      underperforming: spec.underperforming,
      status: spec.end ? 'PAUSED' : 'ACTIVE',
      objective: spec.objective,
      channelType: spec.channelType,
      dailyBudgetMinor: spec.budgetLevel === 'campaign' ? roundTo(spec.base * 1.2, 500) : null,
      budgetLevel: spec.budgetLevel,
      startDate: spec.start,
      tier: spec.tier,
    });
    let adCounter = 0;
    spec.groups.forEach((g, gi) => {
      const groupId = `${spec.id}-g${gi + 1}`;
      const groupEnd = minDate(spec.end, g.endDate);
      adGroups.push({
        id: groupId,
        campaignId: spec.id,
        platform: spec.platform,
        name: g.name,
        status: g.endDate || spec.end ? 'PAUSED' : 'ACTIVE',
        dailyBudgetMinor: spec.budgetLevel === 'ad_group' ? roundTo(spec.base * g.share * 1.2, 100) : null,
        targeting: g.targeting,
      });
      g.ads.forEach((a, ai) => {
        const adId = `${groupId}-a${ai + 1}`;
        const start = addDays(spec.start, a.launchOffsetDays);
        const end = minDate(groupEnd, a.endDate);
        const quality = 0.85 + 0.3 * rng();

        // creative
        creativeSeq += 1;
        const creativeId = `cr-${spec.platform}-${String(creativeSeq).padStart(3, '0')}`;
        const cta = CTAS[ctaSeq++ % CTAS.length]!;
        let creative: ShowcaseCreative;
        if (spec.channelType === 'SEARCH') {
          const copy = SEARCH_COPY[spec.id]!;
          const rot = (adCounter * 2) % copy.headlines.length;
          const headlines = [...copy.headlines.slice(rot), ...copy.headlines.slice(0, rot)].slice(0, 6);
          creative = {
            id: creativeId, platform: 'google', format: 'responsive_search', headline: headlines[0]!, headlines,
            primaryText: copy.descriptions[0]!, descriptions: copy.descriptions, callToAction: 'Learn more',
            finalUrl: `https://example.com/advisory/${copy.slug}`, visual: null,
          };
        } else {
          const themes = spec.themes;
          const theme = themes[adCounter % themes.length]!;
          const used = themeUse.get(theme) ?? 0;
          themeUse.set(theme, used + 1);
          const copy = THEME_COPY[theme][used % 4]!;
          const pal = PALETTE[theme];
          const isGoogle = spec.platform === 'google';
          const alt = THEME_COPY[theme][(used + 1) % 4]!;
          creative = {
            id: creativeId,
            platform: spec.platform,
            format: a.format,
            headline: copy.headline,
            headlines: isGoogle ? [copy.headline, alt.headline, copy.title, alt.title, 'Northwind Advisory'] : [copy.headline],
            primaryText: copy.text,
            descriptions: isGoogle ? [copy.text, alt.text] : [copy.subtitle],
            callToAction: isGoogle ? 'Learn more' : cta,
            finalUrl: `https://example.com/advisory/${SLUG[theme]}`,
            visual: { theme, background: pal.background, accent: pal.accent, title: copy.title, subtitle: copy.subtitle },
          };
        }
        creatives.push(creative);

        const fatigued = adId === FATIGUED_AD_ID;
        ads.push({
          id: adId,
          adGroupId: groupId,
          campaignId: spec.id,
          platform: spec.platform,
          name: spec.platform === 'google' && spec.channelType === 'SEARCH' ? `RSA ${String.fromCharCode(65 + gi * 2 + ai)}` : `Creative ${String.fromCharCode(65 + adCounter)}`,
          launchDate: start,
          fatigued,
          status: end ? 'PAUSED' : 'ACTIVE',
          creativeId,
        });
        runtime.set(adId, { campaign: spec, group: g, ad: a, weight: g.share * a.share, quality, startDate: start, endDate: end, fatigued });
        adCounter += 1;
      });
    });
  }
  return { campaigns, adGroups, ads, creatives, specs: CAMPAIGN_SPECS, runtime };
}
