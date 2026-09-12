import type { Dict } from '../../../lib/i18n';

/** Fill {placeholders} in a translated string. */
export const fill = (s: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.replace(`{${k}}`, String(v)), s);

/**
 * Everything the till says, in both languages.
 *
 * <p>The words keep one distinction straight, because the whole feature rests on it: closing
 * the till is the end of the day and a cash count, pausing is a break. Nothing here calls
 * either of them "off", and the closing screen never says "correct" or "wrong" about a count —
 * a drawer is short or over, which is a fact, and the note beside it is where the reason goes.
 */
export const DICT: Dict = {
  ar: {
    /* header + state */
    till: 'الصندوق',
    stOpen: 'يستقبل الطلبات', stPaused: 'الطلبات متوقفة', stClosed: 'الصندوق مغلق',
    pausedLeft: 'متوقفة · {t}', minShort: 'د', hourShort: 'س',

    /* the open drawer */
    openedBy: 'فتحه {who}', openedAt: 'منذ {t}', openedByNobody: 'كان مفتوحاً قبل أن نبدأ العد',
    floatIn: 'نقد البداية', ordersSoFar: 'طلبات', cardSoFar: 'بطاقة', cashSoFar: 'نقد',
    expectedNow: 'المتوقع في الدرج', openTabs: '{n} فاتورة لم تُدفع بعد',
    blindHint: 'المبلغ المتوقع يظهر بعد أن تُدخل العدّ.',

    /* opening */
    openT: 'افتح الصندوق', openS: 'عُدّ ما في الدرج الآن، وابدأ اليوم منه.',
    floatLabel: 'النقد في الدرج الآن', floatCarried: 'عدّ ليلة أمس: {v}',
    openBtn: 'افتح الصندوق واستقبل الطلبات',
    openedToast: 'الصندوق مفتوح',

    /* pausing */
    pauseT: 'أوقف الطلبات مؤقتاً', pauseS: 'الصندوق يبقى مفتوحاً والكاشير يواصل البيع — قائمة العملاء وحدها تتوقف.',
    pause15: '15 دقيقة', pause30: '30 دقيقة', pause60: 'ساعة', pauseOpen: 'حتى أستأنف',
    pauseBtn: 'إيقاف الطلبات', resumeBtn: 'استئناف الطلبات',
    pausedToast: 'تم إيقاف طلبات العملاء', resumedToast: 'تم استئناف طلبات العملاء',

    /* closing */
    closeT: 'أغلق الصندوق', closeS: 'عُدّ ما في الدرج واكتب الرقم كما هو. المقارنة تأتي بعده.',
    countLabel: 'الموجود في الدرج',
    closeWarnTabs: '{n} فاتورة على الطاولات لم تُدفع بعد — نقدها ليس في الدرج.',
    closeBtn: 'أغلق الصندوق',
    closedToast: 'الصندوق مغلق',

    /* the count, after */
    resultT: 'قفلة اليوم', counted: 'المعدود', expected: 'المتوقع', diff: 'الفرق',
    short: 'ناقص {v}', over: 'زائد {v}', exact: 'مطابق تماماً',
    cashSales: 'نقد', cardSales: 'بطاقة', ordersDone: 'طلبات',
    noteLabel: 'ماذا حدث؟', notePlaceholder: 'صرفنا فكة ناقصة لطاولة…',
    noteNeeded: 'الدرج ناقص أو زائد بأكثر من {v} — اكتب السبب قبل الإغلاق.',
    done: 'تم',

    /* history */
    lastClose: 'آخر إغلاق', recent: 'الإغلاقات السابقة', noHistory: 'لا يوجد إغلاق سابق بعد.',
    byWho: '{who}',

    /* off / not allowed */
    tillOff: 'هذا الفرع لا يستخدم الصندوق. الزر هنا إيقاف مؤقت فقط.',
    needPayments: 'فتح الصندوق وإغلاقه يحتاج صلاحية المدفوعات.',
    closedBlocks: 'لا يمكن استقبال أي طلب والصندوق مغلق — لا من القائمة ولا من الكاشير.',

    cancel: 'إلغاء',

    /* settings */
    setTitle: 'الصندوق', setSurface: 'الكاشير',
    setSub: 'كيف يفتح هذا الفرع يومه ويقفله.',
    secUse: 'هل تعدّون الدرج؟', secUseSub: 'الصندوق هو ما يجعل زر «استقبال الطلبات» يعني شيئاً.',
    useTill: 'استخدم الصندوق',
    useTillOn: 'لا يُستقبل أي طلب إلا والصندوق مفتوح، ولا يُغلق إلا بعدّ.',
    useTillOff: 'يبقى زر الإيقاف المؤقت وحده، بلا عدّ ولا سجل.',
    secCount: 'عند الإغلاق', secCountSub: 'ما الذي تراه الكاشيرة وهي تعدّ.',
    blind: 'عدّ أعمى',
    blindOn: 'تُدخل ما في الدرج أولاً، ثم يظهر المتوقع والفرق. العدّ يبقى شهادة مستقلة.',
    blindOff: 'المتوقع ظاهر طوال الوردية وأثناء العدّ.',
    carry: 'رحّل نقد الإغلاق إلى بداية اليوم التالي',
    carryOn: 'يبدأ الصندوق التالي بعدّ الليلة الماضية، وفتحه ضغطة واحدة.',
    carryOff: 'يبدأ كل يوم من صفر وتكتب ما وضعته.',
    secNote: 'الفروقات', secNoteSub: 'متى يُطلب تفسير مكتوب.',
    noteAsk: 'اطلب سبباً إذا زاد الفرق عن',
    noteNever: 'لا تسأل أبداً',
    saveBtn: 'حفظ', savedToast: 'تم الحفظ',
  },
  en: {
    till: 'Till',
    stOpen: 'Accepting orders', stPaused: 'Orders paused', stClosed: 'Till closed',
    pausedLeft: 'Paused · {t}', minShort: 'm', hourShort: 'h',

    openedBy: 'Opened by {who}', openedAt: '{t} ago', openedByNobody: 'Open since before the till was counted',
    floatIn: 'Opening float', ordersSoFar: 'orders', cardSoFar: 'Card', cashSoFar: 'Cash',
    expectedNow: 'Expected in the drawer', openTabs: '{n} bills still unpaid',
    blindHint: 'The expected figure appears once you enter the count.',

    openT: 'Open the till', openS: 'Count what is in the drawer now, and start the day from it.',
    floatLabel: 'Cash in the drawer now', floatCarried: 'Last night’s count: {v}',
    openBtn: 'Open the till and take orders',
    openedToast: 'Till open',

    pauseT: 'Pause orders', pauseS: 'The till stays open and the counter keeps serving — only the customer menu stops.',
    pause15: '15 minutes', pause30: '30 minutes', pause60: 'An hour', pauseOpen: 'Until I resume',
    pauseBtn: 'Pause orders', resumeBtn: 'Resume orders',
    pausedToast: 'Customer orders paused', resumedToast: 'Customer orders resumed',

    closeT: 'Close the till', closeS: 'Count the drawer and type the figure as it is. The comparison comes after.',
    countLabel: 'What is in the drawer',
    closeWarnTabs: '{n} bills on the floor are still unpaid — that cash is not in the drawer.',
    closeBtn: 'Close the till',
    closedToast: 'Till closed',

    resultT: 'Tonight’s count', counted: 'Counted', expected: 'Expected', diff: 'Difference',
    short: '{v} short', over: '{v} over', exact: 'Exactly right',
    cashSales: 'Cash', cardSales: 'Card', ordersDone: 'Orders',
    noteLabel: 'What happened?', notePlaceholder: 'Gave a table the wrong change…',
    noteNeeded: 'The drawer is out by more than {v} — say what happened before closing.',
    done: 'Done',

    lastClose: 'Last close', recent: 'Recent closes', noHistory: 'No till has been closed yet.',
    byWho: '{who}',

    tillOff: 'This branch doesn’t run a till. The switch here is a plain pause.',
    needPayments: 'Opening and closing the till needs the Payments permission.',
    closedBlocks: 'Nothing can be ordered while the till is closed — not from the menu, not at the counter.',

    cancel: 'Cancel',

    setTitle: 'The till', setSurface: 'Counter',
    setSub: 'How this shop opens its day and shuts it.',
    secUse: 'Do you count the drawer?', secUseSub: 'The till is what makes “Accepting orders” mean something.',
    useTill: 'Use the till',
    useTillOn: 'No order can be taken unless the till is open, and it only closes on a count.',
    useTillOff: 'The pause button stands alone — no count, no record.',
    secCount: 'At closing', secCountSub: 'What the person counting can see.',
    blind: 'Blind count',
    blindOn: 'Type what is in the drawer first, then see expected and the difference. The count stays independent evidence.',
    blindOff: 'The expected figure is on screen all shift and while counting.',
    carry: 'Carry the closing cash into tomorrow’s float',
    carryOn: 'The next till starts at last night’s count, so opening is one tap.',
    carryOff: 'Every day starts from nothing and you type what you put in.',
    secNote: 'Differences', secNoteSub: 'When a written reason is asked for.',
    noteAsk: 'Ask for a reason when the drawer is out by more than',
    noteNever: 'Never ask',
    saveBtn: 'Save', savedToast: 'Saved',
  },
};
