import { useEffect, Fragment, type ReactNode } from 'react';
import { useI18n } from '../../lib/i18n';
import { ensureGoogleFonts } from '../../lib/fonts';
import type { Lang } from '../../lib/types';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';
import './site.css';

/* Public guide to dashboard analytics — plain-language explanations for café
   owners (no jargon). Bilingual via the footer language toggle; styled like the
   marketing + legal pages. */

type L = Record<Lang, string>;
interface Metric { t: L; what: L; tip?: L; why: L }

const UI = {
  back: { en: 'Home', ar: 'الرئيسية' } as L,
  eyebrow: { en: 'Analytics guide', ar: 'دليل التحليلات' } as L,
  title: {
    en: 'What your numbers mean — in plain language.',
    ar: 'ماذا تعني أرقامك — بلغة بسيطة.',
  } as L,
  lede: {
    en: 'Open Analytics in your dashboard and you’ll see how your café is doing today — sales, orders, busy hours, and what’s selling. Every plan includes that. Pro goes deeper: why some items don’t sell, which customers are drifting away, and how to staff ahead of the rush. No spreadsheets, no jargon — just answers you can use the same day.',
    ar: 'افتح «التحليلات» في لوحتك وسترى كيف يسير مقهاك اليوم — المبيعات والطلبات وساعات الذروة وما يُباع. كل باقة تتضمن ذلك. أمّا برو فتتعمّق: لماذا لا يُباع بعض الأصناف، ومن من عملائك بدأ يبتعد، وكيف تجهّز الفريق قبل الازدحام. بلا جداول معقّدة ولا مصطلحات — إجابات تستفيد منها في اليوم نفسه.',
  } as L,
  legendStd: { en: 'Included on every plan', ar: 'متوفّر في كل الباقات' } as L,
  legendPro: { en: 'Pro plan only', ar: 'باقة برو فقط' } as L,
  badgeStd: { en: 'Standard', ar: 'الأساسية' } as L,
  badgePro: { en: 'Pro', ar: 'برو' } as L,
  tip: { en: 'Good to know', ar: 'معلومة مفيدة' } as L,
  why: { en: 'Why it matters', ar: 'لماذا يهمّك' } as L,
  stdHeading: { en: 'What every café gets', ar: 'ما يحصل عليه كل مقهى' } as L,
  stdSub: {
    en: 'Your day-to-day snapshot. Look at Today or the last 7 days on the Overview and Menu tabs. If you have more than one branch, pick which one to view. Arrows show whether you’re up or down compared to a normal day — so a quiet Monday doesn’t look like a crisis.',
    ar: 'لمحة يومية عن عملك. اختر «اليوم» أو «آخر ٧ أيام» في تبويبَي نظرة عامة والقائمة. إن كان لديك أكثر من فرع، اختر أيّهما تريد. الأسهم تبيّن هل أنت أفضل أم أسوأ من يوم عادي — فلا يبدو يوم اثنين هادئ وكأنه أزمة.',
  } as L,
  proHeading: { en: 'What Pro adds', ar: 'ما تضيفه برو' } as L,
  proSub: {
    en: 'Pro lets you look back 30 or 90 days (or pick your own dates), opens the Team and Customers tabs, and shows the deeper cards below. Standard tells you what happened. Pro helps you understand why — and what to try next. On Standard you’ll see a prompt to upgrade instead.',
    ar: 'تتيح لك برو الرجوع ٣٠ أو ٩٠ يومًا (أو اختيار تواريخك)، وتفتح تبويبَي الفريق والعملاء، وتعرض البطاقات الأعمق أدناه. الأساسية تخبرك ماذا حدث. برو تساعدك على فهم السبب — وما الذي تجربه بعدها. على الباقة الأساسية ستظهر دعوة للترقية بدلًا منها.',
  } as L,
  cmpHeading: { en: 'Standard vs Pro — quick comparison', ar: 'الأساسية مقابل برو — مقارنة سريعة' } as L,
  cmpSub: {
    en: 'Same starting point. Pro lets you look further back and unlocks the extra sections.',
    ar: 'نقطة البداية نفسها. برو تتيح لك الرجوع أبعد وتفتح الأقسام الإضافية.',
  } as L,
  colCapability: { en: 'Feature', ar: 'الميزة' } as L,
  benchmarkNote: {
    en: 'Coming soon: a card that shows how your café compares to similar ones on Serva. We’re finishing it so the numbers stay fair for smaller cafés. Everything else on this page is already in your dashboard.',
    ar: 'قريبًا: بطاقة تُظهر كيف يقارن مقهاك بمقاهٍ مماثلة على Serva. نعمل على إنهائها لتبقى الأرقام عادلة للمقاهي الأصغر. كل ما عدا ذلك في هذه الصفحة موجود فعلًا في لوحتك.',
  } as L,
  shortVersion: {
    en: 'In short: Standard answers “How did today go?” — the essentials every owner checks. Pro answers “Why, and what should I try?” — menu fixes, staffing, loyal customers, and spotting problems before they cost you.',
    ar: 'باختصار: الأساسية تجيب «كيف كان اليوم؟» — الأساسيات التي يطّلع عليها كل صاحب مقهى. وبرو تجيب «لماذا، وماذا أجرّب؟» — إصلاح القائمة، التوظيف، العملاء الدائمين، واكتشاف المشاكل قبل أن تكلّفك.',
  } as L,
};

const STANDARD: Metric[] = [
  {
    t: { en: "Today's snapshot", ar: 'لمحة اليوم' },
    what: {
      en: 'The big numbers at the top: how much you sold, how many orders came in, the average order size, and how many you finished. Little arrows show if each number is up or down compared to a normal day.',
      ar: 'الأرقام الكبيرة في الأعلى: كم بعت، كم طلب وصل، متوسّط قيمة الطلب، وكم طلبًا أنهيت. أسهم صغيرة تبيّن هل كل رقم أعلى أم أقل من يوم عادي.',
    },
    why: {
      en: 'Your quick answer to “How are we doing right now?” — before you read anything else.',
      ar: 'إجابتك السريعة عن «كيف حالنا الآن؟» — قبل أن تقرأ أي شيء آخر.',
    },
  },
  {
    t: { en: 'Busy hours chart', ar: 'مخطط ساعات الذروة' },
    what: {
      en: 'A small bar chart next to the headline. For today it shows orders hour by hour; for a week it shows sales day by day. The tallest bar is your busiest time.',
      ar: 'مخطط أعمدة صغير بجانب الأرقام الرئيسية. لليوم يُظهر الطلبات ساعة بساعة؛ وللأسبوع يُظهر المبيعات يومًا بيوم. أطول عمود هو وقت ذروتك.',
    },
    why: {
      en: 'See at a glance when the rush hits — and whether today is picking up or slowing down.',
      ar: 'تعرف بلمحة متى يأتي الازدحام — وهل اليوم يتصاعد أم يهدأ.',
    },
  },
  {
    t: { en: 'Quick takeaways', ar: 'ملاحظات سريعة' },
    what: {
      en: 'Up to three short sentences written for you — like “2pm is your busiest hour” or “Latte is a quarter of your sales.”',
      ar: 'حتى ثلاث جمل قصيرة مكتوبة لك — مثل «الساعة ٢ ظهرًا أكثر أوقاتك ازدحامًا» أو «اللاتيه ربع مبيعاتك».',
    },
    why: {
      en: 'You don’t have to decode charts. Serva spells out what’s worth noticing.',
      ar: 'لا حاجة لفكّ الرموز في المخططات. Serva تكتب لك ما يستحق الانتباه.',
    },
  },
  {
    t: { en: 'Where orders stand', ar: 'أين وصلت الطلبات' },
    what: {
      en: 'A coloured bar showing how many orders are done, ready, being made, waiting, or cancelled.',
      ar: 'شريط ملوّن يُظهر كم طلبًا اكتمل، وجاهز، قيد التحضير، ينتظر، أو أُلغي.',
    },
    why: {
      en: 'A health check on the floor — lots of “waiting” means you’re falling behind; lots of cancelled means something’s going wrong.',
      ar: 'فحص سريع لسير العمل — كثرة «الانتظار» تعني تراكمًا؛ وكثرة «الملغاة» تعني أن شيئًا لا يسير كما يجب.',
    },
  },
  {
    t: { en: 'Busiest times of day', ar: 'أكثر أوقات اليوم ازدحامًا' },
    what: {
      en: 'Your day split into morning, midday, afternoon, evening, and late night — with a flag on whichever part is busiest.',
      ar: 'يومك مقسّم إلى صباح وظهيرة وعصر ومساء ووقت متأخر — مع إبراز الجزء الأكثر ازدحامًا.',
    },
    why: {
      en: 'Helps you decide when to run a promo and when to add staff — e.g. a quiet afternoon is perfect for a happy-hour deal.',
      ar: 'يساعدك على اختيار وقت العروض وإضافة العاملين — مثلًا فترة عصر هادئة مناسبة لعرض سعيد.',
    },
  },
  {
    t: { en: 'Sales over time', ar: 'المبيعات عبر الزمن' },
    what: {
      en: 'A simple line chart for the dates you picked. Switch between money earned and number of orders.',
      ar: 'مخطط بسيط للتواريخ التي اخترتها. بدّل بين المبلغ الذي ربحته وعدد الطلبات.',
    },
    why: {
      en: 'See if things are trending up or down — did last week’s offer keep working, or did it tail off?',
      ar: 'تعرف هل الأمور تتحسّن أم تتراجع — هل استمر عرض الأسبوع الماضي أم خفت حدّته؟',
    },
  },
  {
    t: { en: 'Top menu items', ar: 'أكثر الأصناف مبيعًا' },
    what: {
      en: 'Your best-selling items ranked by how many were sold and how much money they brought in. Found on the Menu tab.',
      ar: 'أفضل أصنافك مرتّبة حسب الكمية المباعة والمبلغ الذي جناه كل صنف. تجدها في تبويب القائمة.',
    },
    why: {
      en: 'Know what to promote, what to never run out of, and what belongs on the front of the menu.',
      ar: 'تعرف ماذا تُروّج، وماذا لا ينبغي أن ينفد، وما يستحق مكانًا في مقدمة القائمة.',
    },
  },
];

const PRO: Metric[] = [
  {
    t: { en: 'Look further back', ar: 'الرجوع لتاريخ أبعد' },
    what: {
      en: 'Besides today and the last 7 days, pick the last 30 or 90 days — or choose any start and end date you like.',
      ar: 'إضافةً إلى اليوم وآخر ٧ أيام، اختر آخر ٣٠ أو ٩٠ يومًا — أو حدّد أي تاريخ بداية ونهاية تريده.',
    },
    why: {
      en: 'A single busy Saturday can mislead you. A longer view shows real patterns — slow seasons, steady growth, whether a price change actually worked.',
      ar: 'يوم سبت مزدحم واحد قد يُضلّلك. نظرة أطول تُظهر الأنماط الحقيقية — المواسم الهادئة، النمو المستقر، وهل نجح تغيير السعر فعلًا.',
    },
  },
  {
    t: { en: 'Looked at but not ordered', ar: 'يُشاهَد ولا يُطلَب' },
    what: {
      en: 'For each menu item: how many people opened it vs how many actually ordered. Items that get views but few orders are marked “low”.',
      ar: 'لكل صنف: كم شخصًا فتحه مقابل كم شخصًا طلبه فعلًا. الأصناف التي تُشاهَد كثيرًا ولا تُباع تُوسَم «ضعيف».',
    },
    why: {
      en: 'Often the fix is simple — better photo, clearer description, or a fairer price. These are some of the quickest wins on the menu.',
      ar: 'غالبًا الحل بسيط — صورة أوضح، وصف أوضح، أو سعر أنسب. من أسرع التحسينات على القائمة.',
    },
  },
  {
    t: { en: 'Where customers drop off', ar: 'أين يتوقّف العملاء' },
    what: {
      en: 'Shows how many people opened the menu, added to cart, started checkout, and placed an order — with percentages between each step.',
      ar: 'يُظهر كم شخصًا فتح القائمة، وأضاف للسلة، وبدأ الدفع، وأتم الطلب — مع نسبة بين كل خطوة والتي تليها.',
    },
    why: {
      en: 'If lots of people quit at payment, that’s a checkout problem. If they quit after adding to cart, the issue is earlier — maybe delivery or item choices.',
      ar: 'إن انسحب كثيرون عند الدفع فالمشكلة في إتمام الطلب. وإن انسحبوا بعد السلة فالمشكلة أبكر — ربما التوصيل أو اختيار الأصناف.',
    },
  },
  {
    t: { en: 'Popular pairings', ar: 'ما يُطلب معًا' },
    what: {
      en: 'Items customers often buy in the same order — e.g. croissant and flat white.',
      ar: 'أصناف يشتريها العملاء غالبًا في الطلب نفسه — مثل الكرواسون والفلات وايت.',
    },
    why: {
      en: 'Build combo deals, meal bundles, or a gentle “add a …?” suggestion at checkout.',
      ar: 'ابنِ عروضًا مجمّعة أو باقات وجبات، أو اقترح بلطف «أضِف …؟» عند الدفع.',
    },
  },
  {
    t: { en: 'Your weekly pattern', ar: 'نمط أسبوعك' },
    what: {
      en: 'For each day of the week, a chart of when orders usually arrive — based on your last four weeks. Your busiest hour on each day is highlighted.',
      ar: 'لكل يوم من الأسبوع، مخطط يُظهر متى تصل الطلبات عادةً — بناءً على آخر أربعة أسابيع. تُبرز أكثر ساعة ازدحامًا في كل يوم.',
    },
    why: {
      en: 'Plan staffing and prep before the rush — know Saturday peaks at 11am before Saturday arrives.',
      ar: 'خطّط للتوظيف والتحضير قبل الازدحام — اعرف أن السبت يبلغ ذروته ١١ صباحًا قبل أن يحين السبت.',
    },
  },
  {
    t: { en: 'How your team is doing', ar: 'كيف يسير فريقك' },
    what: {
      en: 'A simple ranking of your team: orders finished, accepted, declined, and how fast each person taps “accept”.',
      ar: 'ترتيب بسيط لفريقك: الطلبات المنجزة والمقبولة والمرفوضة، وسرعة كل شخص في الضغط على «قبول».',
    },
    why: {
      en: 'Celebrate quick responders, coach where needed, and spot when someone is overwhelmed.',
      ar: 'كافئ السريعين، درّب حيث يلزم، واكتشف من هو مُحمَّل فوق طاقته.',
    },
  },
  {
    t: { en: 'How long orders take', ar: 'كم يستغرق الطلب' },
    what: {
      en: 'Average minutes from order to accept, prep, and handoff — plus total time to ready. The slowest step is highlighted.',
      ar: 'متوسّط الدقائق من الطلب إلى القبول والتحضير والتسليم — إضافةً إلى الوقت الكلي حتى الجاهزية. أبطأ خطوة مُبرزة.',
    },
    why: {
      en: 'Shows where time is lost. Slow to accept? Front of house. Slow to prep? Kitchen. Fix the right place.',
      ar: 'يُظهر أين يضيع الوقت. بطء في القبول؟ الواجهة. بطء في التحضير؟ المطبخ. أصلِح المكان الصحيح.',
    },
  },
  {
    t: { en: 'Regulars & who’s drifting away', ar: 'الدائمون ومن يبتعد' },
    what: {
      en: 'Two lists: your most loyal customers, and regulars who haven’t ordered in about three weeks.',
      ar: 'قائمتان: أكثر عملائك ولاءً، ودائمون لم يطلبوا منذ نحو ثلاثة أسابيع.',
    },
    tip: {
      en: 'A “regular” here means someone with at least three orders. “Drifting away” means they used to come often but haven’t been back lately.',
      ar: '«دائم» هنا يعني من لديه ثلاث طلبات فأكثر. «يبتعد» يعني كان يأتي كثيرًا ولم يعد مؤخرًا.',
    },
    why: {
      en: 'Thank your best customers and send a friendly nudge while someone still might come back — not months later.',
      ar: 'اشكر أفضل عملائك وأرسل تذكيرًا ودودًا بينما لا يزال العميل قد يعود — لا بعد أشهر.',
    },
  },
  {
    t: { en: 'Who keeps coming back', ar: 'من يعود مرارًا' },
    what: {
      en: 'Big-picture customer numbers: how many repeat vs new, how often people order, who’s active this month.',
      ar: 'أرقام عامة عن العملاء: كم يعودون مقابل الجدد، كم مرة يطلبون، ومن نشط هذا الشهر.',
    },
    why: {
      en: 'Repeat customers are the bedrock of a stable café. This tells you if that base is growing or shrinking.',
      ar: 'العملاء العائدون أساس مقهى مستقر. هذا يُخبرك هل تلك القاعدة تكبر أم تتقلّص.',
    },
  },
  {
    t: { en: 'How you compare', ar: 'كيف تقارن بغيرك' },
    what: {
      en: 'Planned: see how your average order size and response speed stack up against similar cafés on Serva — without naming anyone.',
      ar: 'مخطط له: تعرّف كيف يقارن متوسّط طلبك وسرعة استجابتك بمقاهٍ مماثلة على Serva — دون ذكر أسماء.',
    },
    why: {
      en: 'Context helps — “90 seconds to accept” only means something when you know what others manage.',
      ar: 'السياق مهم — «٩٠ ثانية للقبول» لا تعني شيئًا إلا عندما تعرف ماذا يحقّق الآخرون.',
    },
  },
];

type Cell = 'yes' | 'no' | L;
interface CmpGroup { group: L; rows: { label: L; std: Cell; pro: Cell }[] }

const COMPARE: CmpGroup[] = [
  {
    group: { en: 'Getting around', ar: 'التنقّل في الصفحة' },
    rows: [
      {
        label: { en: 'How far back you can look', ar: 'إلى أي تاريخ يمكنك الرجوع' },
        std: { en: 'Today · 7 days', ar: 'اليوم · ٧ أيام' },
        pro: { en: '+ 30 · 90 days · pick dates', ar: '+ ٣٠ · ٩٠ يومًا · تواريخ مخصّصة' },
      },
      {
        label: { en: 'Sections in the app', ar: 'أقسام التطبيق' },
        std: { en: 'Overview · Menu', ar: 'نظرة عامة · القائمة' },
        pro: { en: '+ Team · Customers', ar: '+ الفريق · العملاء' },
      },
      { label: { en: 'Filter by branch', ar: 'تصفية حسب الفرع' }, std: 'yes', pro: 'yes' },
    ],
  },
  {
    group: { en: 'Overview tab', ar: 'تبويب نظرة عامة' },
    rows: [
      { label: { en: "Today's snapshot", ar: 'لمحة اليوم' }, std: 'yes', pro: 'yes' },
      { label: { en: 'Busy hours & quick notes', ar: 'ساعات الذروة وملاحظات سريعة' }, std: 'yes', pro: 'yes' },
      { label: { en: 'Order status & busiest times', ar: 'حالة الطلبات وأوقات الذروة' }, std: 'yes', pro: 'yes' },
      { label: { en: 'Sales over time', ar: 'المبيعات عبر الزمن' }, std: 'yes', pro: 'yes' },
      { label: { en: 'Your weekly pattern', ar: 'نمط أسبوعك' }, std: 'no', pro: 'yes' },
    ],
  },
  {
    group: { en: 'Menu tab', ar: 'تبويب القائمة' },
    rows: [
      { label: { en: 'Top menu items', ar: 'أكثر الأصناف مبيعًا' }, std: 'yes', pro: 'yes' },
      { label: { en: 'Looked at but not ordered', ar: 'يُشاهَد ولا يُطلَب' }, std: 'no', pro: 'yes' },
      { label: { en: 'Where customers drop off', ar: 'أين يتوقّف العملاء' }, std: 'no', pro: 'yes' },
      { label: { en: 'Popular pairings', ar: 'ما يُطلب معًا' }, std: 'no', pro: 'yes' },
    ],
  },
  {
    group: { en: 'Team tab', ar: 'تبويب الفريق' },
    rows: [
      { label: { en: 'How your team is doing', ar: 'كيف يسير فريقك' }, std: 'no', pro: 'yes' },
      { label: { en: 'How long orders take', ar: 'كم يستغرق الطلب' }, std: 'no', pro: 'yes' },
    ],
  },
  {
    group: { en: 'Customers tab', ar: 'تبويب العملاء' },
    rows: [
      { label: { en: 'Regulars & who’s drifting away', ar: 'الدائمون ومن يبتعد' }, std: 'no', pro: 'yes' },
      { label: { en: 'Who keeps coming back', ar: 'من يعود مرارًا' }, std: 'no', pro: 'yes' },
      {
        label: { en: 'How you compare', ar: 'كيف تقارن بغيرك' },
        std: 'no',
        pro: { en: 'Coming soon', ar: 'قريبًا' },
      },
    ],
  },
];

export default function AnalyticsGuidePage() {
  const { lang, dir } = useI18n();

  useEffect(() => {
    ensureGoogleFonts(['Sora:wght@500;600;700', 'IBM+Plex+Sans:wght@400;500;600']);
    window.scrollTo(0, 0);
  }, []);

  return (
    <div id="neo" dir={dir} className={lang === 'ar' ? 'lang-ar' : ''}>
      <SiteHeader back={UI.back[lang]} />

      <main className="mx-auto max-w-6xl px-5 py-14 sm:px-8 md:py-20">
        {/* hero */}
        <p className={lang === 'ar' ? 'text-sm font-semibold text-sv-green' : 'font-mono text-xs font-medium uppercase tracking-[0.16em] text-sv-green'}>
          {UI.eyebrow[lang]}
        </p>
        <h1 className="sv-h2 mt-4 max-w-3xl">{UI.title[lang]}</h1>
        <p className="mt-6 max-w-3xl text-lg leading-relaxed text-sv-slate">{UI.lede[lang]}</p>

        <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3">
          <span className="inline-flex items-center gap-2 text-sm text-sv-slate">
            <StdBadge lang={lang} /> {UI.legendStd[lang]}
          </span>
          <span className="inline-flex items-center gap-2 text-sm text-sv-slate">
            <ProBadge lang={lang} /> {UI.legendPro[lang]}
          </span>
        </div>

        {/* Standard */}
        <SectionHead heading={UI.stdHeading[lang]} sub={UI.stdSub[lang]} badge={<StdBadge lang={lang} />} />
        <div className="grid gap-5 sm:grid-cols-2">
          {STANDARD.map((m, i) => (
            <Card key={i} m={m} lang={lang} pro={false} className={i === 0 ? 'sm:col-span-2' : ''} />
          ))}
        </div>

        {/* Pro */}
        <SectionHead heading={UI.proHeading[lang]} sub={UI.proSub[lang]} badge={<ProBadge lang={lang} />} />
        <div className="grid gap-5 sm:grid-cols-2">
          {PRO.map((m, i) => <Card key={i} m={m} lang={lang} pro />)}
        </div>
        <Note tone="amber" text={UI.benchmarkNote[lang]} />

        {/* Compare */}
        <div className="mt-20">
          <h2 className="sv-h3">{UI.cmpHeading[lang]}</h2>
          <p className="mt-3 max-w-3xl text-sv-slate">{UI.cmpSub[lang]}</p>

          <div className="mt-7 overflow-x-auto rounded-2xl bg-white shadow-card ring-1 ring-sv-line">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-sv-line">
                  <th className="px-5 py-3.5 text-start font-semibold">{UI.colCapability[lang]}</th>
                  <th className="w-32 px-4 py-3.5 text-center font-semibold">{UI.badgeStd[lang]}</th>
                  <th className="w-32 px-4 py-3.5 text-center font-semibold">{UI.badgePro[lang]}</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((g) => (
                  <Fragment key={g.group.en}>
                    <tr className="bg-sv-mist">
                      <td colSpan={3} className="px-5 py-2 text-xs font-medium text-sv-slate">{g.group[lang]}</td>
                    </tr>
                    {g.rows.map((r) => (
                      <tr key={r.label.en} className="border-t border-sv-line">
                        <td className="px-5 py-3 text-sv-ink">{r.label[lang]}</td>
                        <td className="px-4 py-3 text-center">{renderCell(r.std, lang)}</td>
                        <td className="px-4 py-3 text-center">{renderCell(r.pro, lang)}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <Note tone="accent" text={UI.shortVersion[lang]} />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

/* ---- pieces ---- */

function StdBadge({ lang }: { lang: Lang }) {
  return (
    <span className="inline-flex items-center rounded-full bg-sv-tint px-2.5 py-0.5 text-xs font-medium text-sv-green">
      {UI.badgeStd[lang]}
    </span>
  );
}

function ProBadge({ lang }: { lang: Lang }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sv-ink px-2.5 py-0.5 text-xs font-medium text-white">
      <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
      </svg>
      {UI.badgePro[lang]}
    </span>
  );
}

function SectionHead({ heading, sub, badge }: { heading: string; sub: string; badge: ReactNode }) {
  return (
    <div className="mb-7 mt-20">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="sv-h3">{heading}</h2>
        {badge}
      </div>
      <p className="mt-3 max-w-3xl leading-relaxed text-sv-slate">{sub}</p>
    </div>
  );
}

function Card({ m, lang, pro, className = '' }: { m: Metric; lang: Lang; pro: boolean; className?: string }) {
  return (
    <article className={`rounded-2xl bg-white p-6 shadow-card ring-1 ring-sv-line ${className}`}>
      <div className="mb-3">{pro ? <ProBadge lang={lang} /> : <StdBadge lang={lang} />}</div>
      <h3 className="text-lg font-semibold leading-snug">{m.t[lang]}</h3>
      <p className="mt-2 leading-relaxed text-sv-slate">{m.what[lang]}</p>
      <dl className="mt-4 space-y-2.5 border-t border-sv-line pt-4">
        {m.tip && (
          <div className="flex gap-3">
            <dt className="w-[6rem] shrink-0 pt-0.5 text-xs font-medium text-sv-slate">{UI.tip[lang]}</dt>
            <dd className="text-sm leading-relaxed text-sv-slate">{m.tip[lang]}</dd>
          </div>
        )}
        <div className="flex gap-3">
          <dt className="w-[6rem] shrink-0 pt-0.5 text-xs font-medium text-sv-slate">{UI.why[lang]}</dt>
          <dd className="text-sm font-medium leading-relaxed text-sv-ink">{m.why[lang]}</dd>
        </div>
      </dl>
    </article>
  );
}

function renderCell(cell: Cell, lang: Lang) {
  if (cell === 'yes') return <span className="text-base font-semibold text-sv-green" aria-label={lang === 'ar' ? 'نعم' : 'Yes'}>✓</span>;
  if (cell === 'no') return <span className="text-base text-sv-slate/50" aria-label={lang === 'ar' ? 'لا' : 'No'}>—</span>;
  return <span className="text-xs text-sv-slate">{cell[lang]}</span>;
}

function Note({ tone, text }: { tone: 'amber' | 'accent'; text: string }) {
  const edge = tone === 'amber' ? 'border-s-amber-500 bg-amber-50/60' : 'border-s-sv-green bg-sv-tint/60';
  return (
    <div className={`mt-8 rounded-xl border-s-4 p-5 ${edge}`}>
      <p className="text-sm leading-relaxed text-sv-ink">{text}</p>
    </div>
  );
}
