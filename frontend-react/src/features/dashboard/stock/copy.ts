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
    fPack: 'كل حبة تحوي', fPackHint: 'اختياري. ليتمكن الوصف من قول «200 مل» بينما يعدّ المخزون الزجاجات.',
    each: 'كل حبة {q}',

    /* usage, on the wall and in the sheet */
    stDays: '≈ {n} {d}', usesPerDay: 'يُستهلك حوالي {q} يوميًا', daysLeft: 'يكفي {n} {d} بهذا المعدل',
    lessThanDay: 'يكفي أقل من يوم بهذا المعدل', backs: 'مرتبط بـ {names}',

    /* the rules section in the menu item editor */
    rulesT: 'المخزون', rulesHint: 'كيف يرتبط هذا الصنف بالمخزون في هذا الفرع.',
    backedBy: 'مرتبط بـ', backedNone: 'غير مرتبط بالمخزون', backedHint: 'كل بيعة تأخذ واحدًا منه.',
    limitL: 'الحد الأقصى يوميًا', limitHint: 'اتركه فارغًا بلا حد. يُعاد كل صباح.', perDay: 'يوميًا',
    recipeT: 'ما يدخل فيه', recipeHint: 'لمعرفة أين يذهب المخزون — لا يغيّر العدد أبدًا.',
    addLine: 'إضافة مكوّن', pickTin: 'اختر…', plateCost: 'تكلفته حوالي',
    rulesLoading: 'جارٍ التحميل…', rulesNoShelf: 'أضف أصنافًا للمخزون أولًا لربطها من هنا.',

    /* the menu, seen from the shelf */
    viewShelf: 'المخزون', viewMenu: 'القائمة',
    menuHint: 'اضغط على صنف لتحديد ما يدعمه من المخزون، أو حدّه اليومي، أو ما يدخل فيه.',
    notSetUp: 'غير مُعدّ', aDay: '{n} يوميًا', perSale: '{name} — واحدة لكل بيعة',
    noMenu: 'لا توجد أصناف في القائمة بعد',

    /* settings */
    setT: 'المخزون', hideT: 'إخفاء الأصناف التي نفدت',
    hideS: 'عندما يكون الصنف مرتبطًا بالمخزون ويصل العدد إلى صفر، يرى العميل «غير متوفر» ولا يستطيع طلبه. عند الإيقاف يبقى العدد لك فقط: لا يُخفى شيء ولا يُرفض طلب.',
    hideNote: 'الحدود اليومية تُطبَّق دائمًا بغض النظر عن هذا الخيار.',
    hideOn: 'يتم إخفاء ما نفد', hideOff: 'لا يُخفى شيء',
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
    fPack: 'Each piece holds', fPackHint: 'Optional. So a recipe can say “200 ml” while the shelf counts bottles.',
    each: '{q} each',

    /* usage, on the wall and in the sheet */
    stDays: '≈ {n} {d}', usesPerDay: 'Uses about {q} a day', daysLeft: '{n} {d} left at this rate',
    lessThanDay: 'Less than a day left at this rate', backs: 'Backs {names}',

    /* the rules section in the menu item editor */
    rulesT: 'Stock', rulesHint: 'How this item meets the shelf at this branch.',
    backedBy: 'Backed by', backedNone: 'Not on the shelf', backedHint: 'One sale takes one from it.',
    limitL: 'At most, a day', limitHint: 'Leave empty for no cap. Resets every morning.', perDay: 'a day',
    recipeT: 'What goes into it', recipeHint: 'For knowing where the stock goes — it never changes the count.',
    addLine: 'Add ingredient', pickTin: 'Choose…', plateCost: 'Costs about',
    rulesLoading: 'Loading…', rulesNoShelf: 'Add items to the shelf first to link them here.',

    /* the menu, seen from the shelf */
    viewShelf: 'Shelf', viewMenu: 'Menu',
    menuHint: 'Tap an item to say what backs it, cap it for the day, or write what goes into it.',
    notSetUp: 'Not set up', aDay: '{n} a day', perSale: '{name} — one per sale',
    noMenu: 'No menu items yet',

    /* settings */
    setT: 'Stock', hideT: 'Hide items that have run out',
    hideS: 'When a menu item is backed by a shelf item and the count reads zero, customers see “Sold out” and can’t order it. Off, the count is only for you: nothing is hidden and nothing is refused.',
    hideNote: 'Daily limits always apply, switch or not.',
    hideOn: 'Hiding items that have run out', hideOff: 'Not hiding anything',
  },
};
