import type { Dict } from '../../../lib/i18n';

/** Fill {placeholders} in a translated string. */
export const fill = (s: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.replace(`{${k}}`, String(v)), s);

/**
 * Everything the shelf says, in both languages.
 *
 * <p>The words do one job each. A state is named for what to do about it ("Order more"), not
 * for how the system feels about it ("Low"); an empty screen is an invitation rather than a
 * notice; and the two ways a number can move are never both called "save", because a delivery
 * and a correction are different events and the whole feature depends on nobody confusing them.
 */
export const DICT: Dict = {
  ar: {
    search: 'بحث', add: 'إضافة صنف', toBuy: '{n} للشراء', showAll: 'عرض الكل',
    value: 'قيمة المخزون', loading: 'جارٍ التحميل…',

    emptyT: 'المخزون فارغ',
    emptyS: 'أضف ما تشتريه كل أسبوع. اضغط على واحد للبدء.',
    noMatchT: 'لا يوجد «{q}»', noMatchS: 'ليس في مخزونك بعد.', addNamed: 'إضافة «{q}»',

    stOk: 'جيد', stOrder: 'اطلب المزيد', stOut: 'نفد', stNoLine: 'بدون حد طلب',

    /* the item sheet */
    onShelf: 'في المخزون', notCounted: 'لم يُعد بعد', updatedAgo: 'آخر تحديث {when}',
    arrived: 'كم وصل؟', otherAmount: 'كمية أخرى', addStock: 'إضافة للمخزون',
    lands: 'ليصبح المجموع {q}', needAmount: 'حدد الكمية التي وصلت',
    addedToast: 'أُضيف {q}',
    addPrice: 'إضافة السعر', pricePer: 'السعر لكل {u}',
    recount: 'تصحيح العدد', countT: 'كم الموجود فعلاً؟',
    countHint: 'هذا يستبدل الرقم ولا يضيف إليه.', countSave: 'حفظ العدد', countedToast: 'تم حفظ العدد',
    needCount: 'اكتب الكمية الموجودة',
    editItem: 'تعديل الصنف', removeItem: 'حذف',
    removeWarn: 'حذف {name} من المخزون؟', removedToast: 'تم حذف الصنف',

    /* the form */
    newT: 'صنف جديد', editT: 'تعديل الصنف', save: 'حفظ', savedToast: 'تم الحفظ',
    fName: 'الاسم', fUnit: 'يُحسب بـ', fHave: 'كم لديك الآن؟', fLine: 'اطلب المزيد عند',
    fLineHint: 'ينبّهك المربع عند هذا الحد أو أقل. اتركه فارغًا إن لم ترد تنبيهًا.',
    needName: 'أدخل اسم الصنف',
    unitWarn: 'الرقم سيبقى {n} — تغيير الوحدة لا يحوّله.',

    uKG: 'كيلو', uG: 'جرام', uL: 'لتر', uML: 'مليلتر', uPIECE: 'حبة',
  },
  en: {
    search: 'Search', add: 'Add item', toBuy: '{n} to buy', showAll: 'Show all',
    value: 'Shelf value', loading: 'Loading…',

    emptyT: 'Nothing on the shelf yet',
    emptyS: 'Add what you buy every week. Tap one to start.',
    noMatchT: 'No “{q}” here', noMatchS: 'You don’t stock it yet.', addNamed: 'Add “{q}”',

    stOk: 'Fine', stOrder: 'Order more', stOut: 'Out', stNoLine: 'No order line',

    /* the item sheet */
    onShelf: 'On the shelf', notCounted: 'Not counted yet', updatedAgo: 'Updated {when}',
    arrived: 'How much arrived?', otherAmount: 'Other amount', addStock: 'Add to shelf',
    lands: 'That makes it {q}', needAmount: 'Say how much arrived',
    addedToast: 'Added {q}',
    addPrice: 'Add the price', pricePer: 'Price per {u}',
    recount: 'Correct the count', countT: 'What’s actually there?',
    countHint: 'This replaces the figure — it doesn’t add to it.',
    countSave: 'Save count', countedToast: 'Count saved', needCount: 'Type what is there',
    editItem: 'Edit item', removeItem: 'Remove',
    removeWarn: 'Remove {name} from the shelf?', removedToast: 'Item removed',

    /* the form */
    newT: 'New item', editT: 'Edit item', save: 'Save', savedToast: 'Saved',
    fName: 'Name', fUnit: 'Counted in', fHave: 'How much do you have?', fLine: 'Order more at',
    fLineHint: 'The tile warns you at or below this. Leave it empty for no warning.',
    needName: 'Give it a name',
    unitWarn: 'The figure stays {n} — changing the unit doesn’t convert it.',

    uKG: 'Kilos', uG: 'Grams', uL: 'Litres', uML: 'Millilitres', uPIECE: 'Pieces',
  },
};
