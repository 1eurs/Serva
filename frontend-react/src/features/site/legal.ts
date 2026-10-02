import type { Lang } from '../../lib/types';

/* ─────────────────────────────────────────────────────────────────────────
   Serva — legal content (bilingual AR/EN).
   Covers the documents an Oman-based SaaS that collects payments is expected
   to publish:
     • Privacy Policy        — Personal Data Protection Law (Royal Decree 6/2022)
     • Terms & Conditions
     • Refund & Cancellation — Consumer Protection Law (Royal Decree 66/2014)
     • Cookie Policy
     • Acceptable Use Policy

   ⚠️ This is good-faith template content, not legal advice. Fill in the
   COMPANY placeholders below and have a qualified Omani lawyer review it
   before you rely on it. Under the PDPL the Arabic version is the primary
   reference for compliance.
   ───────────────────────────────────────────────────────────────────────── */

export const COMPANY = {
  brand: 'Serva',
  legalName: { en: 'Siah Tech Solutions LLC', ar: 'سياه تك سوليوشنز ش.م.م' },
  cr: '1664835', // Commercial Registration number
  email: 'hello@serva.om',
  address: { en: 'Muscat, Sultanate of Oman', ar: 'مسقط، سلطنة عُمان' },
};

export const LEGAL_UPDATED = '2026-06-22'; // ISO date this content was last revised

export type LegalSlug = 'privacy' | 'terms' | 'refund' | 'cookies' | 'acceptable-use';
export const LEGAL_ORDER: LegalSlug[] = ['privacy', 'terms', 'refund', 'cookies', 'acceptable-use'];

export const LEGAL_LABELS: Record<Lang, Record<LegalSlug, string>> = {
  en: {
    privacy: 'Privacy Policy',
    terms: 'Terms & Conditions',
    refund: 'Refund & Cancellation',
    cookies: 'Cookie Policy',
    'acceptable-use': 'Acceptable Use',
  },
  ar: {
    privacy: 'سياسة الخصوصية',
    terms: 'الشروط والأحكام',
    refund: 'الاسترداد والإلغاء',
    cookies: 'سياسة ملفات الكوكيز',
    'acceptable-use': 'سياسة الاستخدام المقبول',
  },
};

export interface LegalSection { h: string; body: string[]; }
export interface LegalDoc { title: string; intro: string; sections: LegalSection[]; }

export const LEGAL_UI: Record<Lang, { updated: string; back: string; disclaimer: string; needHelp: string; contactCta: string; legal: string }> = {
  en: {
    updated: 'Last updated',
    back: 'Back to home',
    disclaimer: 'This document is provided for general information and does not constitute legal advice.',
    needHelp: 'Questions about this policy?',
    contactCta: 'Contact us',
    legal: 'Legal',
  },
  ar: {
    updated: 'آخر تحديث',
    back: 'العودة للرئيسية',
    disclaimer: 'هذا المستند لأغراض المعلومات العامة ولا يُعدّ استشارة قانونية.',
    needHelp: 'هل لديك أسئلة حول هذه السياسة؟',
    contactCta: 'تواصل معنا',
    legal: 'قانوني',
  },
};

const en: Record<LegalSlug, LegalDoc> = {
  privacy: {
    title: 'Privacy Policy',
    intro: `${COMPANY.legalName.en} (“Serva”, “we”, “us”) operates a cloud platform for cafés and restaurants. This policy explains how we collect, use, and protect personal data in line with the Sultanate of Oman’s Personal Data Protection Law (Royal Decree No. 6/2022) and its Executive Regulations.`,
    sections: [
      { h: 'Who we are (the controller)', body: [`The data controller is ${COMPANY.legalName.en}, CR No. ${COMPANY.cr}, ${COMPANY.address.en}. For any privacy request you can reach us at ${COMPANY.email}.`] },
      { h: 'What personal data we collect', body: [
        'Account data: name, business name, email, phone number, and login credentials.',
        'Billing data: subscription plan, payment status, and invoices (card details are handled by our payment provider, not stored by us).',
        'Usage data: orders, menu activity, device and log information, and analytics about how the platform is used.',
        'Customer data you upload: information about your own guests that you choose to manage in Serva — you are the controller of that data and we process it on your behalf.',
      ] },
      { h: 'Why we process it', body: [
        'To provide, operate, and secure the platform and your account.',
        'To process subscriptions, setup fees, and payments.',
        'To provide support and send service-related notices.',
        'To improve our products and produce aggregated analytics.',
        'With your consent, to send marketing or commercial messages.',
      ] },
      { h: 'Legal basis & consent', body: ['We process personal data on the basis of your consent, the performance of our contract with you, and our compliance with applicable Omani law. Where the law requires written consent — for example to send you advertising or marketing — we will ask for it, and you can withdraw it at any time.'] },
      { h: 'Marketing & unsubscribe', body: ['We only send marketing or commercial materials with your consent. Every such message includes a way to unsubscribe, and you can also opt out by contacting us.'] },
      { h: 'Sharing & disclosure', body: ['We share personal data only with service providers who help us run the platform (such as hosting, payment, and messaging providers) under appropriate safeguards, or where required by law or a competent authority. We do not sell personal data.'] },
      { h: 'International transfers', body: ['Where personal data is transferred or processed outside Oman, we take steps to ensure a level of protection consistent with the PDPL.'] },
      { h: 'Data retention', body: ['We keep personal data for as long as your account is active and as needed to provide the service, then for any period required to meet legal, tax, and accounting obligations, after which it is deleted or anonymised.'] },
      { h: 'Security', body: ['We use technical and organisational measures to protect personal data against loss, misuse, and unauthorised access. No system is perfectly secure, but we work to keep your data safe.'] },
      { h: 'Your rights', body: ['Under the PDPL you may request access to your personal data, correction, deletion, a copy, or data portability, and you may withdraw consent or object to certain processing. We will respond to written requests within 45 days. To exercise a right, contact us at ' + COMPANY.email + '.'] },
      { h: 'Children', body: ['The platform is intended for businesses and is not directed at children under 18.'] },
      { h: 'Changes to this policy', body: ['We may update this policy from time to time. Material changes will be posted on this page with a new “last updated” date.'] },
    ],
  },
  terms: {
    title: 'Terms & Conditions',
    intro: `These Terms govern your use of the Serva platform provided by ${COMPANY.legalName.en} (“Serva”). By creating an account or using the service, you agree to these Terms.`,
    sections: [
      { h: 'The service', body: ['Serva is a cloud platform for cafés and restaurants that brings together point of sale, online and QR ordering, loyalty, analytics, and customer data. Features available to you depend on your subscription plan.'] },
      { h: 'Accounts & eligibility', body: ['You must provide accurate information, keep your login credentials secure, and are responsible for activity under your account. You confirm you are authorised to act for your business.'] },
      { h: 'Plans, fees & setup', body: [
        'We offer Standard (15 OMR/month) and Pro (20 OMR/month) plans. A one-time setup fee of 50 OMR applies on both plans. All prices are in Omani Rial (OMR).',
        'Subscriptions are billed in advance on a recurring basis until cancelled. You authorise us to charge the applicable fees through your chosen payment method.',
        'We may change prices with reasonable prior notice; changes take effect on your next billing cycle.',
      ] },
      { h: 'Acceptable use', body: ['You agree to use the service lawfully and in line with our Acceptable Use Policy. We may suspend accounts that violate it.'] },
      { h: 'Your content & data', body: ['You retain ownership of the menus, content, and customer data you put into Serva. You grant us the limited rights needed to host and process it to provide the service, and you are responsible for having the right to use that data.'] },
      { h: 'Intellectual property', body: ['Serva and its software, design, and trademarks remain our property. These Terms do not transfer any of our intellectual property to you.'] },
      { h: 'Availability & support', body: ['We work to keep the service available and provide support according to your plan, but we do not guarantee uninterrupted or error-free operation, and maintenance may occasionally be required.'] },
      { h: 'Suspension & termination', body: ['You may cancel as described in our Refund & Cancellation Policy. We may suspend or terminate access for non-payment, breach of these Terms, or where required by law.'] },
      { h: 'Liability', body: ['To the extent permitted by Omani law, Serva is provided “as is”, and our total liability for any claim is limited to the fees you paid us in the three months before the claim. We are not liable for indirect or consequential losses.'] },
      { h: 'Governing law', body: ['These Terms are governed by the laws of the Sultanate of Oman, and the courts of Oman have jurisdiction over any dispute.'] },
      { h: 'Changes to these Terms', body: ['We may update these Terms from time to time. Continued use after changes take effect means you accept the updated Terms.'] },
    ],
  },
  refund: {
    title: 'Refund & Cancellation Policy',
    intro: 'This policy explains how subscriptions and the setup fee can be cancelled and when refunds apply. It is consistent with the Sultanate of Oman’s Consumer Protection Law (Royal Decree No. 66/2014).',
    sections: [
      { h: 'Subscription cancellation', body: ['You can cancel your subscription at any time by contacting us or from your account. Cancellation stops future renewals; your plan stays active until the end of the current paid period.'] },
      { h: 'Monthly fees', body: ['Subscription fees are billed in advance for each period. Because the service is delivered continuously, paid periods that have already started are generally non-refundable except where required by law.'] },
      { h: 'Setup fee', body: ['The one-time 50 OMR setup fee covers onboarding and configuration work. It is refundable only if we have not yet begun that work; once onboarding has started it is non-refundable.'] },
      { h: 'Your statutory rights', body: ['If the service is defective, not as described, or does not conform to what was agreed, you are entitled under the Consumer Protection Law to a remedy, which may include correction, a replacement, or a refund. These rights are not affected by this policy.'] },
      { h: 'How to request a refund', body: [`Email ${COMPANY.email} with your account details and the reason for the request. We aim to review refund requests promptly and to process approved refunds to your original payment method.`] },
      { h: 'Contact', body: [`For any billing question, reach us at ${COMPANY.email}.`] },
    ],
  },
  cookies: {
    title: 'Cookie Policy',
    intro: 'This policy explains how Serva uses cookies and similar technologies on our website and platform.',
    sections: [
      { h: 'What cookies are', body: ['Cookies are small text files stored on your device that help a website function and remember your preferences.'] },
      { h: 'Cookies we use', body: [
        'Essential cookies: required to sign in, keep your session, and secure the platform.',
        'Preference cookies: remember choices such as your language (Arabic or English).',
        'Analytics cookies: help us understand how the platform is used so we can improve it.',
      ] },
      { h: 'Managing cookies', body: ['You can control or delete cookies through your browser settings. Blocking essential cookies may stop parts of the platform from working.'] },
      { h: 'Changes', body: ['We may update this policy as our use of cookies changes. The latest version is always shown on this page.'] },
    ],
  },
  'acceptable-use': {
    title: 'Acceptable Use Policy',
    intro: 'This policy sets out what is and isn’t allowed when using Serva. It forms part of our Terms & Conditions.',
    sections: [
      { h: 'Prohibited use', body: ['You must not use Serva to break any law, infringe others’ rights, send spam or unlawful messages, or process data you have no right to use.'] },
      { h: 'Platform integrity', body: ['You must not attempt to disrupt, reverse-engineer, overload, or gain unauthorised access to the platform or other accounts.'] },
      { h: 'Content standards', body: ['Content you upload must be accurate where it concerns prices and products, and must not be unlawful, deceptive, or harmful.'] },
      { h: 'Customer data', body: ['When you process your own customers’ data in Serva, you must do so lawfully, including under the Personal Data Protection Law, and only for legitimate business purposes.'] },
      { h: 'Enforcement', body: ['We may investigate suspected violations and may suspend or terminate access where this policy is breached.'] },
    ],
  },
};

const ar: Record<LegalSlug, LegalDoc> = {
  privacy: {
    title: 'سياسة الخصوصية',
    intro: `تُشغّل ${COMPANY.legalName.ar} ("سيرفا"، "نحن") منصّة سحابية للمقاهي والمطاعم. توضّح هذه السياسة كيف نجمع البيانات الشخصية ونستخدمها ونحميها وفقاً لقانون حماية البيانات الشخصية في سلطنة عُمان (المرسوم السلطاني رقم 6/2022) ولائحته التنفيذية.`,
    sections: [
      { h: 'من نحن (المتحكّم)', body: [`المتحكّم في البيانات هو ${COMPANY.legalName.ar}، سجل تجاري رقم ${COMPANY.cr}، ${COMPANY.address.ar}. لأي طلب يخصّ الخصوصية يمكنك مراسلتنا على ${COMPANY.email}.`] },
      { h: 'البيانات الشخصية التي نجمعها', body: [
        'بيانات الحساب: الاسم واسم النشاط والبريد الإلكتروني ورقم الهاتف وبيانات الدخول.',
        'بيانات الفوترة: خطة الاشتراك وحالة الدفع والفواتير (تتولّى بيانات البطاقة جهة الدفع لدينا ولا نخزّنها).',
        'بيانات الاستخدام: الطلبات ونشاط القائمة ومعلومات الجهاز والسجلات وتحليلات استخدام المنصّة.',
        'بيانات العملاء التي ترفعها: معلومات عن ضيوفك تختار إدارتها في سيرفا — أنت المتحكّم بها ونحن نعالجها نيابةً عنك.',
      ] },
      { h: 'أغراض المعالجة', body: [
        'تقديم المنصّة وتشغيلها وتأمين حسابك.',
        'معالجة الاشتراكات ورسوم التهيئة والمدفوعات.',
        'تقديم الدعم وإرسال الإشعارات المتعلّقة بالخدمة.',
        'تطوير منتجاتنا وإنتاج تحليلات مجمّعة.',
        'إرسال رسائل تسويقية أو تجارية بموافقتك.',
      ] },
      { h: 'الأساس القانوني والموافقة', body: ['نعالج البيانات الشخصية بناءً على موافقتك وتنفيذ العقد المبرم معك والامتثال للقوانين العُمانية المعمول بها. وحين يشترط القانون موافقة كتابية — مثل إرسال المواد الإعلانية أو التسويقية — سنطلبها، ويمكنك سحبها في أي وقت.'] },
      { h: 'التسويق وإلغاء الاشتراك', body: ['لا نرسل مواد تسويقية أو تجارية إلا بموافقتك. وتتضمّن كل رسالة وسيلة لإلغاء الاشتراك، كما يمكنك إلغاؤه بالتواصل معنا.'] },
      { h: 'المشاركة والإفصاح', body: ['نشارك البيانات الشخصية فقط مع مزوّدي الخدمات الذين يساعدوننا في تشغيل المنصّة (كالاستضافة والدفع والمراسلة) ضمن ضمانات مناسبة، أو حين يتطلّب القانون أو جهة مختصّة ذلك. ولا نبيع البيانات الشخصية.'] },
      { h: 'النقل خارج السلطنة', body: ['حين تُنقل البيانات الشخصية أو تُعالج خارج عُمان، نتّخذ خطوات لضمان مستوى حماية يتوافق مع قانون حماية البيانات الشخصية.'] },
      { h: 'مدة الاحتفاظ', body: ['نحتفظ بالبيانات الشخصية طوال نشاط حسابك وبالقدر اللازم لتقديم الخدمة، ثم للمدة المطلوبة للوفاء بالالتزامات القانونية والضريبية والمحاسبية، وبعدها تُحذف أو يُزال ما يدلّ على الهوية.'] },
      { h: 'الأمان', body: ['نستخدم تدابير تقنية وتنظيمية لحماية البيانات الشخصية من الفقدان وسوء الاستخدام والوصول غير المصرّح به. ولا يوجد نظام آمن تماماً، لكننا نعمل على حفظ بياناتك.'] },
      { h: 'حقوقك', body: ['بموجب القانون يحق لك طلب الاطّلاع على بياناتك الشخصية أو تصحيحها أو حذفها أو الحصول على نسخة منها أو نقلها، كما يمكنك سحب الموافقة أو الاعتراض على معالجة معيّنة. وسنردّ على الطلبات الكتابية خلال 45 يوماً. لممارسة أيّ حق راسلنا على ' + COMPANY.email + '.'] },
      { h: 'الأطفال', body: ['المنصّة موجَّهة للأعمال وليست موجَّهة للأطفال دون 18 عاماً.'] },
      { h: 'تعديلات السياسة', body: ['قد نحدّث هذه السياسة من حين لآخر، وستُنشر التغييرات الجوهرية على هذه الصفحة مع تاريخ تحديث جديد.'] },
    ],
  },
  terms: {
    title: 'الشروط والأحكام',
    intro: `تحكم هذه الشروط استخدامك لمنصّة سيرفا المقدّمة من ${COMPANY.legalName.ar} ("سيرفا"). بإنشائك حساباً أو استخدامك للخدمة فإنك توافق على هذه الشروط.`,
    sections: [
      { h: 'الخدمة', body: ['سيرفا منصّة سحابية للمقاهي والمطاعم تجمع نقاط البيع والطلب أونلاين وعبر QR والولاء والتحليلات وبيانات العملاء. وتعتمد المزايا المتاحة لك على خطة اشتراكك.'] },
      { h: 'الحسابات والأهلية', body: ['يجب تقديم معلومات صحيحة والحفاظ على سرّية بيانات الدخول، وأنت مسؤول عن النشاط الذي يجري عبر حسابك، وتقرّ بأنك مخوّل بالتصرّف نيابةً عن نشاطك.'] },
      { h: 'الخطط والرسوم والتهيئة', body: [
        'نوفّر خطة ستاندرد (15 ر.ع شهرياً) وخطة برو (20 ر.ع شهرياً)، وتُطبَّق رسوم تهيئة لمرة واحدة بقيمة 50 ر.ع على الخطتين. جميع الأسعار بالريال العُماني.',
        'تُحصَّل الاشتراكات مقدّماً وبشكل متكرّر حتى الإلغاء، وأنت تخوّلنا بتحصيل الرسوم عبر وسيلة الدفع التي تختارها.',
        'قد نغيّر الأسعار بإشعار مسبق معقول، وتسري التغييرات في دورة الفوترة التالية.',
      ] },
      { h: 'الاستخدام المقبول', body: ['توافق على استخدام الخدمة بشكل قانوني ووفقاً لسياسة الاستخدام المقبول لدينا، وقد نوقف الحسابات المخالفة لها.'] },
      { h: 'محتواك وبياناتك', body: ['تحتفظ بملكية القوائم والمحتوى وبيانات العملاء التي تدخلها في سيرفا، وتمنحنا الحقوق المحدودة اللازمة لاستضافتها ومعالجتها لتقديم الخدمة، وأنت مسؤول عن أحقّيتك في استخدام تلك البيانات.'] },
      { h: 'الملكية الفكرية', body: ['تبقى سيرفا وبرمجياتها وتصاميمها وعلاماتها التجارية ملكاً لنا، ولا تنقل هذه الشروط أيّاً من ملكيتنا الفكرية إليك.'] },
      { h: 'التوفّر والدعم', body: ['نعمل على إبقاء الخدمة متاحة وتقديم الدعم وفق خطتك، لكننا لا نضمن تشغيلاً متواصلاً أو خالياً من الأخطاء، وقد تستلزم الخدمة صيانة من حين لآخر.'] },
      { h: 'الإيقاف والإنهاء', body: ['يمكنك الإلغاء وفق سياسة الاسترداد والإلغاء لدينا، وقد نوقف أو ننهي الوصول بسبب عدم السداد أو مخالفة هذه الشروط أو حين يتطلّب القانون ذلك.'] },
      { h: 'المسؤولية', body: ['بالقدر الذي يسمح به القانون العُماني، تُقدَّم سيرفا "كما هي"، وتقتصر مسؤوليتنا الإجمالية عن أيّ مطالبة على الرسوم التي دفعتها لنا خلال الأشهر الثلاثة السابقة للمطالبة، ولا نتحمّل الأضرار غير المباشرة أو التبعية.'] },
      { h: 'القانون الحاكم', body: ['تخضع هذه الشروط لقوانين سلطنة عُمان، وتختصّ محاكم السلطنة بالنظر في أيّ نزاع.'] },
      { h: 'تعديلات الشروط', body: ['قد نحدّث هذه الشروط من حين لآخر، واستمرارك في الاستخدام بعد سريان التغييرات يعني قبولك للشروط المحدّثة.'] },
    ],
  },
  refund: {
    title: 'سياسة الاسترداد والإلغاء',
    intro: 'توضّح هذه السياسة كيفية إلغاء الاشتراكات ورسوم التهيئة ومتى تنطبق المبالغ المستردّة، وهي متوافقة مع قانون حماية المستهلك في سلطنة عُمان (المرسوم السلطاني رقم 66/2014).',
    sections: [
      { h: 'إلغاء الاشتراك', body: ['يمكنك إلغاء اشتراكك في أي وقت عبر التواصل معنا أو من حسابك. ويوقف الإلغاء التجديدات المستقبلية، وتبقى خطتك فعّالة حتى نهاية الفترة المدفوعة الحالية.'] },
      { h: 'الرسوم الشهرية', body: ['تُحصَّل رسوم الاشتراك مقدّماً لكل فترة، ولأن الخدمة تُقدَّم بشكل متواصل فإن الفترات المدفوعة التي بدأت بالفعل غير قابلة للاسترداد عادةً إلا حين يقتضي القانون ذلك.'] },
      { h: 'رسوم التهيئة', body: ['تغطّي رسوم التهيئة لمرة واحدة (50 ر.ع) أعمال الإعداد والتجهيز، وهي قابلة للاسترداد فقط إن لم نكن قد بدأنا تلك الأعمال؛ وبمجرّد بدء التهيئة تصبح غير قابلة للاسترداد.'] },
      { h: 'حقوقك النظامية', body: ['إذا كانت الخدمة معيبة أو غير مطابقة للوصف أو لِما اتُّفق عليه، يحق لك بموجب قانون حماية المستهلك الحصول على معالجة قد تشمل التصحيح أو الاستبدال أو الاسترداد، ولا تتأثّر هذه الحقوق بهذه السياسة.'] },
      { h: 'كيفية طلب الاسترداد', body: [`راسلنا على ${COMPANY.email} مع بيانات حسابك وسبب الطلب. نسعى لمراجعة طلبات الاسترداد بسرعة ومعالجة المعتمَد منها إلى وسيلة الدفع الأصلية.`] },
      { h: 'التواصل', body: [`لأي استفسار يخصّ الفوترة، تواصل معنا على ${COMPANY.email}.`] },
    ],
  },
  cookies: {
    title: 'سياسة ملفات الكوكيز',
    intro: 'توضّح هذه السياسة كيف تستخدم سيرفا ملفات الكوكيز والتقنيات المماثلة على موقعنا ومنصّتنا.',
    sections: [
      { h: 'ما هي الكوكيز', body: ['الكوكيز ملفات نصّية صغيرة تُخزَّن على جهازك لمساعدة الموقع على العمل وتذكّر تفضيلاتك.'] },
      { h: 'الكوكيز التي نستخدمها', body: [
        'كوكيز أساسية: لازمة لتسجيل الدخول والحفاظ على الجلسة وتأمين المنصّة.',
        'كوكيز التفضيلات: تتذكّر اختياراتك مثل اللغة (العربية أو الإنجليزية).',
        'كوكيز التحليلات: تساعدنا على فهم كيفية استخدام المنصّة لتحسينها.',
      ] },
      { h: 'إدارة الكوكيز', body: ['يمكنك التحكّم بالكوكيز أو حذفها من إعدادات متصفّحك، وقد يؤدّي حجب الكوكيز الأساسية إلى تعطّل أجزاء من المنصّة.'] },
      { h: 'التعديلات', body: ['قد نحدّث هذه السياسة مع تغيّر استخدامنا للكوكيز، وتظهر أحدث نسخة دائماً على هذه الصفحة.'] },
    ],
  },
  'acceptable-use': {
    title: 'سياسة الاستخدام المقبول',
    intro: 'تحدّد هذه السياسة ما هو مسموح وغير مسموح عند استخدام سيرفا، وهي جزء من الشروط والأحكام.',
    sections: [
      { h: 'الاستخدامات المحظورة', body: ['يُحظر استخدام سيرفا لمخالفة أي قانون أو انتهاك حقوق الغير أو إرسال رسائل مزعجة أو غير قانونية أو معالجة بيانات لا تملك حقّ استخدامها.'] },
      { h: 'سلامة المنصّة', body: ['يُحظر محاولة تعطيل المنصّة أو هندستها العكسية أو إثقالها أو الوصول غير المصرّح به إليها أو إلى حسابات أخرى.'] },
      { h: 'معايير المحتوى', body: ['يجب أن يكون المحتوى الذي ترفعه دقيقاً فيما يخصّ الأسعار والمنتجات، وألا يكون مخالفاً للقانون أو مضلّلاً أو ضارّاً.'] },
      { h: 'بيانات العملاء', body: ['عند معالجتك لبيانات عملائك في سيرفا، يجب أن يتمّ ذلك بشكل قانوني، بما يشمل قانون حماية البيانات الشخصية، ولأغراض تجارية مشروعة فقط.'] },
      { h: 'الإنفاذ', body: ['قد نحقّق في المخالفات المشتبه بها وقد نوقف أو ننهي الوصول عند مخالفة هذه السياسة.'] },
    ],
  },
};

export const LEGAL: Record<Lang, Record<LegalSlug, LegalDoc>> = { en, ar };
