import type { Dict } from '../../../lib/i18n';

/** Fill {placeholders} in a translated string. */
export const fill = (s: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.replace(`{${k}}`, String(v)), s);

/**
 * Everything the till says, in both languages.
 *
 * <p>One question, asked twice in the same words — how much cash is in the drawer — and one
 * answer. A drawer is short or over, which is a fact, never "wrong".
 */
export const DICT: Dict = {
  ar: {
    /* the shop sign */
    till: 'الصندوق',
    stOpen: 'الصندوق مفتوح', stClosed: 'الصندوق مغلق',

    /* the question, asked at both ends of the day */
    cashQ: 'كم النقد في الدرج؟',
    openT: 'افتح الصندوق', openBtn: 'افتح الصندوق', openedToast: 'الصندوق مفتوح',
    closeT: 'أغلق الصندوق', closeBtn: 'أغلق الصندوق', closedToast: 'الصندوق مغلق',

    /* the open drawer */
    expectedNow: 'المفترض في الدرج',
    openedBy: 'فتحه {who} · {t}', openedAt: 'فُتح {t}',
    justNow: 'الآن', forMins: 'قبل {n} دقيقة', forHours: 'قبل {n} ساعة', forDays: 'قبل {n} يوم',
    floatIn: 'نقد البداية', cashSoFar: 'مبيعات نقدية', cardSoFar: 'مبيعات بالبطاقة', ordersSoFar: 'الطلبات',

    /* the answer */
    resultT: 'قفلة اليوم', diff: 'الفرق',
    shortWord: 'ناقص', overWord: 'زائد', exact: 'مطابق',
    counted: 'المعدود', expected: 'المفترض',
    cashSales: 'نقد', cardSales: 'بطاقة', ordersDone: 'طلبات',
    done: 'تم',

    /* the nights before */
    recent: 'الإغلاقات السابقة', noHistory: 'لا يوجد إغلاق سابق بعد.',

    /* not allowed */
    needPayments: 'الصندوق مغلق. فتحه يحتاج صلاحية المدفوعات.',

    cancel: 'إلغاء',
  },
  en: {
    till: 'Till',
    stOpen: 'Till open', stClosed: 'Till closed',

    cashQ: 'How much cash is in the drawer?',
    openT: 'Open the till', openBtn: 'Open the till', openedToast: 'Till open',
    closeT: 'Close the till', closeBtn: 'Close the till', closedToast: 'Till closed',

    expectedNow: 'Should be in the drawer',
    openedBy: 'Opened by {who} · {t}', openedAt: 'Opened {t}',
    justNow: 'just now', forMins: '{n}m ago', forHours: '{n}h ago', forDays: '{n}d ago',
    floatIn: 'Starting cash', cashSoFar: 'Cash sales', cardSoFar: 'Card sales', ordersSoFar: 'Orders',

    resultT: 'Tonight’s count', diff: 'Difference',
    shortWord: 'short', overWord: 'over', exact: 'Exactly right',
    counted: 'Counted', expected: 'Should be',
    cashSales: 'Cash', cardSales: 'Card', ordersDone: 'Orders',
    done: 'Done',

    recent: 'Recent closes', noHistory: 'No till has been closed yet.',

    needPayments: 'The till is closed. Opening it needs the Payments permission.',

    cancel: 'Cancel',
  },
};
