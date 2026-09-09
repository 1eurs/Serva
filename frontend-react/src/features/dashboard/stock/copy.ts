import type { Dict } from '../../../lib/i18n';

/**
 * Every word in stock, in both languages, in one file.
 *
 * <p>The old feature spoke a private language — a sweep, a room, a par, "Needs you", "gone
 * tonight", "Warn at" — each phrase carefully chosen on its own and none of them a phrase a
 * café owner would use. Owners told us they did not know what the page wanted from them, and
 * a vocabulary nobody shares is most of that.
 *
 * <p>Two rules hold this file together. Every verb names what happens when you press it and
 * keeps the same name for the rest of the flow, so "Count the shelf" produces a count and
 * reports "Counted". And every quantity is spoken in the unit the café buys in — packs,
 * kilos, cups — never in the grams the ledger keeps.
 */
export const DICT: Dict = {
  ar: {
    /* ---- the one job ---- */
    jobEyebrow: 'الحين',
    jobCount: 'عُدّ الرف',
    jobCountNew: 'ما في صنف عنده رقم بعد. لفّة وحدة على الرف — دقيقة تقريباً — ويبدأ المخزون يشتغل.',
    jobCountStale: 'آخر عدّة {when}. عدّة كل ليلة هي اللي تخلّي قائمة الطلب صحيحة.',
    jobCountGo: 'ابدأ العد',
    jobOrder: 'اطلب هذي الأصناف ({n})',
    jobOrderSub: 'نزلت تحت حدّ الطلب، وما هي في الطريق.',
    jobOrderGo: 'انسخ للواتساب',
    jobOrderCopied: 'انتسخت — وسجّلناها كطلب مُرسَل',
    jobOrderFailed: 'ما قدرنا ننسخ. حدّد القائمة وانسخها يدوياً.',
    jobOrderEst: 'تقريباً {v}',
    jobUses: 'حدّد وش تستهلك مشروباتك',
    jobUsesGo: 'اربط القائمة',
    jobClear: 'ما في شي يحتاج طلب.',
    jobClearSub: 'كل صنف فوق حدّ الطلب.',

    /* ---- الحلقة: الجملة اللي كان المنتج مدين فيها لصاحب المقهى ولا قالها ---- */
    loopDead: 'البيع ما ينزّل شي من الرف.',
    loopDeadSub: '{n} من {total} صنف في قائمتك ما قال وش ياخذ، فبيعه ما يغيّر شي هنا.',
    loopFix: 'اربط قائمتك',

    /* ---- سطر الإسناد: من وين جت الأرقام ---- */
    counted: 'آخر عدّة {when}', countedNever: 'ما انعدّ شي بعد',
    onShelves: 'على الرفوف', onWay: '{n} في الطريق',
    onWayNote: 'ما نعيد طلبها. أول ما تسجّل التوريد تنقفل لحالها.',
    notComing: 'ما وصلت؟ رجّعها لقائمة الطلب', putBack: 'رجّعناها لقائمة الطلب',

    /* ---- مخفي عن قائمة العملاء ---- */
    offTitle: '{n} من قائمتك مخفية عن العملاء',
    offTitleWarn: '{n} ما تقدر تسويها الحين',
    offSub: 'ما يقدرون يطلبونها. اضغط السبب عشان تفتح الصنف اللي تشتريه.',
    offSubWarnOnly: 'ما زالت معروضة — أنت طلبت إن المخزون ما يخفي شي لحاله.',
    offOut: 'نفد {name}', offOutPlain: 'ناقص مكوّن', offLimit: 'خلص حدّها اليومي',
    autoHideLabel: 'خلّ المخزون يوقف بيع الصنف إذا خلص',
    autoHideHintOn: 'شغّالة: الصنف اللي خلص مكوّنه — أو الجاهز اللي وصل صفر — يختفي من قائمة العملاء ويوقف استقبال الطلبات.',
    autoHideHintOff: 'مطفية: المخزون يستمر بالعدّ وينبّهك هنا، لكن ما يشيل شي من القائمة إلا أنت.',
    autoHideOn: 'صار يخفي تلقائياً', autoHideOff: 'وقفنا الإخفاء التلقائي',
    changeRule: 'المخزون هو اللي سواها — غيّر القاعدة',
    hiddenNow: 'الحين مخفي {n} من قائمتك', hiddenNone: 'ما في شي مخفي الحين.',

    /* ---- الرف ---- */
    shelf: 'الرف', lineCap: 'حدّ الطلب',
    axisNote: 'كل شريط ينقاس على حدّ الطلب حقّه. الشريط اللي ما وصل الخط يحتاج شراء.',
    search: 'ابحث في المخزون', addItem: 'صنف جديد',
    fAll: 'الكل', fBelow: 'تحت الخط', fNew: 'ما انعدّ',
    filters: 'تصفية الرف', uncategorised: 'بدون تصنيف', grpNew: 'ما انعدّ بعد',
    noMatch: 'ما في صنف بهذا الاسم.', showAll: 'اعرض الكل',
    stOut: 'نفد', stOrder: 'اطلبه', stDays: '{n} {d}',
    stLearning: 'يتعلّم', learningDays: 'بعد {n} {d} من البيع',
    stNew: 'ما انعدّ',

    /* ---- أول مرة ---- */
    firstEyebrow: 'ما في شي على الرف بعد',
    firstTitle: 'أضف اللي تشتريه.',
    firstBody: 'بن، حليب، أكواب، أغطية — الأشياء اللي تخلص وتوقّف الشغل. ستة أو سبعة تكفي للبداية، والباقي أضفه وقت ما توصل الفاتورة.',
    firstCta: 'أضف أول صنف',
    firstHow: 'وبعدين؟',
    firstStep1: 'تعدّ الرف مرة كل ليلة — دقيقة.',
    firstStep2: 'كل طلب يخصم مكوّناته لحاله.',
    firstStep3: 'وقت ما ينزل صنف تحت خطّه، يدخل قائمة طلبك.',
    sampleH: 'أرقام تجريبية', sampleAria: 'رف تجريبي',

    /* ---- الأفعال ---- */
    logDelivery: 'تسجيل توريد', logWaste: 'تسجيل هدر', recount: 'صحّح الرقم',
    edit: 'تعديل الصنف', more: 'المزيد', done: 'تم',
    chooseItem: 'اختر صنفاً…', needLine: 'اختر صنفاً واكتب الكمية.',
    recountHint: 'اكتب اللي موجود فعلاً على الرف. الفرق ينسجّل في السجل كتصحيح.',

    /* ---- لوحة الصنف ---- */
    onHand: 'المتوفر', daysCover: 'يكفي', perDay: 'الاستهلاك اليومي',
    costPack: 'سعر العبوة', orderAt: 'خطّ الطلب', notSet: 'غير محدد',
    recent: 'آخر الحركات', noMovements: 'ما في حركات بعد.',
    today: 'اليوم', yesterday: 'أمس',
    usedBy: 'يدخل في {n} من قائمتك', usedByNone: 'ما في شي في قائمتك يستهلكه',
    usedByFix: 'اربطه',

    /* ---- نموذج الصنف ---- */
    nameEn: 'الاسم (إنجليزي)', nameAr: 'الاسم (عربي)',
    needName: 'اكتب اسم الصنف أول.',
    needPack: 'اكتب حجم العبوة — بدونه ما نقدر نحسب شي.',
    startFrom: 'ابدأ من شي تشتريه',
    packA: 'العبوة اللي أشتريها فيها', packB: 'وسعرها', specCurrency: 'ر.ع.',
    packAmountAria: 'حجم العبوة', packUnitAria: 'وحدة العبوة', packCostAria: 'سعر العبوة',
    uKG: 'كيلو', uG: 'جرام', uL: 'لتر', uML: 'مل', uPIECE: 'حبة',
    specPerBase: '{c} لكل {u}', specCountedIn: 'المخزون يُحسب بالـ{u}',
    specFillHint: 'اكتب سعر العبوة كما هو في الفاتورة.',
    yield1: 'والعبوة تكفي تقريباً', yield2: 'حصة.', yieldAria: 'عدد الحصص في العبوة',
    yieldPer: 'يعني {q} {u} للحصة', yieldCost: '{v} تكلفة الحصة',
    optional: 'اختياري',
    yieldHint: 'تجاوزها إذا ما كنت متأكد — كم كوب يطلع من العبوة؟ منها نحسب تكلفة الكوب.',
    openA: 'وعندي الحين على الرف', openB: 'عبوة.',
    openAria: 'عدد العبوات الموجودة الحين',
    openHint: 'تقدر تتخطاها — عدّة الليلة بتسألك عنها. وإذا كتبتها، الرف يبدأ من رقم صحيح من أول يوم.',
    openLands: 'يعني {q} على الرف', openNote: 'رصيد أول',
    usesQ: 'وش يستهلكه من قائمتك؟',
    usesHint: 'اضغط المشروبات اللي تستخدم {name}. كل بيعة تخصم حصة وحدة — تقدر تضبط الكمية بالضبط بعدين.',
    usesNeedYield: 'اكتب عدد الحصص في العبوة فوق، وبنقدر نربطه بقائمتك من هنا.',
    usesLinked: 'ربطناه بـ{n} من قائمتك',
    category: 'التصنيف', categoryEg: 'بن، حليب، تغليف…',
    save: 'حفظ', cancel: 'إلغاء', archive: 'أرشفة الصنف', archived: 'تمت الأرشفة',
    archiveWarn: 'يختفي من المخزون. الحركات والوصفات تبقى كما هي.',
    add: 'إضافة', saved: 'تم الحفظ',
    G: 'جرام', ML: 'مل', PIECE: 'حبة',
    G1: 'جرام', ML1: 'مل', PIECE1: 'حبة',
    tagG: 'جم', tagML: 'مل',

    /* ---- التوريد والهدر ---- */
    quantity: 'الكمية', reason: 'السبب', note: 'ملاحظة', record: 'تسجيل',
    addLine: 'صنف آخر', packs: 'عدد العبوات', costPer: 'سعر',
    enterInUnit: 'أدخلها بالـ{u}', enterInPacks: 'أدخلها بالعبوات', lands: 'يدخل المخزون',
    SPILLED: 'انسكب', EXPIRED: 'منتهي', STAFF_MEAL: 'وجبة موظفين', COMP: 'مجاملة',
    TRAINING: 'تدريب', DAMAGED: 'تالف', OTHER: 'أخرى',

    /* ---- شاشة العدّ: الجولة على الرف، صنف بصنف ---- */
    cOf: '{a} من {b}',
    cLead: 'امشِ على الرف وقل وش موجود. دقيقة وحدة، والباقي يضبط نفسه.',
    cPlenty: 'كمية وافرة', cLowish: 'قارب ينفد', cGone: 'خلص',
    cExact: 'أعدّه بالضبط', cExactHint: 'أدخل الكمية بالـ{u}',
    cParQ: 'كم تخزّن منه لما يكون الرف كامل؟', cParUnit: 'بالـ{u}', cParSet: 'اعتمد',
    cSkip: 'تخطَّ', cBack: 'رجوع', cFinish: 'إنهاء', cSaving: 'جاري الحفظ…',
    cSaveErr: 'ما انحفظت العدّة. جرّب مرة ثانية.',
    cDone: 'خلصت العدّة', cDoneCounted: 'صنف تم عدّه', cDoneOrder: 'يحتاج طلب',
    cDoneNone: 'ما في شي يحتاج طلب. الرفوف مكفّية.',
    cDoneNothing: 'ما عدّيت ولا صنف — تخطّيت العدّة كلها، فما تغيّر شي.',
    cRest: 'امشِ على باقي الأصناف ({n})', cSeeOrder: 'شوف قائمة الطلب', cClose: 'إغلاق',
    cEmpty: 'ما في أصناف تنعدّ', cEmptySub: 'أضف اللي تشتريه أول، وبعدها العدّة تصير أسرع طريقة تحدّث بها المخزون.',
    cNote: 'عدّة الرف', cNow: 'المسجّل عندنا', cPar: 'الرف الكامل',
    cOrderNote: '«قارب ينفد» و«خلص» يدخّلانه في قائمة الطلب.',

    /* ---- وش تستهلك القائمة ---- */
    uTitle: 'وش تستهلك مشروباتك',
    uNoMenu: 'ما في أصناف في قائمتك بعد.',
    uNoShelf: 'ما في شي على الرف بعد.',
    uSearch: 'ابحث في القائمة',
    uNothing: 'ما قال وش ياخذ', uLimit: 'له حدّ يومي', uWired: 'مربوط',
    uSold: 'انباع {n} آخر ٣٠ يوم', uCost: 'تكلفة {v}', uPct: '{n}% من السعر',
    uNil: 'ما ياخذ شي من الرف', uSet: 'حدّد وش ياخذ',
    uUncounted: 'مربوط بصنف ما انعدّ — الرقم تحته تخمين.',
    uHead: '{wired} من {total} صنف يسحب من الرف.',
    uHeadNone: 'ولا صنف من قائمتك يسحب من الرف، فالأرقام ما تتحرك لحالها.',

    /* ---- أسباب الحركة ---- */
    items: 'أصناف',
    RECEIVE: 'توريد', SALE: 'بيع', WASTE: 'هدر', COUNT: 'عدّة', TRANSFER_IN: 'تحويل وارد',
    TRANSFER_OUT: 'تحويل صادر', MANUAL: 'تصحيح', ORDER_RESTORE: 'إرجاع طلب',
    PREP_PRODUCE: 'إنتاج دفعة', PREP_CONSUME: 'استهلاك دفعة',
  },

  en: {
    /* ---- the one job ----
       The page shows exactly one of these at a time, chosen by where the café actually is.
       Owners' first complaint was that they opened stock and could not tell what it wanted
       from them; a screen that names one job cannot have that problem. */
    jobEyebrow: 'Now',
    jobCount: 'Count the shelf',
    jobCountNew: 'Nothing on your shelf has a number yet. Walk round once — about a minute — and stock starts working.',
    jobCountStale: 'Last counted {when}. A count each night is what keeps the order list right.',
    jobCountGo: 'Start counting',
    jobOrder: 'Order these {n}',
    jobOrderSub: 'Below the line, and not already on the way.',
    jobOrderGo: 'Copy for WhatsApp',
    jobOrderCopied: 'Copied — and logged as sent',
    jobOrderFailed: 'Could not copy. Select the list and copy it by hand.',
    jobOrderEst: 'About {v}',
    jobUses: 'Say what your drinks use',
    jobUsesGo: 'Connect your menu',
    jobClear: 'Nothing to order.',
    jobClearSub: 'Everything is above its order line.',

    /* ---- the loop, said as a consequence rather than an instruction ---- */
    loopDead: 'Selling takes nothing off the shelf.',
    loopDeadSub: '{n} of {total} things on your menu do not say what they use, so selling them changes nothing here.',
    loopFix: 'Connect your menu',

    /* ---- the receipts line: where the numbers came from ----
       Owners said they did not trust the figures. A figure with no date on it is a figure
       nobody can check, so the page quotes its evidence next to itself. */
    counted: 'Counted {when}', countedNever: 'Never counted',
    onShelves: 'on the shelves', onWay: '{n} on the way',
    onWayNote: 'These are not asked for again. Logging the delivery closes them by itself.',
    notComing: 'Not coming? Put it back on the list', putBack: 'Back on the order list',

    /* ---- hidden from the customer menu — the costliest thing stock does ---- */
    offTitle: '{n} off your menu right now',
    offTitleWarn: '{n} you cannot make right now',
    offSub: 'Customers cannot order these. Tap the reason to open the thing to buy.',
    offSubWarnOnly: 'Customers can still order these — you asked stock not to hide anything on its own.',
    offOut: 'out of {name}', offOutPlain: 'an ingredient ran out', offLimit: "hit today's limit",
    autoHideLabel: 'Let stock take an item off sale when it runs out',
    autoHideHintOn: 'On: a recipe short an ingredient, or a ready-made item counted to zero, leaves the customer menu by itself and stops taking orders.',
    autoHideHintOff: 'Off: stock keeps counting and still warns you here. Nothing leaves the menu unless you take it off.',
    autoHideOn: 'Stock will hide sold-out items', autoHideOff: 'Stock will only warn you',
    changeRule: 'Stock did this — change the rule',
    hiddenNow: 'Hiding {n} from your menu right now', hiddenNone: 'Nothing hidden right now.',

    /* ---- the shelf ---- */
    shelf: 'The shelf', lineCap: 'order line',
    axisNote: 'Each bar is measured against that item’s own order line. A bar that has not reached the line needs buying.',
    search: 'Search stock', addItem: 'New item',
    fAll: 'All', fBelow: 'Below the line', fNew: 'Not counted',
    filters: 'Filter the shelf', uncategorised: 'Uncategorised', grpNew: 'Not counted yet',
    noMatch: 'No item by that name.', showAll: 'Show everything',
    stOut: 'Out', stOrder: 'Order', stDays: '{n} {d}',
    stLearning: 'Learning', learningDays: 'after {n} {d} of sales',
    stNew: 'Not counted',

    /* ---- first run ---- */
    firstEyebrow: 'Nothing on the shelf yet',
    firstTitle: 'Add what you buy.',
    firstBody: 'Beans, milk, cups, lids — the things that run out and stop you serving. Six or seven is enough to start; add the rest when the invoice is in front of you.',
    firstCta: 'Add your first item',
    firstHow: 'Then what?',
    firstStep1: 'You count the shelf once a night. A minute.',
    firstStep2: 'Every order takes its ingredients off by itself.',
    firstStep3: 'Anything that drops below its line lands on your order list.',
    sampleH: 'Sample numbers', sampleAria: 'Sample shelf',

    /* ---- the verbs ---- */
    logDelivery: 'Log delivery', logWaste: 'Log waste', recount: 'Fix the number',
    edit: 'Edit item', more: 'More', done: 'Done',
    chooseItem: 'Choose an item…', needLine: 'Pick an item and type how much arrived.',
    recountHint: 'Set what is actually on the shelf. The difference is recorded in History as a correction.',

    /* ---- item panel ---- */
    onHand: 'On hand', daysCover: 'Lasts', perDay: 'Used per day',
    costPack: 'Cost per pack', orderAt: 'Order line', notSet: 'Not set',
    recent: 'Recent movements', noMovements: 'No movements yet.',
    today: 'Today', yesterday: 'Yesterday',
    usedBy: 'Used by {n} on your menu', usedByNone: 'Nothing on your menu uses this',
    usedByFix: 'Connect it',

    /* ---- item form ---- */
    nameEn: 'Name (English)', nameAr: 'Name (Arabic)',
    needName: 'Give the item a name first.',
    needPack: 'Say how big the pack is — nothing can be worked out without it.',
    startFrom: 'Start from something you buy',
    packA: 'The pack I buy is', packB: 'and costs', specCurrency: 'OMR',
    packAmountAria: 'Pack size', packUnitAria: 'Pack unit', packCostAria: 'Pack price',
    uKG: 'kg', uG: 'g', uL: 'L', uML: 'ml', uPIECE: 'pieces',
    specPerBase: '{c} per {u}', specCountedIn: 'stock is counted in {u}',
    specFillHint: 'Type the pack price straight off the invoice.',
    yield1: 'One pack makes about', yield2: 'servings.', yieldAria: 'Servings per pack',
    yieldPer: 'That is {q} {u} a serving', yieldCost: '{v} a serving',
    optional: 'Optional',
    yieldHint: 'Skip it if you are not sure — how many cups come out of one pack? Cup cost comes from this.',
    openA: 'And right now I have', openB: 'of them on the shelf.',
    openAria: 'Packs on the shelf right now',
    openHint: 'You can skip this — tonight’s count will ask. Fill it in and the shelf starts from a real number on day one.',
    openLands: 'That is {q} on the shelf', openNote: 'Opening count',
    /* The step that was missing. Owners filled a shelf in, watched the numbers sit still,
       and concluded the feature was broken — because the half that makes them move lived in
       a second tab nobody opened. It is asked here instead, while the ingredient is the
       thing they are thinking about. */
    usesQ: 'What on your menu uses it?',
    usesHint: 'Tap the drinks that use {name}. Each sale takes one serving off — you can set exact amounts later.',
    usesNeedYield: 'Fill in servings per pack above and you can connect it to your menu from here.',
    usesLinked: 'Connected to {n} on your menu',
    category: 'Category', categoryEg: 'Coffee, dairy, packaging…',
    save: 'Save', cancel: 'Cancel', archive: 'Archive item', archived: 'Archived',
    archiveWarn: 'It leaves your stock list. History and recipes keep working.',
    add: 'Add', saved: 'Saved',
    G: 'grams', ML: 'ml', PIECE: 'pieces',
    G1: 'gram', ML1: 'ml', PIECE1: 'piece',
    tagG: 'g', tagML: 'ml',

    /* ---- deliveries & waste ---- */
    quantity: 'Quantity', reason: 'Reason', note: 'Note', record: 'Record',
    addLine: 'Another item', packs: 'Packs', costPer: 'Cost per',
    enterInUnit: 'enter in {u} instead', enterInPacks: 'enter in packs instead', lands: 'lands on the shelf',
    SPILLED: 'Spilled', EXPIRED: 'Expired', STAFF_MEAL: 'Staff meal', COMP: 'Comped',
    TRAINING: 'Training', DAMAGED: 'Damaged', OTHER: 'Other',

    /* ---- the count: the walk, one item at a time ---- */
    cOf: '{a} of {b}',
    cLead: 'Walk the shelf and say what is there. One minute, and the rest looks after itself.',
    cPlenty: 'Plenty', cLowish: 'Getting low', cGone: 'Gone',
    cExact: 'Count it exactly', cExactHint: 'Enter the amount in {u}',
    cParQ: 'How much do you keep when this is fully stocked?', cParUnit: 'in {u}', cParSet: 'Set it',
    cSkip: 'Skip', cBack: 'Back', cFinish: 'Finish', cSaving: 'Saving…',
    cSaveErr: 'The count did not save. Try again.',
    cDone: 'Counted', cDoneCounted: 'items counted', cDoneOrder: 'to order',
    cDoneNone: 'Nothing needs ordering. The shelves are covered.',
    cDoneNothing: 'You skipped every item, so nothing changed.',
    cRest: 'Count the other {n}', cSeeOrder: 'See what to order', cClose: 'Close',
    cEmpty: 'Nothing to count yet',
    cEmptySub: 'Add what you buy first — after that, counting is the fastest way to bring stock up to date.',
    cNote: 'Shelf count', cNow: 'on record', cPar: 'Full shelf',
    cOrderNote: 'Getting low and Gone both put it on the order list.',

    /* ---- what the menu uses ---- */
    uTitle: 'What your drinks use',
    uNoMenu: 'Nothing on your menu yet.',
    uNoShelf: 'Nothing on the shelf yet.',
    uSearch: 'Search the menu',
    uNothing: 'Does not say what it takes', uLimit: 'Capped per day', uWired: 'Connected',
    uSold: '{n} sold in 30 days', uCost: '{v} to make', uPct: '{n}% of the price',
    uNil: 'Takes nothing off the shelf', uSet: 'Say what it takes',
    uUncounted: 'Uses something nobody has counted — the figure under it is a guess.',
    uHead: '{wired} of {total} say what they take.',
    uHeadNone: 'Nothing on your menu draws on the shelf, so the numbers never move by themselves.',

    /* ---- movement reasons ---- */
    items: 'items',
    RECEIVE: 'Delivery', SALE: 'Sale', WASTE: 'Waste', COUNT: 'Counted', TRANSFER_IN: 'Transfer in',
    TRANSFER_OUT: 'Transfer out', MANUAL: 'Correction', ORDER_RESTORE: 'Order returned',
    PREP_PRODUCE: 'Batch made', PREP_CONSUME: 'Batch inputs',
  },
};
