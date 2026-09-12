import type { Dict } from '../../../lib/i18n';

/** Fill {placeholders} in a translated string. */
export const fill = (s: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.replace(`{${k}}`, String(v)), s);

/**
 * Everything the till says, in both languages.
 *
 * <p>Two questions, asked with the same words: how much cash is in the drawer when you open,
 * how much when you close. A drawer is short or over, which is a fact, never "wrong".
 */
export const DICT: Dict = {
  ar: {
    /* header + state */
    till: 'الصندوق',
    stOpen: 'يستقبل الطلبات', stPaused: 'الطلبات متوقفة', stClosed: 'الصندوق مغلق',
    minShort: 'د', hourShort: 'س', dayShort: 'ي',

    /* the open drawer */
    openedBy: 'فتحه {who} · منذ {t}', openedAt: 'مفتوح منذ {t}',
    floatIn: 'نقد البداية', cashSoFar: 'مبيعات نقدية', cardSoFar: 'مبيعات بالبطاقة', ordersSoFar: 'الطلبات',
    expectedNow: 'المفترض في الدرج الآن',

    /* opening */
    openT: 'افتح الصندوق', floatLabel: 'كم النقد في الدرج الآن؟',
    openBtn: 'افتح الصندوق', openedToast: 'الصندوق مفتوح',

    /* pausing */
    pauseBtn: 'إيقاف الطلبات', resumeBtn: 'استئناف الطلبات',
    pausedToast: 'تم إيقاف طلبات العملاء', resumedToast: 'تم استئناف طلبات العملاء',

    /* closing */
    closeT: 'أغلق الصندوق', countLabel: 'كم النقد في الدرج الآن؟',
    closeBtn: 'أغلق الصندوق', closedToast: 'الصندوق مغلق',

    /* the count, after */
    resultT: 'قفلة اليوم', counted: 'المعدود', expected: 'المفترض', diff: 'الفرق',
    short: 'ناقص {v}', over: 'زائد {v}', exact: 'مطابق',
    cashSales: 'نقد', cardSales: 'بطاقة', ordersDone: 'طلبات',
    done: 'تم',

    /* history */
    recent: 'الإغلاقات السابقة', noHistory: 'لا يوجد إغلاق سابق بعد.',

    /* not allowed */
    needPayments: 'الصندوق مغلق. فتحه يحتاج صلاحية المدفوعات.',

    cancel: 'إلغاء',
  },
  en: {
    till: 'Till',
    stOpen: 'Accepting orders', stPaused: 'Orders paused', stClosed: 'Till closed',
    minShort: 'm', hourShort: 'h', dayShort: 'd',

    openedBy: 'Opened by {who} · {t} ago', openedAt: 'Open for {t}',
    floatIn: 'Starting cash', cashSoFar: 'Cash sales', cardSoFar: 'Card sales', ordersSoFar: 'Orders',
    expectedNow: 'Should be in the drawer now',

    openT: 'Open the till', floatLabel: 'How much cash is in the drawer now?',
    openBtn: 'Open the till', openedToast: 'Till open',

    pauseBtn: 'Pause orders', resumeBtn: 'Resume orders',
    pausedToast: 'Customer orders paused', resumedToast: 'Customer orders resumed',

    closeT: 'Close the till', countLabel: 'How much cash is in the drawer now?',
    closeBtn: 'Close the till', closedToast: 'Till closed',

    resultT: 'Tonight’s count', counted: 'Counted', expected: 'Should be', diff: 'Difference',
    short: '{v} short', over: '{v} over', exact: 'Exactly right',
    cashSales: 'Cash', cardSales: 'Card', ordersDone: 'Orders',
    done: 'Done',

    recent: 'Recent closes', noHistory: 'No till has been closed yet.',

    needPayments: 'The till is closed. Opening it needs the Payments permission.',

    cancel: 'Cancel',
  },
};
