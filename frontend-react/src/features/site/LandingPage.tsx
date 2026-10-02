import { useEffect, useState, type ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { Ltr, useI18n } from '../../lib/i18n';
import { ensureGoogleFonts } from '../../lib/fonts';
import type { Lang } from '../../lib/types';
import { SiteFooter } from './SiteFooter';
import { Logo, LangSwitch } from './SiteHeader';
import LeadForm from './LeadForm';
import { CUSTOMERS } from './customers';
import { useReveal } from './reveal';
import { TeamScene, QrScene, PadScene, KitchenScene, MenuScene, TruckScene, CloseScene } from './DayScenes';
import './site.css';

/* ─────────────────────────────────────────────────────────────────────────
   Serva — the earlier landing concept, told as one day of service. Parked at /day
   (unindexed) since the "built for your venue" page (VenueLanding) took over /.

   The page is a day: 06:30 opening to 23:30 close. Each chapter is an hour where
   one part of the product carries the service, shown at the kind of venue it
   matters most to — café mornings, restaurant lunch, food-truck evenings. A clock
   under the header advances as you scroll, and the sky runs dawn → sunset → night,
   so the reader always knows where in the day they are.

   The whole page lives under <div id="neo">, the scope Tailwind is confined to
   (tailwind.config.js: important:'#neo', preflight off), so none of these
   utilities can leak onto the customer / dashboard / admin apps.
   ───────────────────────────────────────────────────────────────────────── */

/* ── the day ─────────────────────────────────────────────────────────────── */
type Tone = 'dawn' | 'day' | 'mist' | 'sand' | 'night' | 'deep';
type Chapter = { id: string; time: string; min: number; tone: Tone; Scene: ComponentType<{ lang: Lang }> };

const CHAPTERS: Chapter[] = [
  { id: 't-0630', time: '06:30', min: 390, tone: 'dawn', Scene: TeamScene },
  { id: 't-0730', time: '07:30', min: 450, tone: 'day', Scene: QrScene },
  { id: 't-1000', time: '10:00', min: 600, tone: 'mist', Scene: PadScene },
  { id: 't-1300', time: '13:00', min: 780, tone: 'day', Scene: KitchenScene },
  { id: 't-1600', time: '16:00', min: 960, tone: 'sand', Scene: MenuScene },
  { id: 't-2000', time: '20:00', min: 1200, tone: 'night', Scene: TruckScene },
  { id: 't-2330', time: '23:30', min: 1410, tone: 'deep', Scene: CloseScene },
];
/* The clock also stops at the sunset band and at the midnight review, neither of
   which is a chapter of its own. */
const SUNSET = { id: 't-1800', min: 1080 };
const REVIEW = { id: 'system', min: 1440 };
const DAY_START = 360; // 06:00
const DAY_END = 1440; // midnight
const isNight = (t: Tone) => t === 'night' || t === 'deep';

const TONE: Record<Tone, string> = {
  dawn: 'sv-dawn text-sv-ink',
  day: 'bg-white text-sv-ink',
  mist: 'bg-sv-mist text-sv-ink',
  sand: 'bg-[#FAF7F0] text-sv-ink',
  night: 'bg-[#0F1A1F] text-white',
  deep: 'bg-sv-ink text-white',
};

/* ── parallel AR / EN content ────────────────────────────────────────────── */
type ChapterCopy = { name: string; venue: string; feature: string; title: string; body: string; points: string[] };
type Plan = { name: string; price: string; tagline: string; features: string[]; featured?: boolean };
type Copy = {
  nav: { day: string; features: string; setup: string; pricing: string; faq: string; login: string; cta: string; menu: string };
  hero: { eyebrow: string; l1: string; l2: string; sub: string; cta: string; proof: string[]; ribbon: string };
  customers: string;
  day: { kicker: string; title: string; sub: string; chapters: ChapterCopy[] };
  sunset: { name: string; title: string; sub: string };
  midnight: string;
  system: { clock: string; kicker: string; title: string; sub: string; modules: { t: string; d: string; at?: string }[] };
  setup: { kicker: string; title: string; sub: string; steps: { t: string; d: string }[]; note: string };
  pricing: {
    kicker: string; title: string; sub: string; cur: string; per: string; setup: string; badge: string;
    cta: string; plans: Plan[]; custom: { title: string; body: string; cta: string }; note: string;
  };
  faq: { kicker: string; title: string; more: string; items: { q: string; a: string }[] };
  contact: { kicker: string; title: string; sub: string };
};

const COPY: Record<Lang, Copy> = {
  en: {
    nav: { day: 'A day on Serva', features: 'Features', setup: 'Setup', pricing: 'Pricing', faq: 'FAQ', login: 'Log in', cta: 'Book a consultation', menu: 'Menu' },
    hero: {
      eyebrow: 'For cafés, restaurants and food trucks in Oman',
      l1: 'From the first coffee', l2: 'to the last order.',
      sub: 'Serva is the point of sale, QR ordering, kitchen printing, stock and loyalty system behind independent venues across Oman — set up by our team around the way you serve.',
      cta: 'Book a consultation',
      proof: ['Set up by our team', 'Arabic and English', 'Runs on devices you own'],
      ribbon: 'Walk through a day of service',
    },
    customers: 'Running today at',
    day: {
      kicker: 'A day on Serva',
      title: 'One day, from opening to close.',
      sub: 'Follow a single day from unlocking the door to closing the till. Each hour shows the part of Serva that carries it — at the kind of venue where it matters most.',
      chapters: [
        {
          name: 'Opening', venue: 'Every venue', feature: 'Team & till',
          title: 'Everyone logs in to exactly what their job needs.',
          body: 'The barista sees orders, the cashier sees the till, the owner sees everything. The till opens with a counted float, so the day’s cash has a starting point.',
          points: ['Staff logins with permissions per person', 'Till opened and closed with a counted float', 'Works on the phones and tablets you already have'],
        },
        {
          name: 'Morning rush', venue: 'At a café', feature: 'QR ordering',
          title: 'The queue orders before it reaches the counter.',
          body: 'Guests scan the QR code and order from their own phone, in Arabic or English — nothing to download. Orders reach the bar the moment they are placed, and regulars collect a stamp with every visit.',
          points: ['QR menu in Arabic and English', 'Orders appear on the bar screen instantly', 'Digital stamp cards for regulars'],
        },
        {
          name: 'At the counter', venue: 'At a café', feature: 'Point of sale',
          title: 'Walk-ins rung up in a few taps.',
          body: 'A tap per item, a tap per option. Extra shot, oat milk, less sugar — each one is a button, not a scribbled note, so the drink is right the first time.',
          points: ['Options and add-ons priced automatically', 'Cash or card, recorded against the till', 'A pager number or name on every order'],
        },
        {
          name: 'Lunch service', venue: 'At a restaurant', feature: 'Kitchen & tables',
          title: 'Every table orders on its own, and the kitchen knows at once.',
          body: 'Each table has its own QR code, so orders arrive already labelled. Tickets print on the kitchen printer the moment an order is placed, and the floor can see which tables are waiting.',
          points: ['A QR code for every table', 'Kitchen tickets print automatically', 'Live order board: new, preparing, ready'],
        },
        {
          name: 'Quiet hour', venue: 'Every venue', feature: 'Menu',
          title: 'Change the menu between orders, not between print runs.',
          body: 'Sold out of kunafa? Switch it off and guests stop seeing it. A new price, a new photo, a seasonal drink — edit it once and every QR code and branch shows it.',
          points: ['Sold-out items hidden from guests', 'Every item named in Arabic and English', 'A menu design that matches your brand'],
        },
        {
          name: 'Evening window', venue: 'At a food truck', feature: 'Order tracking',
          title: 'Call pager 17, and the right guest is already walking over.',
          body: 'At a truck window there is no table to carry food to. Guests follow their order on their own phone — sent, being prepared, ready — and you call a number, not a name.',
          points: ['A pager number or name on each order', 'Live order tracking on the guest’s phone', 'Runs on a single phone or tablet'],
        },
        {
          name: 'Closing', venue: 'Every venue', feature: 'Reports & stock',
          title: 'Count the till, read the day, go home.',
          body: 'Close the till against the cash Serva expects. The day’s report is waiting: sales, orders by hour, and which supplies will run out first.',
          points: ['Till closed against the expected cash', 'Sales, orders and busiest hours', 'Stock with days of cover left'],
        },
      ],
    },
    sunset: { name: 'Sunset', title: 'Sunset. The evening shift begins.', sub: 'Cafés wind down, and the food trucks open their windows.' },
    midnight: 'Day closed. Tomorrow opens at',
    system: {
      clock: 'The day in review',
      kicker: 'Features',
      title: 'Everything the day needed, in one system.',
      sub: 'Each part works with the others — an order taken at a table reaches the kitchen, the till and the report without anyone typing it twice.',
      modules: [
        { t: 'Point of sale', d: 'A fast order pad with options, notes and pagers — cash or card.', at: '10:00' },
        { t: 'QR ordering', d: 'A code for every table or counter. Guests order in Arabic or English.', at: '07:30' },
        { t: 'Kitchen printing', d: 'Tickets print on kitchen and bar printers as orders arrive.', at: '13:00' },
        { t: 'Live order board', d: 'New, preparing, ready — the whole team sees the same board.', at: '13:00' },
        { t: 'Order tracking', d: 'Guests follow their order on their own phone. Call them by pager.', at: '20:00' },
        { t: 'Menu management', d: 'Prices, photos, sold-out items and menu design, in both languages.', at: '16:00' },
        { t: 'Loyalty', d: 'Digital stamp cards that bring regulars back.', at: '07:30' },
        { t: 'Team & permissions', d: 'A login for every staff member, with only the access they need.', at: '06:30' },
        { t: 'Till & cash', d: 'Opening float, cash and card sales, and the variance at close.', at: '23:30' },
        { t: 'Reports', d: 'Sales, best sellers, busy hours and returning guests.', at: '23:30' },
        { t: 'Stock', d: 'Supplies, recipes and days of cover — before anything runs out.', at: '23:30' },
        { t: 'Branches', d: 'Every location under one account and one report.' },
      ],
    },
    setup: {
      kicker: 'Tomorrow, 06:30',
      title: 'We set Serva up around your day.',
      sub: 'No two venues run the same day, so there is no template for you to fill in alone. Our team builds your setup with you.',
      steps: [
        { t: 'Consultation', d: 'A call or a visit. We learn how you take orders, where your printers sit, and who does what.' },
        { t: 'Build', d: 'We import your menu from a PDF or a delivery-app page, in Arabic and English, and match it to your brand.' },
        { t: 'Launch', d: 'We connect your printers, create staff logins, and walk your team through it before their first shift.' },
        { t: 'Grow', d: 'Add loyalty, tables or another branch when you need them — without starting over.' },
      ],
      note: 'Most venues go live within a week.',
    },
    pricing: {
      kicker: 'Pricing', title: 'Clear plans, one setup fee.',
      sub: 'Every plan starts with a one-time 50 OMR setup: consultation, menu build and launch.',
      cur: 'OMR', per: 'per month', setup: '+ 50 OMR one-time setup', badge: 'Most popular', cta: 'Start with',
      plans: [
        { name: 'Standard', price: '15', tagline: 'For one venue getting started.', features: ['Point of sale', 'Online & QR ordering', 'Menu management', 'Basic analytics', 'Single branch', 'Email support'] },
        { name: 'Pro', price: '20', tagline: 'Standard, plus the tools that bring guests back.', featured: true, features: ['Everything in Standard', 'Loyalty program', 'Advanced analytics', 'Customer data tools', 'Multi-branch', 'Priority support'] },
      ],
      custom: { title: 'Several branches, a franchise, or a setup of your own?', body: 'We’ll put together a plan that fits how you run.', cta: 'Talk to us' },
      note: 'All prices in Omani rials.',
    },
    faq: {
      kicker: 'FAQ', title: 'What owners ask us first.', more: 'Another question? Send it with the form.',
      items: [
        { q: 'Is there a setup fee?', a: 'Yes — a one-time 50 OMR on either plan. It covers the consultation, building your menu, and launch.' },
        { q: 'Do I need special hardware?', a: 'No. Serva runs on the phones, tablets and computers you already have. If you want printed kitchen tickets, we help you connect a receipt printer.' },
        { q: 'Does it work for a food truck or a kiosk?', a: 'Yes. One phone or tablet can run the whole counter. Guests can order by QR and follow their order on their own phone, and you call them by pager number or name.' },
        { q: 'Can you bring over my current menu?', a: 'Yes. Send us your PDF menu or your delivery-app page and we build it in Serva, in Arabic and English.' },
        { q: 'What is the difference between Standard and Pro?', a: 'Pro includes everything in Standard, plus loyalty, advanced analytics, customer-data tools and multi-branch support.' },
        { q: 'Can I upgrade later?', a: 'Anytime. Move from Standard to Pro when you’re ready — with no second setup fee.' },
      ],
    },
    contact: {
      kicker: 'Get started', title: 'Tell us about your venue.',
      sub: 'Leave your details and we’ll call you within one working day to plan your setup.',
    },
  },
  ar: {
    nav: { day: 'يوم مع سيرفا', features: 'المزايا', setup: 'التجهيز', pricing: 'الأسعار', faq: 'الأسئلة', login: 'تسجيل الدخول', cta: 'احجز استشارة', menu: 'القائمة' },
    hero: {
      eyebrow: 'للمقاهي والمطاعم وعربات الطعام في عُمان',
      l1: 'من أول قهوة', l2: 'حتى آخر طلب.',
      sub: 'سيرفا هو نظام نقاط البيع والطلب عبر QR وطباعة المطبخ والمخزون والولاء الذي تعمل به منشآت مستقلة في أنحاء عُمان — ويجهّزه فريقنا على طريقة خدمتك أنت.',
      cta: 'احجز استشارة',
      proof: ['يجهّزه فريقنا', 'بالعربية والإنجليزية', 'يعمل على أجهزتك الحالية'],
      ribbon: 'تجوّل في يوم خدمة كامل',
    },
    customers: 'يعمل اليوم لدى',
    day: {
      kicker: 'يوم مع سيرفا',
      title: 'يومٌ كامل، من الافتتاح إلى الإغلاق.',
      sub: 'تابع يوماً واحداً من فتح الباب حتى إغلاق الدرج. كل ساعة تعرض الجزء من سيرفا الذي يحملها — في نوع المنشأة الذي يحتاجه أكثر.',
      chapters: [
        {
          name: 'الافتتاح', venue: 'كل منشأة', feature: 'الفريق والدرج',
          title: 'كلٌّ يدخل إلى ما يحتاجه عمله فقط.',
          body: 'الباريستا يرى الطلبات، والكاشير يرى الدرج، والمالك يرى كل شيء. ويُفتح الدرج بمبلغ افتتاحي معدود، فيكون لنقد اليوم نقطة بداية واضحة.',
          points: ['حسابات للفريق بصلاحيات لكل شخص', 'فتح الدرج وإغلاقه بمبلغ معدود', 'يعمل على الهواتف والأجهزة اللوحية التي لديك'],
        },
        {
          name: 'زحمة الصباح', venue: 'في المقهى', feature: 'الطلب عبر QR',
          title: 'الطابور يطلب قبل أن يصل إلى الكاونتر.',
          body: 'يمسح الضيوف رمز QR ويطلبون من هواتفهم بالعربية أو الإنجليزية — دون تحميل أي تطبيق. تصل الطلبات إلى البار لحظة إرسالها، ويجمع الزبائن الدائمون ختماً مع كل زيارة.',
          points: ['قائمة QR بالعربية والإنجليزية', 'تظهر الطلبات على شاشة البار فوراً', 'بطاقات أختام رقمية للزبائن الدائمين'],
        },
        {
          name: 'على الكاونتر', venue: 'في المقهى', feature: 'نقاط البيع',
          title: 'طلبات الزبائن الحاضرين ببضع لمسات.',
          body: 'لمسة لكل صنف، ولمسة لكل خيار. شوت إضافي، حليب شوفان، سكر أقل — كلٌّ منها زر لا ملاحظة مكتوبة، فيُحضَّر المشروب صحيحاً من المرة الأولى.',
          points: ['خيارات وإضافات تُسعَّر تلقائياً', 'نقداً أو بالبطاقة، ويُسجَّل على الدرج', 'رقم البيجر أو اسم الضيف على كل طلب'],
        },
        {
          name: 'خدمة الغداء', venue: 'في المطعم', feature: 'المطبخ والطاولات',
          title: 'كل طاولة تطلب بنفسها، والمطبخ يعلم فوراً.',
          body: 'لكل طاولة رمز QR خاص بها، فتصل الطلبات موسومة برقمها. تُطبع التذكرة على طابعة المطبخ لحظة الطلب، ويرى فريق الصالة أي الطاولات تنتظر.',
          points: ['رمز QR لكل طاولة', 'تذاكر المطبخ تُطبع تلقائياً', 'لوحة طلبات حيّة: جديد، قيد التحضير، جاهز'],
        },
        {
          name: 'ساعة الهدوء', venue: 'كل منشأة', feature: 'القائمة',
          title: 'عدّل القائمة بين طلبين، لا بين طبعتين.',
          body: 'نفدت الكنافة؟ أوقفها فيتوقف الضيوف عن رؤيتها. سعر جديد، صورة جديدة، مشروب موسمي — عدّله مرة واحدة فيظهر على كل رمز QR وفي كل فرع.',
          points: ['إخفاء الأصناف النافدة عن الضيوف', 'اسم كل صنف بالعربية والإنجليزية', 'تصميم قائمة يطابق هويّتك'],
        },
        {
          name: 'نافذة المساء', venue: 'في عربة الطعام', feature: 'تتبّع الطلبات',
          title: 'نادِ البيجر 17، والضيف المعني في طريقه إليك.',
          body: 'عند نافذة العربة لا توجد طاولة تُحمل إليها الطلبات. يتابع الضيوف طلبهم على هواتفهم — أُرسل، يُحضَّر، جاهز — وأنت تنادي رقماً لا اسماً.',
          points: ['رقم بيجر أو اسم لكل طلب', 'تتبّع الطلب مباشرة على هاتف الضيف', 'يعمل على هاتف أو جهاز لوحي واحد'],
        },
        {
          name: 'الإغلاق', venue: 'كل منشأة', feature: 'التقارير والمخزون',
          title: 'أغلق الدرج، اقرأ يومك، وعُد إلى البيت.',
          body: 'أغلق الدرج مقابل النقد الذي تتوقّعه سيرفا. تقرير اليوم بانتظارك: المبيعات، والطلبات حسب الساعة، وأي المستلزمات سينفد أولاً.',
          points: ['إغلاق الدرج مقابل النقد المتوقَّع', 'المبيعات والطلبات وساعات الذروة', 'المخزون وعدد الأيام التي يكفيها'],
        },
      ],
    },
    sunset: { name: 'الغروب', title: 'الغروب. تبدأ مناوبة المساء.', sub: 'تهدأ المقاهي، وتفتح عربات الطعام نوافذها.' },
    midnight: 'انتهى اليوم. الغد يبدأ عند',
    system: {
      clock: 'حصيلة اليوم',
      kicker: 'المزايا',
      title: 'كل ما احتاجه اليوم، في نظام واحد.',
      sub: 'كل جزء يعمل مع البقية — الطلب الذي يُسجَّل على الطاولة يصل إلى المطبخ والدرج والتقرير دون أن يكتبه أحد مرتين.',
      modules: [
        { t: 'نقاط البيع', d: 'شاشة طلب سريعة بالخيارات والملاحظات والبيجر — نقداً أو بالبطاقة.', at: '10:00' },
        { t: 'الطلب عبر QR', d: 'رمز لكل طاولة أو كاونتر، ويطلب الضيوف بالعربية أو الإنجليزية.', at: '07:30' },
        { t: 'طباعة المطبخ', d: 'تُطبع التذاكر على طابعات المطبخ والبار فور وصول الطلب.', at: '13:00' },
        { t: 'لوحة الطلبات', d: 'جديد، قيد التحضير، جاهز — الفريق كله يرى اللوحة نفسها.', at: '13:00' },
        { t: 'تتبّع الطلب', d: 'يتابع الضيوف طلبهم على هواتفهم، وتناديهم برقم البيجر.', at: '20:00' },
        { t: 'إدارة القائمة', d: 'الأسعار والصور والأصناف النافدة وتصميم القائمة، باللغتين.', at: '16:00' },
        { t: 'الولاء', d: 'بطاقات أختام رقمية تُعيد الزبائن الدائمين.', at: '07:30' },
        { t: 'الفريق والصلاحيات', d: 'حساب لكل موظف، بالصلاحيات التي يحتاجها فقط.', at: '06:30' },
        { t: 'الدرج والنقد', d: 'المبلغ الافتتاحي، ومبيعات النقد والبطاقة، والفرق عند الإغلاق.', at: '23:30' },
        { t: 'التقارير', d: 'المبيعات والأكثر مبيعاً وساعات الذروة والضيوف العائدون.', at: '23:30' },
        { t: 'المخزون', d: 'المستلزمات والوصفات وعدد الأيام التي تكفيها — قبل أن ينفد شيء.', at: '23:30' },
        { t: 'الفروع', d: 'كل مواقعك تحت حساب واحد وتقرير واحد.' },
      ],
    },
    setup: {
      kicker: 'غداً، 06:30',
      title: 'نجهّز سيرفا على مقاس يومك.',
      sub: 'لا تتشابه منشأتان في يومهما، لذا لا نترك لك قالباً تملؤه وحدك. يبني فريقنا تجهيزك معك.',
      steps: [
        { t: 'الاستشارة', d: 'مكالمة أو زيارة. نتعرّف على طريقة استقبالك للطلبات، وأماكن طابعاتك، ومهمة كل فرد في فريقك.' },
        { t: 'البناء', d: 'نستورد قائمتك من ملف PDF أو من صفحتك على تطبيق التوصيل، بالعربية والإنجليزية، ونطابقها مع هويّتك.' },
        { t: 'الإطلاق', d: 'نوصل الطابعات، وننشئ حسابات الفريق، ونشرح لفريقك كل شيء قبل مناوبته الأولى.' },
        { t: 'النمو', d: 'أضف الولاء أو الطاولات أو فرعاً جديداً متى احتجت — دون أن تبدأ من جديد.' },
      ],
      note: 'معظم المنشآت تنطلق خلال أسبوع.',
    },
    pricing: {
      kicker: 'الأسعار', title: 'خطط واضحة، ورسوم تجهيز واحدة.',
      sub: 'تبدأ كل خطة برسوم تجهيز لمرة واحدة قدرها 50 ر.ع: الاستشارة، وبناء القائمة، والإطلاق.',
      cur: 'ر.ع', per: 'شهرياً', setup: '+ 50 ر.ع تجهيز لمرة واحدة', badge: 'الأكثر طلباً', cta: 'ابدأ بخطة',
      plans: [
        { name: 'ستاندرد', price: '15', tagline: 'لمنشأة واحدة في بدايتها.', features: ['نقاط البيع', 'الطلب أونلاين وعبر QR', 'إدارة القائمة', 'تحليلات أساسية', 'فرع واحد', 'دعم بالبريد'] },
        { name: 'برو', price: '20', tagline: 'ستاندرد، مع أدوات تُعيد الضيوف إليك.', featured: true, features: ['كل مزايا ستاندرد', 'برنامج الولاء', 'تحليلات متقدّمة', 'أدوات بيانات العملاء', 'فروع متعدّدة', 'دعم أولوية'] },
      ],
      custom: { title: 'لديك عدّة فروع، أو امتياز تجاري، أو احتياج خاص؟', body: 'نعدّ لك خطة تناسب طريقة عملك.', cta: 'تحدّث معنا' },
      note: 'جميع الأسعار بالريال العُماني.',
    },
    faq: {
      kicker: 'الأسئلة الشائعة', title: 'أول ما يسألنا عنه أصحاب المنشآت.', more: 'عندك سؤال آخر؟ أرسله عبر النموذج.',
      items: [
        { q: 'هل هناك رسوم تجهيز؟', a: 'نعم — 50 ر.ع لمرة واحدة على أيّ من الخطتين. تشمل الاستشارة وبناء قائمتك والإطلاق.' },
        { q: 'هل أحتاج أجهزة خاصة؟', a: 'لا. تعمل سيرفا على الهواتف والأجهزة اللوحية والحواسيب التي لديك. وإن أردت تذاكر مطبوعة للمطبخ، نساعدك على توصيل طابعة إيصالات.' },
        { q: 'هل تناسب عربة طعام أو كشكاً؟', a: 'نعم. يكفي هاتف أو جهاز لوحي واحد لإدارة الكاونتر كله. يطلب الضيوف عبر QR ويتابعون طلبهم على هواتفهم، وتناديهم برقم البيجر أو بالاسم.' },
        { q: 'هل يمكنكم نقل قائمتي الحالية؟', a: 'نعم. أرسل لنا قائمتك بصيغة PDF أو صفحتك على تطبيق التوصيل، ونبنيها في سيرفا بالعربية والإنجليزية.' },
        { q: 'ما الفرق بين ستاندرد وبرو؟', a: 'تشمل برو كل ما في ستاندرد، مع الولاء والتحليلات المتقدّمة وأدوات بيانات العملاء ودعم الفروع المتعدّدة.' },
        { q: 'هل يمكنني الترقية لاحقاً؟', a: 'في أي وقت. انتقل من ستاندرد إلى برو متى شئت — دون رسوم تجهيز جديدة.' },
      ],
    },
    contact: {
      kicker: 'ابدأ الآن', title: 'حدّثنا عن منشأتك.',
      sub: 'اترك بياناتك وسنتصل بك خلال يوم عمل واحد لنخطّط تجهيزك.',
    },
  },
};

/* ── hooks ───────────────────────────────────────────────────────────────── */

type Clock = { visible: boolean; stop: number; min: number };
/* Every place the clock can stand, in scroll order: the chapters plus sunset. */
const STOPS = [...CHAPTERS.slice(0, 5), SUNSET, ...CHAPTERS.slice(5), REVIEW].map((s) => ({ id: s.id, min: s.min }));

/** The time of day at the reading line, interpolated through whichever stop it is in. */
function useServiceClock(): Clock {
  const [clock, setClock] = useState<Clock>({ visible: false, stop: 0, min: DAY_START });
  useEffect(() => {
    let raf = 0;
    const update = () => {
      const line = window.innerHeight * 0.42;
      let next: Clock = { visible: false, stop: 0, min: DAY_START };
      STOPS.forEach((s, i) => {
        const r = document.getElementById(s.id)?.getBoundingClientRect();
        if (!r || r.top > line || r.bottom <= line) return;
        const p = (line - r.top) / r.height;
        const end = STOPS[i + 1]?.min ?? DAY_END;
        // Snap to five minutes: a clock that ticks every pixel reads as noise.
        next = { visible: true, stop: i, min: Math.floor((s.min + p * (end - s.min)) / 5) * 5 };
      });
      setClock((c) => (c.visible === next.visible && c.stop === next.stop && c.min === next.min ? c : next));
    };
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); };
  }, []);
  return clock;
}

const fmt = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
/** Minutes since 06:00 as a percentage of the day, mirrored for RTL. */
const dayPos = (min: number, rtl: boolean) => {
  const p = ((min - DAY_START) / (DAY_END - DAY_START)) * 100;
  return rtl ? 100 - p : p;
};

/* ── small pieces ────────────────────────────────────────────────────────── */
function Check({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" className={`mt-[3px] shrink-0 ${className}`}>
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Mono caps in English. Arabic has no caps and Plex Mono has no Arabic glyphs, so it
    gets the sans face at a readable size instead of letters pulled apart. */
function Kicker({ children, night = false }: { children: string; night?: boolean }) {
  const { lang } = useI18n();
  const face = lang === 'ar' ? 'text-sm font-semibold' : 'font-mono text-xs font-medium uppercase tracking-[0.16em]';
  return <p className={`${face} ${night ? 'text-sv-mint' : 'text-sv-green'}`}>{children}</p>;
}

/* ── the ribbon: the whole day as the hero's table of contents ──────────── */
function Ribbon({ lang, rtl, label }: { lang: Lang; rtl: boolean; label: string }) {
  const chapters = COPY[lang].day.chapters;
  const n = CHAPTERS.length;
  const col = (i: number) => { const p = ((i + 0.5) / n) * 100; return rtl ? 100 - p : p; };
  return (
    <nav aria-label={label} className="mt-14 md:mt-20">
      <p className="mb-4 text-sm font-medium text-sv-slate">{label}</p>
      {/* hour ticks */}
      <div className="relative h-4 font-mono text-[11px] text-sv-slate" dir="ltr" aria-hidden="true">
        {[6, 9, 12, 15, 18, 21, 24].map((h) => (
          <span key={h} className="absolute -translate-x-1/2 tnum" style={{ left: `${dayPos(h * 60, rtl)}%` }}>{fmt(h * 60).slice(0, 2)}</span>
        ))}
      </div>
      {/* the sky, with a pin at each hour we visit */}
      <div className="relative mt-2 h-3 rounded-full sv-sky" dir="ltr" aria-hidden="true">
        {CHAPTERS.map((c) => (
          <span key={c.id} className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-sv-ink shadow sm:h-4 sm:w-4 sm:border-[3px]" style={{ left: `${dayPos(c.min, rtl)}%` }} />
        ))}
      </div>
      {/* each pin leans over to its label — proportional time above, even columns below */}
      <svg className="hidden h-10 w-full text-sv-ink lg:block" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
        {CHAPTERS.map((c, i) => (
          <line key={c.id} x1={dayPos(c.min, rtl)} y1="0" x2={col(i)} y2="40" stroke="currentColor" strokeOpacity="0.22" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <ol className="-mx-5 mt-4 flex snap-x scroll-px-5 gap-2 overflow-x-auto px-5 pb-2 sm:-mx-8 sm:scroll-px-8 sm:px-8 lg:mx-0 lg:mt-0 lg:grid lg:grid-cols-7 lg:gap-3 lg:overflow-visible lg:px-0">
        {CHAPTERS.map((c, i) => (
          <li key={c.id} className="shrink-0 snap-start lg:shrink">
            <a href={`#${c.id}`} className="group block min-w-[132px] rounded-xl border border-sv-line bg-white px-3 py-2.5 transition-colors hover:border-sv-ink/30 hover:bg-sv-mist lg:min-w-0 lg:text-center">
              <span className="block font-mono text-xs font-medium text-sv-green tnum">{c.time}</span>
              <span className="mt-0.5 block text-sm font-medium text-sv-ink">{chapters[i].name}</span>
              <span className="block text-xs text-sv-slate">{chapters[i].feature}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Dark once the reading line is past the sunset band's midpoint — header and clock follow. */
const isNightClock = (clock: Clock) => clock.visible && clock.min >= SUNSET.min + 60;

/* ── the clock that rides under the header through the day ──────────────── */
function ClockBar({ clock, lang, rtl }: { clock: Clock; lang: Lang; rtl: boolean }) {
  const c = COPY[lang];
  const stop = STOPS[clock.stop];
  const chapterIdx = CHAPTERS.findIndex((ch) => ch.id === stop.id);
  const night = isNightClock(clock);
  const name = chapterIdx >= 0 ? c.day.chapters[chapterIdx].name : stop.id === REVIEW.id ? c.system.clock : c.sunset.name;
  const venue = chapterIdx >= 0 ? c.day.chapters[chapterIdx].venue : '';
  return (
    <div
      aria-hidden="true"
      className={`absolute inset-x-0 top-full border-b backdrop-blur-md transition duration-300 ${clock.visible ? 'opacity-100' : 'pointer-events-none -translate-y-1 opacity-0'} ${night ? 'border-white/10 bg-[#0C1411]/85 text-white' : 'border-sv-line bg-white/85 text-sv-ink'}`}
    >
      <div className="mx-auto flex h-11 max-w-6xl items-center gap-3 px-5 sm:px-8">
        <span className="inline-flex items-center gap-2 font-mono text-sm font-medium tnum">
          <span className="sv-live relative h-1.5 w-1.5 rounded-full bg-sv-mint text-sv-mint" />
          {fmt(clock.min)}
        </span>
        <span className="min-w-0 truncate text-sm">
          <span className="font-medium">{name}</span>
          {venue && <span className={night ? 'text-white/60' : 'text-sv-slate'}> · {venue}</span>}
        </span>
        <span className="relative ms-auto hidden h-1.5 w-40 shrink-0 rounded-full sv-sky sm:block md:w-64" dir="ltr">
          <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white ring-2 ring-sv-ink" style={{ left: `${dayPos(clock.min, rtl)}%` }} />
        </span>
      </div>
    </div>
  );
}

/* ── page ────────────────────────────────────────────────────────────────── */
export default function LandingPage() {
  const { lang, dir } = useI18n();
  const rtl = dir === 'rtl';
  const c = COPY[lang];
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const clock = useServiceClock();
  const night = isNightClock(clock) && !menuOpen;
  useReveal();

  useEffect(() => {
    ensureGoogleFonts(['Sora:wght@500;600;700', 'IBM+Plex+Sans:wght@400;500;600']);
    // A parked concept, not a page to rank next to the real landing.
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex';
    document.head.appendChild(robots);
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    // Anchor jumps glide instead of teleporting — unless the reader asked for less motion.
    const html = document.documentElement;
    const prev = { behavior: html.style.scrollBehavior, padding: html.style.scrollPaddingTop };
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) html.style.scrollBehavior = 'smooth';
    // Tabbing scrolls the focused control clear of the sticky header and the clock under it.
    html.style.scrollPaddingTop = '120px';
    return () => {
      window.removeEventListener('scroll', onScroll);
      html.style.scrollBehavior = prev.behavior;
      html.style.scrollPaddingTop = prev.padding;
      robots.remove();
    };
  }, []);

  const nav = [
    { href: '#day', label: c.nav.day },
    { href: '#system', label: c.nav.features },
    { href: '#setup', label: c.nav.setup },
    { href: '#pricing', label: c.nav.pricing },
    { href: '#faq', label: c.nav.faq },
  ];
  const btn = 'inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-medium transition-colors';
  // The headline's timestamps: a line of their own on a phone, superscript beside the words from sm up.
  const stamp = 'mb-1 block font-mono text-xs font-medium tracking-normal text-sv-green tnum sm:mb-0 sm:me-3 sm:inline-block sm:-translate-y-[0.85em] sm:text-sm';
  const quiet = night ? 'text-white/70 hover:bg-white/10 hover:text-white' : 'text-sv-slate hover:bg-sv-mist hover:text-sv-ink';

  return (
    <div id="neo" dir={dir} className={lang === 'ar' ? 'lang-ar' : ''}>
      <a href="#top" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:shadow-lift">
        {lang === 'ar' ? 'انتقل إلى المحتوى' : 'Skip to content'}
      </a>
      {/* ── HEADER ──────────────────────────────────────────── */}
      <header className={`sticky top-0 z-50 border-b transition-colors duration-300 ${night ? 'border-white/10 bg-[#0C1411]/85 text-white backdrop-blur-md' : scrolled || menuOpen ? 'border-sv-line bg-white/90 text-sv-ink backdrop-blur-md' : 'border-transparent bg-white text-sv-ink'}`}>
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-5 sm:px-8">
          <a href="#top" aria-label="Serva"><Logo tone={night ? 'white' : 'ink'} /></a>

          <nav className="hidden items-center gap-1 lg:flex">
            {nav.map((n) => (
              <a key={n.href} href={n.href} className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${quiet}`}>{n.label}</a>
            ))}
          </nav>

          <div className="flex items-center gap-1">
            <LangSwitch className={`hidden sm:inline-flex ${quiet}`} />
            <Link to="/dashboard" className={`hidden h-10 items-center rounded-lg px-3 text-sm font-medium transition-colors sm:inline-flex ${quiet}`}>
              {c.nav.login}
            </Link>
            <a href="#contact" className="ms-1 hidden h-10 items-center rounded-lg bg-sv-green px-4 text-sm font-medium text-white transition-colors hover:bg-sv-deep md:inline-flex">
              {c.nav.cta}
            </a>
            <button
              type="button" onClick={() => setMenuOpen((v) => !v)}
              aria-label={c.nav.menu} aria-expanded={menuOpen} aria-controls="sv-menu"
              className={`flex h-11 w-11 items-center justify-center rounded-lg lg:hidden ${night ? 'hover:bg-white/10' : 'hover:bg-sv-mist'}`}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>
          </div>
        </div>

        {menuOpen && (
          <div id="sv-menu" className="border-t border-sv-line bg-white px-5 pb-5 pt-2 lg:hidden">
            <nav className="flex flex-col">
              {nav.map((n) => (
                <a key={n.href} href={n.href} onClick={() => setMenuOpen(false)} className="border-b border-sv-line py-3.5 text-base font-medium">{n.label}</a>
              ))}
            </nav>
            <div className="mt-4 flex items-center gap-2">
              <LangSwitch className="border border-sv-line text-sv-ink" />
              <Link to="/dashboard" onClick={() => setMenuOpen(false)} className="inline-flex h-10 items-center rounded-lg border border-sv-line px-4 text-sm font-medium">{c.nav.login}</Link>
            </div>
            <a href="#contact" onClick={() => setMenuOpen(false)} className={`${btn} mt-4 w-full bg-sv-green text-white hover:bg-sv-deep`}>{c.nav.cta}</a>
          </div>
        )}

        {!menuOpen && <ClockBar clock={clock} lang={lang} rtl={rtl} />}
      </header>

      <main id="top">
        {/* ── HERO ─────────────────────────────────────────── */}
        <section className="relative bg-white">
          <div className="mx-auto max-w-6xl px-5 pb-16 pt-14 sm:px-8 md:pb-20 md:pt-24">
            <p className="inline-flex items-center gap-2 rounded-full border border-sv-line bg-white px-3 py-1.5 text-sm text-sv-slate">
              <span className="h-1.5 w-1.5 rounded-full bg-sv-mint" aria-hidden="true" />
              {c.hero.eyebrow}
            </p>

            <h1 className="sv-h1 mt-7 max-w-5xl text-sv-ink">
              <span className="block">
                <span className={stamp} aria-hidden="true">06:30</span>
                {c.hero.l1}
              </span>
              <span className="block text-sv-slate">
                <span className={stamp} aria-hidden="true">23:30</span>
                {c.hero.l2}
              </span>
            </h1>

            <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-16">
              <p className="max-w-2xl text-lg leading-relaxed text-sv-slate md:text-xl">{c.hero.sub}</p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <a href="#contact" className={`${btn} bg-sv-green text-white hover:bg-sv-deep`}>
                  {c.hero.cta} <span aria-hidden="true">{rtl ? '←' : '→'}</span>
                </a>
              </div>
            </div>

            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-sv-slate">
              {c.hero.proof.map((p) => (
                <li key={p} className="flex items-start gap-2"><Check className="text-sv-green" />{p}</li>
              ))}
            </ul>

            <Ribbon lang={lang} rtl={rtl} label={c.hero.ribbon} />
          </div>
        </section>

        {/* ── CUSTOMERS ────────────────────────────────────── */}
        <section aria-labelledby="sv-customers" className="border-y border-sv-line bg-white">
          <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 lg:flex lg:items-center lg:gap-12">
            <h2 id="sv-customers" className="shrink-0 text-sm font-medium text-sv-slate lg:w-36">{c.customers}</h2>
            <ul className="mt-6 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 lg:mt-0 lg:flex lg:flex-1 lg:justify-between">
              {CUSTOMERS.map((cu) => (
                <li key={cu.key} className="flex items-center gap-3">
                  {cu.logo ? (
                    <img src={cu.logo} alt="" width={56} height={56} loading="lazy" decoding="async" className="h-14 w-14 shrink-0 rounded-xl object-cover ring-1 ring-sv-line" />
                  ) : (
                    // No logo on file yet — the name, set as a wordmark, holds its place.
                    <span aria-hidden="true" className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-sv-ink font-display text-[12px] font-semibold leading-[1.1] tracking-[-0.02em] text-white" dir="ltr">
                      <span>Hub</span><span className="text-sv-mint">&amp; co</span>
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block text-[15px] font-medium text-sv-ink" translate="no">{cu.name.ar === cu.name.en ? <Ltr>{cu.name[lang]}</Ltr> : cu.name[lang]}</span>
                    <span className="block text-xs text-sv-slate">{cu.kind[lang]}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── THE DAY ──────────────────────────────────────── */}
        <div id="day" className="scroll-mt-16">
          <section className="bg-white pb-6 pt-20 md:pt-28">
            <div className="mx-auto max-w-6xl px-5 sm:px-8">
              <Kicker>{c.day.kicker}</Kicker>
              <h2 className="sv-h2 mt-4 max-w-3xl">{c.day.title}</h2>
              <p className="mt-5 max-w-2xl text-lg leading-relaxed text-sv-slate">{c.day.sub}</p>
            </div>
          </section>

          {CHAPTERS.map((ch, i) => {
            const cc = c.day.chapters[i];
            const night = isNight(ch.tone);
            const { Scene } = ch;
            return (
              <div key={ch.id}>
                {/* the sun goes down between the quiet hour and the evening window */}
                {ch.id === 't-2000' && (
                  <section id={SUNSET.id} aria-label={c.sunset.name} className="sv-sunset relative h-[360px] overflow-hidden md:h-[440px]">
                    <div className="absolute inset-x-0 top-[26%] h-16 overflow-hidden" aria-hidden="true">
                      <div className="mx-auto h-32 w-32 rounded-full bg-gradient-to-b from-[#FFE2B8] to-[#F3A871] opacity-90" />
                    </div>
                    <div className="absolute inset-x-0 top-[calc(26%+4rem)] h-px bg-white/25" aria-hidden="true" />
                    <div className="absolute inset-x-0 bottom-10 mx-auto max-w-6xl px-5 text-white sm:px-8 md:bottom-14">
                      <p className="font-mono text-sm font-medium text-white/80 tnum">18:00</p>
                      <p className="sv-h3 mt-2">{c.sunset.title}</p>
                      <p className="mt-2 text-white/70">{c.sunset.sub}</p>
                    </div>
                  </section>
                )}
                <section id={ch.id} data-reveal aria-labelledby={`${ch.id}-h`} className={`${TONE[ch.tone]} scroll-mt-28 py-20 md:py-28`}>
                  <div className="mx-auto grid max-w-6xl gap-12 px-5 sm:px-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center lg:gap-16">
                    <div className="sv-reveal">
                      <p className={`font-display text-5xl font-semibold tracking-[-0.04em] tnum md:text-6xl ${night ? 'text-sv-mint' : 'text-sv-green'}`}>{ch.time}</p>
                      <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium">{cc.name}</span>
                        <span aria-hidden="true" className={night ? 'text-white/30' : 'text-sv-line'}>—</span>
                        <span className={night ? 'text-white/60' : 'text-sv-slate'}>{cc.venue}</span>
                      </p>
                      <h3 id={`${ch.id}-h`} className="sv-h3 mt-6">{cc.title}</h3>
                      <p className={`mt-4 text-[17px] leading-relaxed ${night ? 'text-white/70' : 'text-sv-slate'}`}>{cc.body}</p>
                      <ul className="mt-6 space-y-2.5">
                        {cc.points.map((pt) => (
                          <li key={pt} className="flex gap-3 text-[15px]">
                            <Check className={night ? 'text-sv-mint' : 'text-sv-green'} />{pt}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="sv-reveal [transition-delay:120ms]">
                      <Scene lang={lang} />
                    </div>
                  </div>
                  {ch.id === 't-2330' && (
                    <p className="mx-auto mt-20 flex max-w-6xl items-center gap-3 px-5 text-sm text-white/60 sm:px-8">
                      <span className="font-mono font-medium text-white tnum">00:00</span>
                      <span className="h-px w-8 bg-white/25" aria-hidden="true" />
                      <span>{c.midnight} <span className="font-mono tnum"><Ltr>06:30</Ltr></span>.</span>
                    </p>
                  )}
                </section>
              </div>
            );
          })}
        </div>

        {/* ── FEATURES (the day in review, still at night) ─────── */}
        <section id="system" aria-labelledby="sv-system" className="scroll-mt-28 border-t border-white/10 bg-sv-ink py-20 text-white md:py-28">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <Kicker night>{c.system.kicker}</Kicker>
            <h2 id="sv-system" className="sv-h2 mt-4 max-w-3xl">{c.system.title}</h2>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/65">{c.system.sub}</p>
            <ul className="mt-14 grid gap-px overflow-hidden rounded-2xl bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
              {c.system.modules.map((m) => {
                const at = CHAPTERS.find((ch) => ch.time === m.at);
                return (
                  <li key={m.t} className="flex flex-col bg-sv-ink p-6">
                    <h3 className="text-[17px] font-semibold">{m.t}</h3>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-white/60">{m.d}</p>
                    {/* where in the day it showed up — a link back to that hour */}
                    {at && (
                      <a href={`#${at.id}`} className="mt-5 inline-flex w-fit items-center gap-1.5 font-mono text-xs text-sv-mint hover:underline">
                        <span className="tnum">{at.time}</span> <span aria-hidden="true">{rtl ? '↖' : '↗'}</span>
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* ── SETUP (the next morning) ──────────────────────── */}
        <section id="setup" aria-labelledby="sv-setup" className="scroll-mt-16">
          <div className="sv-sunrise h-40 md:h-56" aria-hidden="true" />
          <div className="mx-auto max-w-6xl px-5 pb-20 pt-6 sm:px-8 md:pb-28">
            <Kicker>{c.setup.kicker}</Kicker>
            <h2 id="sv-setup" className="sv-h2 mt-4 max-w-3xl">{c.setup.title}</h2>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-sv-slate">{c.setup.sub}</p>

            <ol className="mt-14 grid gap-10 md:grid-cols-2 md:gap-x-10 lg:grid-cols-4 lg:gap-8">
              {c.setup.steps.map((s, i) => (
                <li key={s.t} className="relative border-t border-sv-line pt-6">
                  {/* a sequence, so the numbers are real information */}
                  <span className="absolute -top-px start-0 h-[2px] w-12 bg-sv-green" aria-hidden="true" />
                  <span className="font-mono text-sm font-medium text-sv-green tnum">0{i + 1}</span>
                  <h3 className="mt-3 text-xl font-semibold">{s.t}</h3>
                  <p className="mt-2 leading-relaxed text-sv-slate">{s.d}</p>
                </li>
              ))}
            </ol>
            <p className="mt-12 inline-flex items-center gap-2 rounded-full bg-sv-tint px-4 py-2 text-sm font-medium text-sv-green">
              <Check />{c.setup.note}
            </p>
          </div>
        </section>

        {/* ── PRICING ──────────────────────────────────────── */}
        <section id="pricing" aria-labelledby="sv-pricing" className="scroll-mt-16 bg-sv-mist py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="max-w-2xl">
              <Kicker>{c.pricing.kicker}</Kicker>
              <h2 id="sv-pricing" className="sv-h2 mt-4">{c.pricing.title}</h2>
              <p className="mt-5 text-lg leading-relaxed text-sv-slate">{c.pricing.sub}</p>
            </div>

            <div className="mt-12 grid gap-5 md:grid-cols-2">
              {c.pricing.plans.map((plan) => (
                <div key={plan.name} className={`relative flex flex-col rounded-2xl bg-white p-7 md:p-8 ${plan.featured ? 'shadow-lift ring-2 ring-sv-green' : 'shadow-card ring-1 ring-sv-line'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-xl font-semibold">{plan.name}</h3>
                    {plan.featured && <span className="rounded-full bg-sv-tint px-3 py-1 text-xs font-medium text-sv-green">{c.pricing.badge}</span>}
                  </div>
                  <p className="mt-1 text-sv-slate">{plan.tagline}</p>
                  <p className="mt-7 flex items-baseline gap-2">
                    <span className="font-display text-6xl font-semibold tracking-[-0.04em] tnum">{plan.price}</span>
                    <span className="text-lg font-medium">{c.pricing.cur}</span>
                    <span className="text-sm text-sv-slate">{c.pricing.per}</span>
                  </p>
                  <p className="mt-1 text-sm text-sv-slate">{c.pricing.setup}</p>
                  <ul className="mt-7 space-y-3 border-t border-sv-line pt-7">
                    {plan.features.map((f) => (
                      <li key={f} className="flex gap-3"><Check className="text-sv-green" />{f}</li>
                    ))}
                  </ul>
                  <a
                    href="#contact"
                    className={`${btn} mt-8 w-full ${plan.featured ? 'bg-sv-green text-white hover:bg-sv-deep' : 'border border-sv-line bg-white text-sv-ink hover:bg-sv-mist'}`}
                  >
                    {c.pricing.cta} {plan.name}
                  </a>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-col items-start justify-between gap-5 rounded-2xl bg-sv-ink p-7 text-white md:flex-row md:items-center md:p-8">
              <div>
                <p className="text-lg font-semibold">{c.pricing.custom.title}</p>
                <p className="mt-1 text-white/65">{c.pricing.custom.body}</p>
              </div>
              <a href="#contact" className={`${btn} shrink-0 bg-white text-sv-ink hover:bg-sv-tint`}>
                {c.pricing.custom.cta} <span aria-hidden="true">{rtl ? '←' : '→'}</span>
              </a>
            </div>
            <p className="mt-6 text-sm text-sv-slate">{c.pricing.note}</p>
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────── */}
        <section id="faq" aria-labelledby="sv-faq" className="scroll-mt-16 bg-white py-20 md:py-28">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 sm:px-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-16">
            <div>
              <Kicker>{c.faq.kicker}</Kicker>
              <h2 id="sv-faq" className="sv-h2 mt-4">{c.faq.title}</h2>
              <a href="#contact" className="mt-6 inline-flex items-center gap-2 font-medium text-sv-green hover:underline">
                {c.faq.more} <span aria-hidden="true">{rtl ? '←' : '→'}</span>
              </a>
            </div>
            <div className="border-t border-sv-line">
              {c.faq.items.map((it) => (
                <details key={it.q} className="group border-b border-sv-line">
                  <summary className="flex items-center justify-between gap-6 py-5 text-[17px] font-medium">
                    {it.q}
                    <span aria-hidden="true" className="relative h-4 w-4 shrink-0 text-sv-slate">
                      <span className="absolute inset-x-0 top-1/2 h-[1.5px] -translate-y-1/2 bg-current" />
                      <span className="absolute inset-y-0 left-1/2 w-[1.5px] -translate-x-1/2 bg-current transition-transform duration-200 group-open:scale-y-0" />
                    </span>
                  </summary>
                  <p className="-mt-1 max-w-2xl pb-6 leading-relaxed text-sv-slate">{it.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── CONTACT ──────────────────────────────────────── */}
        <section id="contact" aria-labelledby="sv-contact" className="scroll-mt-16 border-t border-sv-line bg-sv-mist py-20 md:py-28">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 sm:px-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
            <div>
              <Kicker>{c.contact.kicker}</Kicker>
              <h2 id="sv-contact" className="sv-h2 mt-4">{c.contact.title}</h2>
              <p className="mt-5 text-lg leading-relaxed text-sv-slate">{c.contact.sub}</p>
            </div>
            <LeadForm />
          </div>
        </section>
      </main>

      <SiteFooter links={[
        { href: '#day', label: c.nav.day },
        { href: '#system', label: c.nav.features },
        { href: '#setup', label: c.nav.setup },
        { href: '#pricing', label: c.nav.pricing },
        { href: '#faq', label: c.nav.faq },
      ]} />
    </div>
  );
}
