import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, upload, ApiError } from '../../lib/api';
import { useAuth, can } from '../../lib/auth';
import { useI18n, useT, nameOf, Ltr, ltrText, type Dict } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import {
  getLastPrintAttempt, subscribePrintAttempts, isPrintStation, setPrintStation, isPrinterVerified, setPrinterVerified,
  isAndroidDevice, RAWBT_PLAY_URL, STATION_APK_PATH, getPrintApp, setPrintApp, getPaperWidth, setPaperWidth,
  type PrintAttempt, type PrintApp,
} from '../../lib/printer';
import {
  cleanterHealth, cleanterReachable, describeCleanterFailure, describePrinterProblem, CLEANTER_PLAY_URL,
  type CleanterHealth, type CleanterResult, type PaperWidth,
} from '../../lib/cleanter';
import { parseReceiptSettings, RECEIPT_DEFAULTS, type ReceiptLanguage, type ReceiptSettings, type ReceiptStyle } from '../../lib/receiptSettings';
import { parseMenuInfo, serializeMenuInfo, DEFAULT_MENU_INFO, NOTE_MAX, type MenuInfo } from '../customer/menuInfo';
import { useReceiptPrinter } from './receiptPrinter';
import ReceiptSheet from './ReceiptSheet';
import { SettingsShell, PaneSection, Specimen, MiniQr } from './SettingsShell';
import { useFeatures } from '../../lib/plan';
import { FEATURES } from '../../lib/types';
import type { Restaurant, Subscription, BranchResponse, OrderResponse, StationStatus } from '../../lib/types';

/* This file used to render one long "Restaurant profile" page (hero + 4 numbered
 * sections + an aside). Settings now houses each section as its own pane, so the
 * sections below are exported individually and mounted one at a time by
 * SettingsPage.tsx — each wearing the shared SettingsShell (hero + sections +
 * a sticky aside holding a live specimen of what the pane produces). None of the
 * form/query/mutation logic changed in the split or the reskin. */

const DICT: Dict = {
  ar: {
    title: 'ملف المطعم', sub: 'البيانات التي تظهر في قائمة العملاء والفواتير.',
    detailsTitle: 'بيانات المطعم', detailsSub: 'معلومات التواصل والهوية التي يراها عملاؤك.',
    operationsTitle: 'الطلبات والضريبة', operationsSub: 'إعدادات التشغيل التي تؤثر على التحصيل والفواتير.',
    branchTitle: 'الفرع ورابط القائمة', branchSub: 'إدارة اسم الفرع الحالي وعنوان القائمة العامة.',
    vatHelp: 'أظهر ضريبة القيمة المضافة في الطلبات والفواتير.',
    menuLinkHelp: 'هذا هو الرابط العام الذي يفتحه عملاؤك.',
    name: 'اسم المطعم', nameAr: 'الاسم بالعربية', nameEn: 'الاسم بالإنجليزية',
    nameHint: 'يظهر الاسم بلغة الواجهة التي يستخدمها العميل. املأ اللغتين حتى لا تظهر العربية داخل صفحة إنجليزية.',
    phone: 'الهاتف', email: 'البريد', instagram: 'إنستجرام',
    houseTitle: 'بطاقة التعريف في القائمة', houseSub: 'سطر قصير بصوت المقهى يظهر أعلى القائمة، قبل الأقسام.',
    houseShow: 'إظهار البطاقة', houseShowSub: 'تظهر في كل تخطيطات القائمة. عند الإيقاف تبدأ القائمة بالأقسام مباشرة.',
    houseNoteAr: 'السطر بالعربية', houseNoteEn: 'السطر بالإنجليزية',
    housePlaceAr: 'نحمّص البن الحرازي منذ ٢٠١٩، وكل شيء يُحضّر عند الطلب.',
    housePlaceEn: 'Roasting Haraaz since 2019, everything pulled to order.',
    houseHint: 'كل لغة تظهر لقارئها فقط — السطر الفارغ لا يظهر أبداً بلغة أخرى.',
    houseFactsHint: 'الدوام والعنوان والهاتف وإنستجرام تُؤخذ تلقائياً مما أدخلته أعلاه ولا تُكتب هنا.',
    houseSaved: 'تم حفظ البطاقة', houseSave: 'حفظ البطاقة',
    houseWhereHint: 'مفتاح إظهار البطاقة في صفحة «شكل القائمة».',
    houseEditHint: 'نص البطاقة يُكتب في صفحة «المقهى».',
    currency: 'العملة', vatEnabled: 'تفعيل الضريبة', vatRate: 'نسبة الضريبة', logo: 'شعار المطعم',
    paymentSelection: 'اختيار طريقة الدفع عند التحصيل', paymentSelectionSub: 'عند التفعيل، يختار الموظف نقداً أو بطاقة قبل إنهاء الطلب. عند الإيقاف، تُسجّل البطاقة افتراضياً.',
    uploadLogo: 'رفع الشعار', removeLogo: 'إزالة الشعار', logoRemoved: 'تم إزالة الشعار', uploading: 'جارٍ الرفع...', save: 'حفظ الملف', saved: 'تم الحفظ', openMenu: 'فتح القائمة',
    slug: 'رابط القائمة', active: 'نشط',
    subscription: 'الاشتراك', plan: 'الباقة', sstatus: 'الحالة', renews: 'يتجدد', ended: 'انتهى',
    oneTime: 'دفع مرة واحدة', access: 'الوصول', lifetime: 'مدى الحياة',
    branchName: 'اسم الفرع', branchNameAr: 'اسم الفرع بالعربية', branchNameEn: 'اسم الفرع بالإنجليزية', saveBranch: 'حفظ', branchSaved: 'تم حفظ الفرع',
    printerEnabled: 'الطباعة التلقائية للفواتير', asideSetup: 'لم يطبع هذا الجهاز شيئاً بعد — امش على «تهيئة هذا الجهاز» في الأسفل.',
    testPrint: 'طباعة تجريبية', testPrintSent: 'أُرسلت الطباعة التجريبية',
    setupTitle: 'تهيئة هذا الجهاز',
    setupSub: 'الطباعة تُهيَّأ لكل جهاز على حدة — كل تابلت أو جوال يطبع يحتاج تطبيق طباعة خاصاً به وربطاً خاصاً به بالطابعة.',
    appPick: 'تطبيق الطباعة على هذا الجهاز',
    appStation: 'Serva Station', appRecommended: 'الأفضل: Serva Station — يطبع في الخلفية حتى والشاشة مطفأة، بلا تطبيقات خارجية.',
    offerTitle: 'هناك طريقة أفضل للطباعة',
    offerBody: 'Serva Station هو تطبيق Serva الخاص لتابلت الكاونتر. يطبع والشاشة مطفأة، ويعود وحده بعد انقطاع الكهرباء، ولا يحتاج أي تطبيق طباعة خارجي. ما تستخدمه الآن يبقى يعمل إن فضّلت عدم التغيير.',
    offerSwitch: 'حوّل هذا الجهاز إليه',
    appStationSub: 'تطبيق Serva Station على تابلت الكاونتر يطبع كل الفواتير. هذا الجهاز يرسل إليه فقط ولا يحتاج إلى أي تطبيق طباعة.',
    s1: 'حمّل Serva Station على تابلت الكاونتر',
    s1Body: 'تطبيق Serva الخاص للطباعة. يعمل في الخلفية، ويعود بنفسه بعد انقطاع الكهرباء، ويعرض إشعاراً دائماً يخبرك أنه يعمل.',
    s1Get: 'تحميل Serva Station', s1Qr: 'امسح هذا الرمز بتابلت الكاونتر لتحميل التطبيق عليه.',
    s1Unknown: 'لأنه لا يأتي من متجر Google، سيسألك أندرويد عند التثبيت هل تسمح بتثبيت التطبيقات من هذا المصدر. اختر السماح، مرة واحدة فقط.',
    s2: 'هيّئه من داخل التطبيق',
    s2Body: 'افتح التطبيق: سجّل الدخول بحساب موظف، اختر الفرع، ثم اضغط على الطابعة التي يجدها على شبكة WiFi — أو اختر طابعة Bluetooth مقترنة بالتابلت. ثم اطبع ورقة تجريبية. لا حاجة لكتابة أي عنوان.',
    s4: 'شاهده يستقبل الطباعة',
    s4Wait: 'بانتظار أن يبدأ التطبيق باستقبال الطباعة. يظهر هنا خلال ثوانٍ من إتمام التهيئة.',
    s4NeedsPrint: 'فعّل الطباعة التلقائية في الخطوة السابقة أولاً.',
    s4Ok: 'التطبيق يستقبل الطباعة. كل فاتورة من هذا الجهاز تُرسل إليه وتخرج من الطابعة.',
    tapeViaStation: 'يرسل للمحطة',
    appRawbtSub: 'RawBT يعمل مع طابعات WiFi وLAN وUSB وBluetooth، لكنه لا يخبر Serva هل خرجت الورقة.',
    appCleanterSub: 'Cleanter لطابعات Bluetooth فقط، ويرد على كل طباعة فيعرض Serva ما تفعله الطابعة.',
    appSwitched: 'تغيّر تطبيق الطباعة — اطبع تجربة من هذا الجهاز مجدداً.',
    paperPick: 'عرض الورق', paperSub: 'البكرة التي في طابعة Bluetooth. الطابعات المحمولة الرخيصة غالباً 58 مم.',
    paper80: '80 مم', paper58: '58 مم',
    c1Ok: 'هذا الجهاز أندرويد — ممتاز، Cleanter يعمل عليه.',
    c1Bad: 'Cleanter تطبيق أندرويد فقط، لذا هذا الجهاز (آيفون أو آيباد أو ماك أو ويندوز) لن يطبع أبداً. افتح لوحة التحكم على تابلت الأندرويد الذي عند الكاونتر وأكمل هذه الخطوات هناك. من هنا يبقى بإمكانك حفظ أي فاتورة كملف PDF من زر 🖨 في الطلب.',
    c2: 'ثبّت تطبيق Cleanter عليه',
    c2Body: 'Cleanter تطبيق مجاني يأخذ الفاتورة من Serva ويرسلها إلى طابعة Bluetooth الحرارية، ثم يخبرنا هل طُبعت. Serva يتحدث مع Cleanter فقط، ولا يتصل بالطابعة مباشرة.',
    c2Get: 'تحميل Cleanter من Google Play',
    c3: 'اربط الطابعة واخترها داخل Cleanter',
    c3Body: 'افتح إعدادات أندرويد ثم Bluetooth واربط طابعتك (الرمز غالباً 0000 أو 1234). ثم افتح Cleanter مرة واحدة واختر تلك الطابعة كطابعة افتراضية. بعدها يعمل من تلقاء نفسه حتى بعد إعادة التشغيل.',
    c3Note: 'Cleanter يعمل مع طابعات Bluetooth فقط. طابعة WiFi أو LAN تبقى على RawBT.',
    c4: 'اربط Serva بـ Cleanter',
    c4Body: 'اضغط «اتصال». سيسألك Chrome مرة واحدة هل يُسمح لـ Serva بالوصول إلى التطبيقات على هذا الجهاز — اختر السماح. بعدها لا تحتاج الطباعة إلى أي ضغطة.',
    c4Do: 'اتصال', c4Wait: 'بانتظار Chrome…', c4Again: 'تحقّق مجدداً',
    c4Ok: 'متصل — الطابعة مربوطة وتستجيب.',
    c4NoPrinter: 'Cleanter يعمل، لكن لا توجد طابعة تستجيب.',
    c6Body: 'يرسل طلباً وهمياً إلى الطابعة عبر Cleanter — نفس المسار الذي تسلكه الفاتورة الحقيقية. Cleanter يرد بالنتيجة، فلا تخمين.',
    c6Ok: 'أكّد Cleanter طباعة الفاتورة التجريبية — هذا الجهاز جاهز.',
    c6Wait: 'أكمل الاتصال في الخطوة 4 أولاً.',
    c6NoPaper: 'قال Cleanter إنها طُبعت ولم يخرج شيء؟ تأكد أن البكرة في اتجاهها الصحيح — الورق الحراري يطبع من وجه واحد فقط.',
    tapeApp: 'التطبيق', tapeBt: 'طابعة Bluetooth', tapeConnected: 'متصلة', tapeOffline: 'غير متصلة', tapeUnknown: 'غير معروفة',
    tapeQueued: 'في الطابور', tapeFailed: 'فشلت',
    g1: 'استخدم تابلت أو جوال أندرويد',
    g1Ok: 'هذا الجهاز أندرويد — ممتاز، RawBT يعمل عليه.',
    g1Bad: 'RawBT تطبيق أندرويد فقط، لذا هذا الجهاز (آيفون أو آيباد أو ماك أو ويندوز) لن يطبع أبداً. افتح لوحة التحكم على تابلت الأندرويد الذي عند الكاونتر وأكمل هذه الخطوات هناك. من هنا يبقى بإمكانك حفظ أي فاتورة كملف PDF من زر 🖨 في الطلب.',
    g2: 'ثبّت تطبيق RawBT عليه',
    g2Body: 'RawBT تطبيق مجاني ينقل الفاتورة من Serva إلى الطابعة الحرارية. Serva يتحدث مع RawBT فقط، ولا يتصل بالطابعة مباشرة.',
    g2Get: 'تحميل RawBT من Google Play',
    g2Qr: 'امسح هذا الرمز بجهاز الأندرويد لفتح صفحة التطبيق عليه.',
    g3: 'اربط RawBT بطابعتك',
    g3Body: 'افتح RawBT ثم الإعدادات ثم الطابعة. إن كانت طابعتك تعمل بـ Bluetooth فاختر Bluetooth ثم اخترها من القائمة. وإن كانت طابعة شبكة أو WiFi فاختر Network/WiFi واكتب عنوان IP الخاص بها مع المنفذ 9100. ثم اطبع صفحة الاختبار من داخل RawBT حتى تخرج ورقة، واتركها الطابعة الافتراضية.',
    g3Ip: 'لا تعرف عنوان IP للطابعة؟ الطابعة نفسها تخبرك به: أطفئها، ثم اضغط مطوّلاً على زر التغذية FEED وشغّلها وأنت ضاغط عليه. ستخرج ورقة مكتوب فيها عنوانها. اكتب الرقم في RawBT كما هو مطبوع تماماً.',
    g3Static: 'واطلب ممن أعدّ شبكة WiFi أن يحجز هذا العنوان للطابعة. فإن أعطاها الراوتر عنواناً آخر لاحقاً توقفت الطباعة دون أي رسالة، وهذا أكثر سبب يجعل طابعة كانت تعمل تتوقف فجأة.',
    g3Note: 'اربط كل جهاز موظفين بالطابعة نفسها — الجهاز الذي ينهي الطلب هو الذي يطبعه.',
    g4: 'فعّل الطباعة التلقائية للفرع',
    g4Ok: 'الطباعة التلقائية مفعّلة في هذا الفرع.',
    g4Off: 'الطباعة التلقائية متوقفة، فلا شيء يُطبع من تلقاء نفسه. يبقى بإمكان الموظفين طباعة أي طلب يدوياً بزر 🖨.',
    g4Do: 'فعّلها الآن',
    g5: 'اطبع فاتورة تجريبية',
    g5Body: 'يرسل طلباً وهمياً إلى الطابعة عبر RawBT — نفس المسار الذي تسلكه الفاتورة الحقيقية.',
    g5Ask: 'هل خرجت الفاتورة من الطابعة؟',
    g5Yes: 'نعم، طُبعت', g5No: 'لم يخرج شيء',
    g5Ok: 'طبع هذا الجهاز فاتورة تجريبية بنجاح — إنه جاهز.',
    g5Again: 'اطبع تجربة أخرى',
    fixTitle: 'لم تخرج ورقة؟ امش على هذه القائمة بالترتيب:',
    fix1: 'لم يحدث شيء إطلاقاً — تطبيق RawBT غير مثبّت على هذا الجهاز. ارجع إلى الخطوة 2.',
    fix2: 'فُتح RawBT لكنه اشتكى — لا توجد طابعة مربوطة بداخله. ارجع إلى الخطوة 3 واطبع صفحة اختبار RawBT أولاً.',
    fix3: 'الطابعة مطفأة أو بلا ورق أو البكرة مقلوبة — الورق الحراري يطبع من وجه واحد فقط.',
    fix4: 'تطبع من تابلت ولا تطبع من آخر — كل جهاز يحتاج تثبيتاً وربطاً خاصاً به، وهذه الخطوات تُعاد عليه.',
    scopeBranch: 'الفرع كله', scopeDevice: 'هذا الجهاز فقط',
    tapeDevice: 'هذا الجهاز', tapeReady: 'جاهز', tapeUnset: 'غير مهيّأ',
    lastSent: 'آخر إرسال للطابعة', buildLabel: 'إصدار التطبيق',
    receiptTitle: 'تخصيص الفاتورة', receiptSub: 'أضف لمستك على الفاتورة المطبوعة — الشكل، الشعار، ورسالتك الخاصة.',
    rcptStyle: 'شكل الفاتورة', rcptClassic: 'كلاسيكي', rcptMinimal: 'بسيط', rcptBold: 'جريء',
    rcptRetro: 'ريترو', rcptFancy: 'فاخر', rcptTicket: 'تذكرة',
    rcptShowLogo: 'إظهار الشعار أعلى الفاتورة', rcptNoLogo: 'ارفع شعاراً أولاً من أعلى الصفحة.',
    rcptShowPhone: 'إظهار رقم الهاتف', rcptNoPhone: 'أضف رقم الهاتف أولاً في بيانات المطعم.',
    rcptFooter: 'رسالة أسفل الفاتورة', rcptFooterPh: 'مثال: تابعونا على إنستجرام @cafe · واي فاي: guest123',
    rcptVatNo: 'الرقم الضريبي (VAT)', rcptCrNo: 'السجل التجاري (CR)',
    rcptSave: 'حفظ الفاتورة', rcptSaved: 'تم حفظ إعدادات الفاتورة', rcptPreview: 'معاينة حية',
    st_PENDING_PAYMENT: 'بانتظار الدفع', st_TRIAL: 'تجريبي', st_ACTIVE: 'نشط',
    st_PAST_DUE: 'متأخر', st_CANCELLED: 'ملغى', st_EXPIRED: 'منتهي',

    /* where each pane's settings show up */
    sfc_cafe: 'قائمة العملاء والفواتير', sfc_branch: 'هذا الفرع', sfc_receipt: 'الفاتورة المطبوعة', sfc_billing: 'الاشتراك',
    /* café pane */
    tentLabel: 'على الطاولة', tentCall: 'امسح لفتح القائمة',
    tentNote: 'هذا ما يمسحه عملاؤك. يتبع شعارك واسمك تلقائياً.',
    copyLink: 'نسخ الرابط', linkCopied: 'تم نسخ الرابط',
    menuOff: 'قائمتك موقوفة — الرابط لا يفتح للعملاء. تواصل مع Serva لإعادة تفعيلها.',
    /* branch pane */
    branchPaneSub: 'الاسم الذي يراه فريقك، والرابط الذي يفتحه عملاؤك، والطابعة التي يطبع منها هذا الفرع.',
    printTitle: 'الطباعة', printSub: 'تُطبع الفاتورة من الجهاز الذي أنهى الطلب.',
    printerShort: 'اطبع الفاتورة تلقائياً عند إنهاء الطلب.',
    printStationNoStorage: 'لم يُحفظ الإعداد: المتصفح يمنع تخزين البيانات على هذا الجهاز (نافذة خاصة؟).',
    printStationSubPlain: 'الآيباد والكمبيوتر لا يستطيعان الطباعة أبداً، فيرسلان الفاتورة إلى هذا الجهاز ليطبعها. فعّل هذا على جهاز واحد فقط بجانب الطابعة؛ والجهاز الثاني يعني نسختين.',
    printStationPlain: 'هذا الجهاز يطبع نيابةً عن الأجهزة الأخرى',
    printStationNoAndroid: 'الجهاز الذي يجمع الطباعة يجب أن يكون أندرويد — هذا الجهاز لا يطبع أبداً.',
    tapeStation: 'جهاز الطباعة', tapeCollecting: 'يستقبل', tapeNoStation: 'لا أحد يستقبل', tapeWaiting: 'بانتظار الطباعة',
    tapeManyStations: 'أكثر من جهاز',
    manyStationsNote: 'أكثر من جهاز يستقبل الطباعة في هذا الفرع. لن تُطبع التذكرة مرتين — كل تذكرة تذهب إلى جهاز واحد — لكن أبقِ المفتاح مفعّلاً على جهاز الكاونتر وحده حتى تخرج الورقة حيث تتوقعها.',
    appCollectingNote: 'تطبيق Serva Station يطبع لهذا الفرع. هذا المتصفح لن يسحب التذاكر — لا حاجة لإطفاء أي مفتاح.',
    printStation: 'هذا الجهاز يطبع التذاكر الواردة', printStationSub: 'في وضع الكاونتر تُطبع التذكرة لحظة وصول الطلب — من رمز QR أو من شاشة الطلب الجديد — ليبدأ المطبخ منها، وعليها «مدفوع» أو «غير مدفوع». فعّل هذا على جهاز الكاونتر فقط؛ الجهاز الثاني يعني نسختين.',
    counterMode: 'وضع الكاونتر', counterShort: 'للمقاهي السريعة: تُطبع التذكرة لحظة وصول الطلب ويعمل المطبخ عليها، ولا حاجة لقبول طلبات QR. الطلب المدفوع يظهر في «جاهز» مباشرة ويختفي وحده بعد قليل، وغير المدفوع ينتظر في «قيد التنفيذ» حتى تُحصّل ثمنه.',
    cycMonthly: 'شهري', cycYearly: 'سنوي',
    tapeLabel: 'حالة الطابعة', tapeOn: 'مُفعّلة', tapeOff: 'متوقّفة',
    tapePrinter: 'الطابعة', tapeLast: 'آخر إرسال', tapeBuild: 'الإصدار', tapeNone: 'لا يوجد',
    tapeIdle: 'لا طباعة من هذا الجهاز',
    branchOnly: 'ليس لديك صلاحية تعديل الفرع.',
    /* receipt pane */
    rcptStyleSub: 'ستة أشكال جاهزة — اختر واحداً وشاهد الفاتورة تتغيّر فوراً.',
    rcptLangTitle: 'لغة الفاتورة', rcptLangSub: 'ثنائية اللغة هي ما يُطبع اليوم ولا يتغيّر شيء إن تركتها. الإنجليزية فقط أبسط، وهي ما تطلبه أغلب المقاهي.',
    rcptLangBoth: 'عربي + إنجليزي', rcptLangEn: 'إنجليزي فقط',
    rcptContentTitle: 'ما يُطبع', rcptContentSub: 'الشعار، الهاتف، أرقامك النظامية، ورسالتك في الأسفل.',
    /* plan pane */
    planTitle: 'الباقة', planSub: 'ما تصل إليه اليوم، ومتى يتجدّد اشتراكك.',
    tier_STANDARD: 'قياسي', tier_PRO: 'Pro', tier_ENTERPRISE: 'Enterprise',
    inclTitle: 'ما تشمله باقتك', inclSub: 'الميزات المرتبطة باشتراكك — تُفتح فور الترقية.',
    incl_LOYALTY: 'بطاقة الأختام', incld_LOYALTY: 'ختم مع كل طلب ومكافأة عند اكتمال البطاقة.',
    incl_PRO_ANALYTICS: 'التحليلات المتقدّمة', incld_PRO_ANALYTICS: 'المسار، تحويل الأصناف، سلّة الشراء، الموظفون، التوقّع.',
    incl_FULL_HISTORY: 'كامل السجلّ', incld_FULL_HISTORY: 'الاستعلام عن أي مدى زمني بدل نافذة قصيرة.',
    incl_STOCK_INSIGHTS: 'رؤى المخزون', incld_STOCK_INSIGHTS: 'الفروقات والاستهلاك والتكلفة.',
    incl_MULTI_BRANCH: 'فروع متعدّدة', incld_MULTI_BRANCH: 'أكثر من فرع واحد تحت نفس الحساب.',
    incl_QR_CUSTOMIZATION: 'تخصيص رمز QR', incld_QR_CUSTOMIZATION: 'الشعار واللون والخط في وسط الرمز.',
    inclOn: 'متاحة', inclOff: 'غير متاحة',
    noSub: 'لا يوجد اشتراك مسجّل', noSubHint: 'تواصل مع Serva لتفعيل اشتراك لهذا المقهى.',
  },
  en: {
    title: 'Restaurant profile', sub: 'Details shown on the customer menu and receipts.',
    detailsTitle: 'Restaurant details', detailsSub: 'Customer-facing identity and contact information.',
    operationsTitle: 'Orders and tax', operationsSub: 'Operational settings that affect collection and receipts.',
    branchTitle: 'Branch and menu link', branchSub: 'Manage the current branch name and its public menu address.',
    vatHelp: 'Show VAT on customer orders and receipts.',
    menuLinkHelp: 'This is the public address your customers open.',
    name: 'Restaurant name', nameAr: 'Name in Arabic', nameEn: 'Name in English',
    nameHint: 'The name follows the language your customer is reading in. Fill both so an Arabic name never lands inside an English page.',
    phone: 'Phone', email: 'Email', instagram: 'Instagram',
    houseTitle: 'House card on the menu', houseSub: 'A short line in the cafe\u2019s own voice, shown above the categories.',
    houseShow: 'Show the card', houseShowSub: 'Appears in every menu layout. Off means the menu opens straight into the categories.',
    houseNoteAr: 'Line in Arabic', houseNoteEn: 'Line in English',
    housePlaceAr: 'نحمّص البن الحرازي منذ ٢٠١٩، وكل شيء يُحضّر عند الطلب.',
    housePlaceEn: 'Roasting Haraaz since 2019, everything pulled to order.',
    houseHint: 'Each language shows only to its own readers — a blank line is never shown in the other language.',
    houseFactsHint: 'Hours, area, phone and Instagram are pulled from what you entered above, not typed here.',
    houseSaved: 'House card saved', houseSave: 'Save card',
    houseWhereHint: 'The switch that shows or hides it is on the Menu look page.',
    houseEditHint: 'The words are written on the Café page.',
    currency: 'Currency', vatEnabled: 'Enable VAT', vatRate: 'VAT rate', logo: 'Restaurant logo',
    paymentSelection: 'Choose payment method at collection', paymentSelectionSub: 'When enabled, staff choose Cash or Card before completing an order. When off, Card is recorded by default.',
    uploadLogo: 'Upload logo', removeLogo: 'Remove logo', logoRemoved: 'Logo removed', uploading: 'Uploading...', save: 'Save profile', saved: 'Saved', openMenu: 'Open menu',
    slug: 'Menu link', active: 'Active',
    subscription: 'Subscription', plan: 'Plan', sstatus: 'Status', renews: 'Renews', ended: 'Ended',
    oneTime: 'One-time access', access: 'Access', lifetime: 'Lifetime',
    branchName: 'Branch name', branchNameAr: 'Branch name (Arabic)', branchNameEn: 'Branch name (English)', saveBranch: 'Save', branchSaved: 'Branch saved',
    printerEnabled: 'Auto-print receipts', asideSetup: 'This device has not printed anything yet — walk through “Set up this device” below.',
    testPrint: 'Test print', testPrintSent: 'Test print sent',
    setupTitle: 'Set up this device',
    setupSub: 'Printing is set up once per device — every tablet or phone that prints needs its own printing app and its own pairing to the printer.',
    appPick: 'Printing app on this device',
    appStation: 'Serva Station', appRecommended: 'Best: Serva Station — prints in the background with the screen off, no third-party app.',
    offerTitle: 'There is a better way to print',
    offerBody: 'Serva Station is Serva’s own app for the counter tablet. It prints with the screen off, comes back by itself after a power cut, and needs no third-party printing app. What you use now keeps working if you would rather not change.',
    offerSwitch: 'Switch this device to it',
    appStationSub: 'The Serva Station app on the counter tablet prints everything. This device only sends receipts to it and needs no printing app at all.',
    s1: 'Get Serva Station onto the counter tablet',
    s1Body: 'Serva’s own printing app. It runs in the background, comes back by itself after a power cut, and keeps a notification up so you can see it is alive.',
    s1Get: 'Download Serva Station', s1Qr: 'Scan this with the counter tablet to download the app there.',
    s1Unknown: 'Because it does not come from the Google store, Android will ask once whether to allow installing from this source. Choose allow. It only asks the first time.',
    s2: 'Set it up inside the app',
    s2Body: 'Open it: sign in with a staff account, pick the branch, then tap the printer it finds on the WiFi — or pick a Bluetooth printer already paired with the tablet. Then print a test slip. There is no address to type.',
    s4: 'Watch it collect',
    s4Wait: 'Waiting for the app to start collecting. It shows here within seconds of finishing setup.',
    s4NeedsPrint: 'Turn on auto-print in the step above first.',
    s4Ok: 'The app is collecting. Every receipt from this device goes to it and comes out of the printer.',
    tapeViaStation: 'Sends to station',
    appRawbtSub: 'RawBT works with WiFi, LAN, USB and Bluetooth printers, but cannot tell Serva whether paper came out.',
    appCleanterSub: 'Cleanter is for Bluetooth printers only, and answers every print, so Serva can show what the printer is doing.',
    appSwitched: 'Printing app changed — print a test from this device again.',
    paperPick: 'Paper width', paperSub: 'The roll inside the Bluetooth printer. Cheap portable printers are usually 58 mm.',
    paper80: '80 mm', paper58: '58 mm',
    c1Ok: 'This device is Android — good, Cleanter runs here.',
    c1Bad: 'Cleanter is an Android app, so this device (iPhone, iPad, Mac or Windows) can never print. Open the dashboard on the Android tablet at the counter and follow these steps there. From here you can still save any receipt as a PDF from the order’s 🖨 button.',
    c2: 'Install the Cleanter app on it',
    c2Body: 'Cleanter is a free app that takes the receipt from Serva, sends it to a Bluetooth thermal printer, and reports back whether it printed. Serva talks to Cleanter, never to the printer directly.',
    c2Get: 'Get Cleanter on Google Play',
    c3: 'Pair the printer and pick it in Cleanter',
    c3Body: 'Open Android Settings → Bluetooth and pair your printer (the PIN is usually 0000 or 1234). Then open Cleanter once and choose that printer as the default. From then on it starts by itself, even after a reboot.',
    c3Note: 'Cleanter drives Bluetooth printers only. A WiFi or LAN printer stays on RawBT.',
    c4: 'Connect Serva to Cleanter',
    c4Body: 'Tap Connect. Chrome asks once whether Serva may reach apps on this device — choose Allow. After that, printing needs no more taps.',
    c4Do: 'Connect', c4Wait: 'Waiting for Chrome…', c4Again: 'Check again',
    c4Ok: 'Connected — the printer is paired and answering.',
    c4NoPrinter: 'Cleanter is running, but no printer is answering.',
    c6Body: 'Sends a fake order to the printer through Cleanter — the same path a real receipt takes. Cleanter reports back, so no guessing.',
    c6Ok: 'Cleanter confirmed the test receipt printed — this device is ready.',
    c6Wait: 'Connect in step 4 first.',
    c6NoPaper: 'Cleanter said it printed but nothing came out? Check the roll is in the right way round — thermal paper prints on one side only.',
    tapeApp: 'App', tapeBt: 'Bluetooth printer', tapeConnected: 'Connected', tapeOffline: 'Offline', tapeUnknown: 'Unknown',
    tapeQueued: 'Queued', tapeFailed: 'Failed',
    g1: 'Use an Android tablet or phone',
    g1Ok: 'This device is Android — good, RawBT runs here.',
    g1Bad: 'RawBT is an Android app, so this device (iPhone, iPad, Mac or Windows) can never print. Open the dashboard on the Android tablet at the counter and follow these steps there. From here you can still save any receipt as a PDF from the order’s 🖨 button.',
    g2: 'Install the RawBT app on it',
    g2Body: 'RawBT is the free app that carries the receipt from Serva to your thermal printer. Serva talks to RawBT, never to the printer directly.',
    g2Get: 'Get RawBT on Google Play',
    g2Qr: 'Scan this with the Android device to open its app page there.',
    g3: 'Connect RawBT to your printer',
    g3Body: 'Open RawBT → Settings → Printer. If your printer is a Bluetooth one, pick Bluetooth and choose it from the list. If it is a network or WiFi printer, pick Network/WiFi and type its IP address with port 9100. Then print RawBT’s own test page until paper comes out, and leave it as the default printer.',
    g3Ip: 'Don’t know the printer’s IP address? The printer will tell you. Switch it off, hold its FEED button down, and switch it back on while still holding. It prints a slip with its own address on it. Type that number into RawBT exactly as printed.',
    g3Static: 'Then ask whoever set up your WiFi to reserve that address for the printer. If the router hands it a different one later, printing stops with no message at all, and that is the most common reason a printer that used to work suddenly doesn’t.',
    g3Note: 'Pair every staff device with the same printer — whichever device finishes an order is the one that prints it.',
    g4: 'Turn on auto-print for the branch',
    g4Ok: 'Auto-print is on for this branch.',
    g4Off: 'Auto-print is off, so nothing prints by itself. Staff can still print any order by hand with the 🖨 button.',
    g4Do: 'Turn it on',
    g5: 'Print a test receipt',
    g5Body: 'Sends a fake order to the printer through RawBT — the same path a real receipt takes.',
    g5Ask: 'Did the receipt come out of the printer?',
    g5Yes: 'Yes, it printed', g5No: 'Nothing came out',
    g5Ok: 'This device printed a test receipt — it is ready.',
    g5Again: 'Print another test',
    fixTitle: 'No paper? Work down this list in order:',
    fix1: 'Nothing happened at all — RawBT is not installed on this device. Go back to step 2.',
    fix2: 'RawBT opened but complained — no printer is paired inside it. Go back to step 3 and print RawBT’s own test page first.',
    fix3: 'The printer is off, out of paper, or the roll is in upside-down — thermal paper only prints on one side.',
    fix4: 'It prints from one tablet but not another — each device needs its own install and pairing, so repeat these steps on it.',
    scopeBranch: 'Whole branch', scopeDevice: 'This device only',
    tapeDevice: 'This device', tapeReady: 'Ready', tapeUnset: 'Not set up',
    lastSent: 'Last sent to printer', buildLabel: 'App build',
    receiptTitle: 'Receipt customization', receiptSub: 'Add your touch to the printed receipt — style, logo, and your own message.',
    rcptStyle: 'Receipt style', rcptClassic: 'Classic', rcptMinimal: 'Minimal', rcptBold: 'Bold',
    rcptRetro: 'Retro', rcptFancy: 'Fancy', rcptTicket: 'Ticket',
    rcptShowLogo: 'Show logo at the top', rcptNoLogo: 'Upload a logo first (top of this page).',
    rcptShowPhone: 'Show phone number', rcptNoPhone: 'Add a phone number first (restaurant details).',
    rcptFooter: 'Footer message', rcptFooterPh: 'e.g. Follow us @cafe · WiFi: guest123',
    rcptVatNo: 'VAT number', rcptCrNo: 'CR number',
    rcptSave: 'Save receipt', rcptSaved: 'Receipt settings saved', rcptPreview: 'Live preview',
    st_PENDING_PAYMENT: 'Awaiting payment', st_TRIAL: 'Trial', st_ACTIVE: 'Active',
    st_PAST_DUE: 'Past due', st_CANCELLED: 'Cancelled', st_EXPIRED: 'Expired',

    /* where each pane's settings show up */
    sfc_cafe: 'Customer menu · Receipts', sfc_branch: 'This branch', sfc_receipt: 'Printed receipt', sfc_billing: 'Subscription',
    /* café pane */
    tentLabel: 'On the table', tentCall: 'Scan for the menu',
    tentNote: 'This is what your customers scan. It follows your logo and name.',
    copyLink: 'Copy link', linkCopied: 'Link copied',
    menuOff: 'Your menu is switched off — this link will not open for customers. Talk to Serva to switch it back on.',
    /* branch pane */
    branchPaneSub: 'The name your staff see, the link your customers open, and the printer this branch prints from.',
    printTitle: 'Printing', printSub: 'Receipts print from whichever device completed the order.',
    printerShort: 'Print the receipt automatically when an order is completed.',
    printStationNoStorage: 'Not saved: this browser blocks site storage on this device (private window?).',
    printStationSubPlain: 'An iPad or a computer can never print, so they send the receipt to this device to print instead. Turn this on for one device next to the printer only; a second device means two copies.',
    printStationPlain: 'This device prints for the others',
    printStationNoAndroid: 'Only an Android device can collect prints — this one can never print.',
    tapeStation: 'Print station', tapeCollecting: 'Collecting', tapeNoStation: 'Nobody collecting', tapeWaiting: 'Waiting to print',
    tapeManyStations: 'More than one device',
    manyStationsNote: 'More than one device is collecting prints for this branch. Tickets will not print twice, each goes to one device, but keep the switch on the counter device only so paper comes out where you expect it.',
    appCollectingNote: 'The Serva Station app is printing for this branch. This browser will not collect tickets — you do not have to turn any switch off.',
    printStation: 'This device prints incoming tickets', printStationSub: 'In counter mode the ticket prints the moment an order arrives — from a QR code or the New order screen — so the kitchen starts from it, marked PAID or NOT PAID. Turn this on for the counter device only; a second device means two copies.',
    counterMode: 'Counter mode', counterShort: 'For quick-service cafés: the ticket prints the moment an order arrives and the kitchen works off it, and QR orders need no Accept. A paid order lands straight in Ready and leaves the board by itself after a while; an unpaid one waits in In progress until you collect.',
    cycMonthly: 'Monthly', cycYearly: 'Yearly',
    tapeLabel: 'Printer status', tapeOn: 'On', tapeOff: 'Off',
    tapePrinter: 'Printer', tapeLast: 'Last sent', tapeBuild: 'Build', tapeNone: 'None yet',
    tapeIdle: 'Nothing prints from this device',
    branchOnly: 'You do not have permission to edit this branch.',
    /* receipt pane */
    rcptStyleSub: 'Six ready-made looks — pick one and watch the sheet change.',
    rcptLangTitle: 'Receipt language', rcptLangSub: 'Bilingual is what prints today, and nothing changes if you leave it. English only is simpler, and what most cafés ask for.',
    rcptLangBoth: 'Arabic + English', rcptLangEn: 'English only',
    rcptContentTitle: 'What prints', rcptContentSub: 'Logo, phone, your registration numbers and a closing message.',
    /* plan pane */
    planTitle: 'Plan', planSub: 'What you can reach today, and when the subscription renews.',
    tier_STANDARD: 'Standard', tier_PRO: 'Pro', tier_ENTERPRISE: 'Enterprise',
    inclTitle: "What's included", inclSub: 'Features tied to your subscription — they unlock the moment you upgrade.',
    incl_LOYALTY: 'Stamp card', incld_LOYALTY: 'A stamp on every order and a reward when the card is full.',
    incl_PRO_ANALYTICS: 'Advanced analytics', incld_PRO_ANALYTICS: 'Funnel, item conversion, market basket, staff and forecast.',
    incl_FULL_HISTORY: 'Full history', incld_FULL_HISTORY: 'Query any date range instead of a recent window.',
    incl_STOCK_INSIGHTS: 'Stock insights', incld_STOCK_INSIGHTS: 'Variance, usage and costed views.',
    incl_MULTI_BRANCH: 'Multiple branches', incld_MULTI_BRANCH: 'More than one branch under the same account.',
    incl_QR_CUSTOMIZATION: 'QR customisation', incld_QR_CUSTOMIZATION: 'Centre logo, colour and font on the code.',
    inclOn: 'Included', inclOff: 'Not in this plan',
    noSub: 'No subscription on file', noSubHint: 'Talk to Serva to put this café on a plan.',
  },
};

/** Synthetic order for the "Test print" button and the receipt live preview — exercises the
 *  whole capture→RawBT→printer chain without a real order. Never sent to the backend.
 *  Realistic sample lines so the preview reads like an actual receipt. */
function makeTestOrder(restaurantId: number, branchId: number): OrderResponse {
  return {
    id: 0, orderNumber: 'TEST', dailyNumber: 12, trackingToken: '', restaurantId, branchId,
    tableId: null, customerName: 'Print test', orderType: 'DINE_IN', status: 'COMPLETED',
    paymentStatus: 'PAID', paymentMethod: 'CASH', subtotal: 4.4, vatAmount: 0.22, total: 4.62,
    items: [
      { nameEn: 'Cappuccino', nameAr: 'كابتشينو', quantity: 2, price: 1.3, lineTotal: 2.6 },
      { nameEn: 'Cheesecake', nameAr: 'تشيز كيك', quantity: 1, price: 1.8, lineTotal: 1.8 },
    ],
    createdAt: new Date().toISOString(),
  };
}

/* ============================ 01+02 · CAFÉ ============================
 * Identity hero (logo, name, active badge) + contact details + VAT/payment
 * operations. These two used to be sections 01/02 of the old profile page —
 * they share one form and one Save button, so they stay paired as the
 * "Café" settings pane. */
export function CafeSection({ branchId }: { branchId?: number }) {
  const { user } = useAuth();
  const rid = user!.restaurantId!;
  const t = useT(DICT);
  const toast = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { lang } = useI18n();
  const [form, setForm] = useState({
    nameAr: '',
    nameEn: '',
    logoUrl: '',
    phone: '',
    email: '',
    instagramUrl: '',
    currency: 'OMR',
    vatEnabled: true,
    vatRate: '5',
    paymentMethodSelectionEnabled: false,
  });

  const restaurantQ = useQuery({
    queryKey: ['restaurant', rid],
    queryFn: () => api.get<Restaurant>(`/api/restaurants/${rid}`),
  });

  useEffect(() => {
    const r = restaurantQ.data;
    if (!r) return;
    setForm({
      nameAr: r.nameAr ?? '',
      nameEn: r.nameEn ?? '',
      logoUrl: r.logoUrl ?? '',
      phone: r.phone ?? '',
      email: r.email ?? '',
      instagramUrl: r.instagramUrl ?? '',
      currency: r.currency ?? 'OMR',
      vatEnabled: r.vatEnabled,
      vatRate: String(r.vatRate ?? 5),
      paymentMethodSelectionEnabled: r.paymentMethodSelectionEnabled ?? false,
    });
  }, [restaurantQ.data?.id]);

  // What the hero, the logo initial and the tent card show: this owner's own UI language,
  // falling back to the other rather than going blank while one side is still empty.
  const shownName = nameOf({ nameAr: form.nameAr, nameEn: form.nameEn }, lang);

  const save = useMutation({
    mutationFn: () => api.patch<Restaurant>(`/api/restaurants/${rid}`, {
      // "" clears one side of the pair; the server refuses to clear both.
      nameAr: form.nameAr.trim(),
      nameEn: form.nameEn.trim(),
      // Empty string clears the logo server-side; omit only when we intentionally leave it alone.
      logoUrl: form.logoUrl.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      instagramUrl: form.instagramUrl.trim() || null,
      currency: form.currency.trim().toUpperCase() || 'OMR',
      vatEnabled: form.vatEnabled,
      vatRate: Number(form.vatRate) || 0,
      paymentMethodSelectionEnabled: form.paymentMethodSelectionEnabled,
    }),
    onSuccess: (r) => {
      qc.setQueryData(['restaurant', rid], r);
      toast(t('saved'));
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });

  const removeLogo = useMutation({
    // PATCH: blank logoUrl clears; other fields omitted = unchanged.
    mutationFn: () => api.patch<Restaurant>(`/api/restaurants/${rid}`, { logoUrl: '' }),
    onSuccess: (r) => {
      qc.setQueryData(['restaurant', rid], r);
      setForm((p) => ({ ...p, logoUrl: '' }));
      toast(t('logoRemoved'));
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });

  async function onLogoFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await upload('/api/uploads/restaurants/logo', file);
      // Persist immediately so the logo sticks without a second "Save profile" click.
      const r = await api.patch<Restaurant>(`/api/restaurants/${rid}`, { logoUrl: url });
      qc.setQueryData(['restaurant', rid], r);
      setForm((p) => ({ ...p, logoUrl: r.logoUrl ?? url }));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const set = (key: keyof typeof form, value: string | boolean) => setForm((p) => ({ ...p, [key]: value }));
  const publicUrl = restaurantQ.data ? `/r/${restaurantQ.data.slug}${branchId != null ? `/b/${branchId}` : ''}` : null;
  const scanUrl = publicUrl ? window.location.origin + publicUrl : null;

  return (
    <SettingsShell
      bareMark
      mark={
        <>
          <button className="profile-logo" type="button" aria-label={t('uploadLogo')}
            onClick={() => fileRef.current?.click()}
            style={form.logoUrl ? { backgroundImage: `url('${form.logoUrl}')` } : undefined}>
            {!form.logoUrl && <span>{shownName.charAt(0) || 'S'}</span>}
            <i>{t('uploadLogo')}</i>
            {uploading && <em>{t('uploading')}</em>}
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onLogoFile} />
        </>
      }
      surface={t('sfc_cafe')}
      title={shownName || t('title')}
      sub={t('sub')}
      actions={
        <>
          <button className="btn sm ghost" type="button" onClick={() => fileRef.current?.click()} disabled={uploading || removeLogo.isPending}>{t('uploadLogo')}</button>
          {form.logoUrl && (
            <button className="btn sm danger" type="button"
              disabled={uploading || removeLogo.isPending}
              onClick={() => removeLogo.mutate()}>{t('removeLogo')}</button>
          )}
          <button className="btn sm" type="button" disabled={!shownName.trim() || save.isPending || uploading || removeLogo.isPending}
            onClick={() => save.mutate()}>{t('save')}</button>
        </>
      }
      aside={
        <Specimen label={t('tentLabel')}>
          <div className="stg-tent">
            <span className="stg-tent-logo"
              style={form.logoUrl ? { backgroundImage: `url('${form.logoUrl}')` } : undefined}>
              {!form.logoUrl && (shownName.charAt(0) || 'S')}
            </span>
            <span className="stg-tent-name">{shownName || t('title')}</span>
            {scanUrl && <MiniQr value={scanUrl} />}
            <span className="stg-tent-call">{t('tentCall')}</span>
            <span className="stg-tent-url">{publicUrl ?? '—'}</span>
          </div>
          <div className="stg-spec-actions">
            <button className="btn sm ghost" type="button" disabled={!publicUrl}
              onClick={() => publicUrl && window.open(publicUrl, '_blank', 'noopener,noreferrer')}>↗ {t('openMenu')}</button>
            <button className="btn sm ghost" type="button" disabled={!scanUrl}
              onClick={() => { if (scanUrl) { navigator.clipboard?.writeText(scanUrl); toast(t('linkCopied')); } }}>{t('copyLink')}</button>
          </div>
          <p className="stg-spec-note">
            {restaurantQ.data && !restaurantQ.data.active ? <b>{t('menuOff')}</b> : t('tentNote')}
          </p>
        </Specimen>
      }
    >
      <PaneSection no="01" title={t('detailsTitle')} sub={t('detailsSub')}>
        <div className="profile-fields">
          <label className="field"><span>{t('nameAr')}</span>
            <input value={form.nameAr} lang="ar" dir="rtl" onChange={(e) => set('nameAr', e.target.value)} /></label>
          <label className="field"><span>{t('nameEn')}</span>
            <input value={form.nameEn} lang="en" dir="ltr" onChange={(e) => set('nameEn', e.target.value)} /></label>
          <label className="field"><span>{t('phone')}</span><input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></label>
          <label className="field"><span>{t('email')}</span><input value={form.email} onChange={(e) => set('email', e.target.value)} /></label>
          <label className="field"><span>{t('instagram')}</span><input value={form.instagramUrl} onChange={(e) => set('instagramUrl', e.target.value)} /></label>
          <label className="field profile-currency"><span>{t('currency')}</span><input value={form.currency} maxLength={3} onChange={(e) => set('currency', e.target.value.toUpperCase())} /></label>
        </div>
        <small className="loy-hint">{t('nameHint')}</small>
      </PaneSection>

      <PaneSection no="02" title={t('operationsTitle')} sub={t('operationsSub')}>
        <div className="profile-settings">
          <div className="profile-setting">
            <div><b>{t('vatEnabled')}</b><span>{t('vatHelp')}</span></div>
            <button type="button" className={'switch' + (form.vatEnabled ? ' on' : '')}
              role="switch" aria-checked={form.vatEnabled} aria-label={t('vatEnabled')}
              onClick={() => set('vatEnabled', !form.vatEnabled)}><span /></button>
          </div>
          <label className={'field profile-vat-rate' + (!form.vatEnabled ? ' disabled' : '')}>
            <span>{t('vatRate')}</span>
            <div className="profile-number-input"><input className="num" type="number" min="0" max="100" step="0.1"
              disabled={!form.vatEnabled} value={form.vatRate} onChange={(e) => set('vatRate', e.target.value)} /><i>%</i></div>
          </label>
          <div className="profile-setting profile-payment-setting">
            <div><b>{t('paymentSelection')}</b><span>{t('paymentSelectionSub')}</span></div>
            <button type="button" className={'switch' + (form.paymentMethodSelectionEnabled ? ' on' : '')}
              role="switch" aria-checked={form.paymentMethodSelectionEnabled} aria-label={t('paymentSelection')}
              onClick={() => set('paymentMethodSelectionEnabled', !form.paymentMethodSelectionEnabled)}><span /></button>
          </div>
        </div>
      </PaneSection>

      <HouseCardSection />

    </SettingsShell>
  );
}

/* ============================ HOUSE CARD ============================ */
/**
 * The café in its own words, shown above the categories on the customer's menu.
 *
 * Split in two on purpose. The WORDS are a fact about the café, like its name and its
 * phone number, so they are edited here in the Café pane. Whether the card SHOWS is a
 * decision about the menu page, so that switch lives on Menu look, next to the rest of
 * what the page does — see HouseCardToggle. Putting a bilingual copywriting box in the
 * middle of a colour editor was the thing that read as out of place, and it was: nobody
 * goes to a theme screen to write about their café.
 *
 * Both halves save through the same menu-info endpoint and both send the whole document,
 * so neither can drop what the other wrote.
 */
function useHouseCard() {
  const { user } = useAuth();
  const rid = user!.restaurantId!;
  const t = useT(DICT);
  const toast = useToast();
  const qc = useQueryClient();
  const restaurantQ = useQuery({
    queryKey: ['restaurant', rid],
    queryFn: () => api.get<Restaurant>(`/api/restaurants/${rid}`),
  });

  const [house, setHouse] = useState<MenuInfo>(DEFAULT_MENU_INFO);
  useEffect(() => {
    if (!restaurantQ.data) return;
    setHouse(parseMenuInfo(restaurantQ.data.menuInfoJson));
  }, [restaurantQ.data?.id, restaurantQ.data?.menuInfoJson]); // eslint-disable-line
  const save = useMutation({
    mutationFn: (next: MenuInfo) => api.patch<Restaurant>(`/api/restaurants/${rid}/menu-info`,
      { menuInfoJson: serializeMenuInfo(next) }),
    onSuccess: (r) => {
      qc.setQueryData(['restaurant', rid], r);
      toast(t('houseSaved'));
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });
  return { house, setHouse, save, loaded: !!restaurantQ.data };
}

/** The words. Lives in the Café pane, beside the name and the contact details. */
export function HouseCardSection() {
  const t = useT(DICT);
  const { house, setHouse, save } = useHouseCard();

  return (
    <PaneSection no="03" title={t('houseTitle')} sub={t('houseSub')}>
      <div className="profile-fields">
        <label className="field"><span>{t('houseNoteAr')}</span>
          <textarea rows={3} lang="ar" dir="rtl" maxLength={NOTE_MAX} value={house.noteAr}
            placeholder={t('housePlaceAr')}
            onChange={(e) => setHouse((h) => ({ ...h, noteAr: e.target.value }))} /></label>
        <label className="field"><span>{t('houseNoteEn')}</span>
          <textarea rows={3} lang="en" dir="ltr" maxLength={NOTE_MAX} value={house.noteEn}
            placeholder={t('housePlaceEn')}
            onChange={(e) => setHouse((h) => ({ ...h, noteEn: e.target.value }))} /></label>
      </div>
      <small className="loy-hint">{t('houseHint')}</small>
      <small className="loy-hint">{t('houseFactsHint')}</small>
      <small className="loy-hint">{t('houseWhereHint')}</small>
      <button className="btn" style={{ marginTop: 14 }} disabled={save.isPending}
        onClick={() => save.mutate(house)}>{t('houseSave')}</button>
    </PaneSection>
  );
}

/**
 * The switch. Lives on Menu look as one more control block, and writes straight through:
 * a lone toggle with its own Save button next to the theme's Save button would be two
 * save buttons on one screen, each meaning something different.
 */
export function HouseCardToggle() {
  const t = useT(DICT);
  const { house, setHouse, save, loaded } = useHouseCard();
  const flip = () => {
    const next = { ...house, show: !house.show };
    setHouse(next);
    save.mutate(next);
  };

  return (
    <div className="look-control-block">
      <div className="look-control-title">{t('houseTitle')}</div>
      {/* the row on its own, not inside .profile-settings: that wrapper is a two-column
          grid built for the VAT switch + rate pair, and a lone switch in it would sit
          against a 150px hole where the second field belongs. */}
      <div className="profile-setting">
        <div><b>{t('houseShow')}</b><span>{t('houseShowSub')}</span></div>
        <button type="button" className={'switch' + (house.show ? ' on' : '')}
          role="switch" aria-checked={house.show} aria-label={t('houseShow')}
          disabled={!loaded || save.isPending} onClick={flip}><span /></button>
      </div>
      <p className="look-note">{t('houseEditHint')}</p>
    </div>
  );
}

/* ============================ 03 · BRANCH & PRINTER ============================ */
/** One step of the printer setup guide. `state` is the step's real state, not decoration:
 *  `ok` is something we can actually observe (this device is Android, auto-print is on, a
 *  test print was confirmed), `bad` is a known blocker, `todo` is everything we cannot see
 *  from the browser and must simply ask the owner to do. */
function GuideStep({ no, state, title, children }: {
  no: number; state: 'ok' | 'todo' | 'bad'; title: string; children: ReactNode;
}) {
  return (
    <li className={'stg-step ' + state}>
      <span className="stg-step-no" aria-hidden="true">{state === 'ok' ? '✓' : state === 'bad' ? '!' : no}</span>
      <div className="stg-step-body"><b>{title}</b>{children}</div>
    </li>
  );
}

export function BranchPrinterSection({ branchId }: { branchId?: number }) {
  const { user } = useAuth();
  const rid = user!.restaurantId!;
  const t = useT(DICT);
  const toast = useToast();
  const qc = useQueryClient();
  const printReceipt = useReceiptPrinter();
  const { lang } = useI18n();
  const [bNameAr, setBNameAr] = useState('');
  const [bNameEn, setBNameEn] = useState('');

  const restaurantQ = useQuery({
    queryKey: ['restaurant', rid],
    queryFn: () => api.get<Restaurant>(`/api/restaurants/${rid}`),
  });

  // Shares the cache key the dashboard shell uses, so a rename reflects everywhere.
  const branchesQ = useQuery({
    queryKey: ['branches', rid],
    queryFn: () => api.get<BranchResponse[]>(`/api/restaurants/${rid}/branches`),
  });
  const branch = branchesQ.data?.find((b) => b.id === branchId) ?? branchesQ.data?.[0];
  useEffect(() => {
    if (!branch) return;
    setBNameAr(branch.nameAr ?? '');
    setBNameEn(branch.nameEn ?? '');
  }, [branch?.id]); // eslint-disable-line
  const shownBranchName = nameOf(branch, lang);
  const branchNameDirty = !!branch
    && (bNameAr.trim() !== (branch.nameAr ?? '') || bNameEn.trim() !== (branch.nameEn ?? ''));

  const printingOn = !!branch?.printerEnabled;
  // Is any device collecting this branch's print jobs? The one failure the queue cannot
  // fix is nobody polling it — jobs then sit until they expire, in silence. This is where
  // that silence becomes visible. It does not touch the job list itself, so a settings page
  // left open never counts as a station.
  const stationQ = useQuery({
    queryKey: ['print-station', branch?.id],
    queryFn: () => api.get<StationStatus>(`/api/dashboard/print-jobs/station?branchId=${branch!.id}`),
    enabled: printingOn && !!branch,
    refetchInterval: 5_000,
  });

  /* Everything below is device-local (see lib/printer.ts): which app carries the receipt
     off this tablet, which tablet prints arriving tickets in counter mode, and whether this
     one has ever put paper through the printer. With RawBT the browser sees nothing past
     the handoff, so the guide marks only what it can observe — the platform and the branch
     toggle — and asks the owner for the one fact only paper can answer. With Cleanter the
     bridge answers, so the guide shows the printer's real state instead. */
  const android = useMemo(isAndroidDevice, []);
  const [app, setApp] = useState<PrintApp>(getPrintApp);
  const [paper, setPaper] = useState<PaperWidth>(getPaperWidth);
  const [station, setStation] = useState(false);
  const [verified, setVerified] = useState(false);
  const [probe, setProbe] = useState<'idle' | 'asking' | 'failed'>('idle');
  useEffect(() => {
    setStation(isPrintStation(branch?.id));
    setVerified(isPrinterVerified(branch?.id));
    setProbe('idle');
  }, [branch?.id]);

  // Last handoff — the moment it happens, so a "Test print" tap visibly registers on a
  // tablet with no devtools, and Cleanter's verdict lands in the guide as it arrives. Not
  // gated on printingOn: the setup guide's test print is exactly what you reach for BEFORE
  // turning the branch on.
  const [lastAttempt, setLastAttempt] = useState<PrintAttempt | null>(getLastPrintAttempt);
  useEffect(() => subscribePrintAttempts((attempt) => {
    setLastAttempt(attempt);
    // ReceiptCapture already stored the flag; this only refreshes the mark in view.
    if (attempt.app === 'cleanter' && attempt.ok) setVerified(true);
  }), []);

  /* Cleanter's own state, straight from the bridge. Polled only once this site may reach
     it without a tap (see cleanterReachable): a probe made before that would be refused
     silently and poison Chrome's permission, so the first contact is always the Connect
     button below. */
  const [health, setHealth] = useState<CleanterResult<CleanterHealth> | null>(null);
  const [connecting, setConnecting] = useState(false);
  // Whether a print may be attempted right now — the Test print button waits for this.
  const [cleanterCanPrint, setCleanterCanPrint] = useState(false);
  useEffect(() => {
    if (app !== 'cleanter') { setHealth(null); return; }
    let stopped = false;
    const tick = async () => {
      const reachable = await cleanterReachable();
      if (stopped) return;
      setCleanterCanPrint(reachable);
      if (!reachable) return;
      const result = await cleanterHealth({ gesture: false });
      if (!stopped) setHealth(result);
    };
    tick();
    const interval = window.setInterval(tick, 5_000);
    return () => { stopped = true; window.clearInterval(interval); };
  }, [app]);
  const connect = async () => {
    setConnecting(true);
    const result = await cleanterHealth({ gesture: true });
    const reachable = await cleanterReachable();
    setHealth(result);
    setCleanterCanPrint(reachable);
    setConnecting(false);
  };
  // Whether the Serva Station app is polling this branch — the one observable fact in its
  // setup, read from the same liveness the watchdog uses.
  const stationCollecting = !!stationQ.data?.collecting;
  const appCollecting = !!stationQ.data?.appCollecting;
  useEffect(() => {
    if (!branch || !appCollecting || !station) return;
    setPrintStation(branch.id, false);
    setStation(false);
  }, [branch?.id, appCollecting, station]);
  const cleanterPrinter = health?.ok ? health.printer : null;
  const cleanterReady = !!cleanterPrinter?.connected;
  const lastCleanterFailure = lastAttempt?.app === 'cleanter' && lastAttempt.ok === false ? lastAttempt : null;

  // Read the flag back after writing: in a private window or with site data blocked the
  // write is dropped, and the switch must show that rather than a green lie.
  const toggleStation = () => {
    if (!branch) return;
    setPrintStation(branch.id, !station);
    const stuck = isPrintStation(branch.id);
    setStation(stuck);
    if (stuck !== !station) toast(t('printStationNoStorage'));
  };
  // Switching apps changes the whole path the receipt takes, so the device's "ready" mark
  // is earned again through the new one.
  const chooseApp = (next: PrintApp) => {
    if (next === app) return;
    setPrintApp(next);
    const stuck = getPrintApp();
    setApp(stuck);
    if (stuck !== next) { toast(t('printStationNoStorage')); return; }
    if (branch) { setPrinterVerified(branch.id, false); setVerified(false); }
    // This browser is no longer the printer — the app is. Drop the old collector flag so
    // the tab does not keep pulling jobs beside the app.
    if (next === 'station' && branch) {
      setPrintStation(branch.id, false);
      setStation(false);
    }
    setProbe('idle');
    toast(t('appSwitched'));
  };
  const choosePaper = (next: PaperWidth) => {
    setPaperWidth(next);
    setPaper(getPaperWidth());
  };
  const runTestPrint = () => {
    if (!branch) return;
    // local: this is testing THIS tablet's chain, so it must never be handed to the station
    // — the fake order does not exist server-side and the station is not what is on trial.
    printReceipt(makeTestOrder(rid, branch.id), 'printer', { local: true });
    toast(t('testPrintSent'));
    // RawBT cannot answer, so the owner is asked; Cleanter's answer arrives by itself.
    setProbe(app === 'rawbt' ? 'asking' : 'idle');
  };
  const answerProbe = (ok: boolean) => {
    if (!branch) return;
    setPrinterVerified(branch.id, ok);
    setVerified(ok);
    setProbe(ok ? 'idle' : 'failed');
  };

  const branchSave = useMutation({
    mutationFn: (body: { nameAr?: string; nameEn?: string; printerEnabled?: boolean; counterMode?: boolean }) =>
      api.patch<BranchResponse>(`/api/branches/${branch!.id}`, body),
    onSuccess: (b) => {
      qc.setQueryData<BranchResponse[]>(['branches', rid], (prev = []) => prev.map((x) => (x.id === b.id ? b : x)));
      toast(t('branchSaved'));
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });

  const canEditBranch = !!branch && can(user, 'BRANCHES');

  return (
    <SettingsShell
      mark="🖨"
      surface={t('sfc_branch')}
      title={shownBranchName || t('branchTitle')}
      sub={t('branchPaneSub')}
      actions={
        <button className="btn sm ghost" type="button" disabled={!restaurantQ.data}
          onClick={() => restaurantQ.data && window.open(
            `/r/${restaurantQ.data.slug}${branchId != null ? `/b/${branchId}` : ''}`, '_blank', 'noopener,noreferrer')}>
          ↗ {t('openMenu')}
        </button>
      }
      aside={
        <Specimen label={t('tapeLabel')}>
          {/* A strip of the tape this branch's printer would spit out — the fastest
              way to tell a floor tablet is actually wired to a printer. */}
          <div className="stg-tape-wrap">
            <div className="stg-tape">
              <div className="stg-tape-brand">Serva</div>
              <div className="stg-tape-name">{shownBranchName || '—'}</div>
              <hr />
              <div className="stg-tape-row"><span>{t('tapePrinter')}</span><span>{printingOn ? t('tapeOn') : t('tapeOff')}</span></div>
              <div className="stg-tape-row"><span>{t('tapeApp')}</span><span>{app === 'station' ? t('appStation') : app === 'cleanter' ? 'Cleanter' : 'RawBT'}</span></div>
              {printingOn && stationQ.data && (
                <div className="stg-tape-row"><span>{t('tapeStation')}</span>
                  <span>{stationQ.data.stations > 1 ? t('tapeManyStations') : stationQ.data.collecting ? t('tapeCollecting') : t('tapeNoStation')}</span></div>
              )}
              {printingOn && !!stationQ.data?.pending && (
                <div className="stg-tape-row"><span>{t('tapeWaiting')}</span><span>{stationQ.data.pending}</span></div>
              )}
              {app === 'cleanter' && (
                <div className="stg-tape-row"><span>{t('tapeBt')}</span>
                  <span>{cleanterReady
                    ? (cleanterPrinter?.name ? <Ltr>{cleanterPrinter.name}</Ltr> : t('tapeConnected'))
                    : health ? t('tapeOffline') : t('tapeUnknown')}</span></div>
              )}
              {/* Branch state and device state are different answers to "why is nothing
                  printing?", so the tape reports both — the branch switch above, then
                  whether THIS tablet has ever put paper through the printer. */}
              <div className="stg-tape-row"><span>{t('tapeDevice')}</span><span>{app === 'station' ? t('tapeViaStation') : verified ? t('tapeReady') : t('tapeUnset')}</span></div>
              <div className="stg-tape-row"><span>{t('tapeLast')}</span>
                <span>{lastAttempt ? <Ltr>{new Date(lastAttempt.at).toLocaleTimeString()}</Ltr> : t('tapeNone')}{lastAttempt?.ok === false ? ' · ' + t('tapeFailed') : lastAttempt?.queued ? ' · ' + t('tapeQueued') : ''}</span></div>
              <div className="stg-tape-row"><span>{t('tapeBuild')}</span><span>{__BUILD_TIME__}</span></div>
              {!printingOn && <div className="stg-tape-idle">{t('tapeIdle')}</div>}
            </div>
          </div>
          <p className="stg-spec-note">{app === 'station' ? t(stationCollecting ? 's4Ok' : 's4Wait') : verified ? t(app === 'cleanter' ? 'c6Ok' : 'g5Ok') : t('asideSetup')}</p>
          {printingOn && appCollecting && (
            <p className="stg-spec-note">{t('appCollectingNote')}</p>
          )}
          {printingOn && !appCollecting && (stationQ.data?.stations ?? 0) > 1 && (
            <p className="stg-spec-note">{t('manyStationsNote')}</p>
          )}
        </Specimen>
      }
    >
      <PaneSection no="01" title={t('branchTitle')} sub={t('branchSub')}>
        <div className="profile-fields">
          {canEditBranch && (
            <label className="field"><span>{t('branchNameAr')}</span>
              <input value={bNameAr} lang="ar" dir="rtl" onChange={(e) => setBNameAr(e.target.value)} />
            </label>
          )}
          {canEditBranch && (
            <label className="field"><span>{t('branchNameEn')}</span>
              <div className="branch-row">
                <input value={bNameEn} lang="en" dir="ltr" onChange={(e) => setBNameEn(e.target.value)} />
                <button className="btn sm ghost" type="button"
                  disabled={(!bNameAr.trim() && !bNameEn.trim()) || !branchNameDirty || branchSave.isPending}
                  onClick={() => branchSave.mutate({ nameAr: bNameAr.trim(), nameEn: bNameEn.trim() })}>{t('saveBranch')}</button>
              </div>
            </label>
          )}
          <label className="field"><span>{t('slug')}</span><input className="num" value={restaurantQ.data?.slug ?? ''} disabled /></label>
        </div>
        <small className="loy-hint">{t('menuLinkHelp')}</small>
      </PaneSection>

      {canEditBranch && (
        <PaneSection no="02" title={t('printTitle')} sub={t('printSub')}>
          <div className="profile-settings">
            {/* Each row says WHOSE setting it is. Two of these live in the database and
                change the whole branch; the third is a fact about the tablet in your hand.
                Reading them as one stack was the confusion — the badge is the fix. */}
            <div className="profile-setting profile-printer-setting">
              <div>
                <em className="stg-scope">{t('scopeBranch')}</em>
                <b>{t('printerEnabled')}</b><span>{t('printerShort')}</span>
                {printingOn && lastAttempt && (
                  <span className={'print-server-status ' + (lastAttempt.ok === false ? 'bad' : 'ok')}>
                    {(lastAttempt.ok === false ? '✕ ' : '✓ ') + t('lastSent') + ' · ' + ltrText(new Date(lastAttempt.at).toLocaleTimeString())}
                  </span>
                )}
              </div>
              <div className="printer-station-actions">
                <button type="button" className={'switch' + (branch!.printerEnabled ? ' on' : '')}
                  role="switch" aria-checked={branch!.printerEnabled} aria-label={t('printerEnabled')}
                  disabled={branchSave.isPending}
                  onClick={() => branchSave.mutate({ printerEnabled: !branch!.printerEnabled })}><span /></button>
              </div>
            </div>
            <div className="profile-setting profile-counter-setting">
              <div>
                <em className="stg-scope">{t('scopeBranch')}</em>
                <b>{t('counterMode')}</b><span>{t('counterShort')}</span>
              </div>
              <div className="printer-station-actions">
                <button type="button" className={'switch' + (branch!.counterMode ? ' on' : '')}
                  role="switch" aria-checked={branch!.counterMode} aria-label={t('counterMode')}
                  disabled={branchSave.isPending}
                  onClick={() => branchSave.mutate({ counterMode: !branch!.counterMode })}><span /></button>
              </div>
            </div>
            {printingOn && app !== 'station' && (
              <div className="profile-setting profile-counter-setting">
                <div>
                  <em className="stg-scope device">{t('scopeDevice')}</em>
                  <b>{branch!.counterMode ? t('printStation') : t('printStationPlain')}</b>
                  <span>{branch!.counterMode ? t('printStationSub') : t('printStationSubPlain')}</span>
                  {/* A station must be able to print. A laptop with this switched on would
                      poll nothing and hand its own jobs back to the queue, so it cannot. */}
                  {!android && <span>{t('printStationNoAndroid')}</span>}
                </div>
                <div className="printer-station-actions">
                  <button type="button" className={'switch' + (station ? ' on' : '')}
                    role="switch" aria-checked={station} aria-label={t('printStation')}
                    disabled={!printingOn || !android}
                    onClick={toggleStation}><span /></button>
                </div>
              </div>
            )}
            {/* Which app carries the receipt off THIS tablet. RawBT for everyone who set up
                before Cleanter existed; Cleanter for a Bluetooth printer, where its answers
                make the guide below honest instead of asking the owner what happened. */}
            <div className="profile-setting profile-counter-setting">
              <div>
                <em className="stg-scope device">{t('scopeDevice')}</em>
                <b>{t('appPick')}</b>
                <span>{app === 'station' ? t('appStationSub') : app === 'cleanter' ? t('appCleanterSub') : t('appRawbtSub')}</span>
                {app !== 'station' && <span className="stg-recommend">{t('appRecommended')}</span>}
              </div>
              <div className="printer-station-actions">
                <div className="seg stg-app-seg" role="radiogroup" aria-label={t('appPick')}>
                  <button type="button" role="radio" aria-checked={app === 'station'} className={app === 'station' ? 'on' : ''}
                    onClick={() => chooseApp('station')}>{t('appStation')}</button>
                  <button type="button" role="radio" aria-checked={app === 'rawbt'} className={app === 'rawbt' ? 'on' : ''}
                    onClick={() => chooseApp('rawbt')}>RawBT</button>
                  <button type="button" role="radio" aria-checked={app === 'cleanter'} className={app === 'cleanter' ? 'on' : ''}
                    onClick={() => chooseApp('cleanter')}>Cleanter</button>
                </div>
              </div>
            </div>
            {app === 'cleanter' && (
              <div className="profile-setting profile-counter-setting">
                <div>
                  <em className="stg-scope device">{t('scopeDevice')}</em>
                  <b>{t('paperPick')}</b><span>{t('paperSub')}</span>
                </div>
                <div className="printer-station-actions">
                  <div className="seg stg-app-seg" role="radiogroup" aria-label={t('paperPick')}>
                    <button type="button" role="radio" aria-checked={paper === 80} className={paper === 80 ? 'on' : ''}
                      onClick={() => choosePaper(80)}>{t('paper80')}</button>
                    <button type="button" role="radio" aria-checked={paper === 58} className={paper === 58 ? 'on' : ''}
                      onClick={() => choosePaper(58)}>{t('paper58')}</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </PaneSection>
      )}

      {canEditBranch && (
        <PaneSection no="03" title={t('setupTitle')} sub={t('setupSub')}>
          {/* Every café is on RawBT, and nothing in its guide ever mentioned that there is
              now a better way — so the better way would never have been found. This sits
              above the other two guides, carries the download, and switches the device in one
              tap. It is an offer, not a warning: what they have still works. */}
          {app !== 'station' && (
            <div className="stg-offer">
              <b>{t('offerTitle')}</b>
              <p>{t('offerBody')}</p>
              <div className="stg-step-actions">
                {android ? (
                  <a className="btn sm" href={STATION_APK_PATH} download="serva-station.apk">↓ {t('s1Get')}</a>
                ) : null}
                <button className="btn sm ghost" type="button" onClick={() => chooseApp('station')}>{t('offerSwitch')}</button>
              </div>
              {!android && (
                <div className="stg-step-scan">
                  <MiniQr value={`${location.origin}${STATION_APK_PATH}`} className="stg-step-qr" />
                  <span>{t('s1Qr')}</span>
                </div>
              )}
            </div>
          )}
          {app === 'station' ? (
          <ol className="stg-guide">
            {/* Nothing in this path is a fact about THIS device: the app lives on the counter
                tablet, and this page may well be a laptop. So the steps hand the download to
                that tablet, and the last step reports the one thing the server can actually
                see — whether the app has started collecting. */}
            <GuideStep no={1} state={stationCollecting ? 'ok' : 'todo'} title={t('s1')}>
              <p>{t('s1Body')}</p>
              {android ? (
                <div className="stg-step-actions">
                  <a className="btn sm" href={STATION_APK_PATH} download="serva-station.apk">↓ {t('s1Get')}</a>
                </div>
              ) : (
                <div className="stg-step-scan">
                  <MiniQr value={`${location.origin}${STATION_APK_PATH}`} className="stg-step-qr" />
                  <span>{t('s1Qr')}</span>
                </div>
              )}
              <p className="stg-step-note">{t('s1Unknown')}</p>
            </GuideStep>

            <GuideStep no={2} state={stationCollecting ? 'ok' : 'todo'} title={t('s2')}>
              <p>{t('s2Body')}</p>
            </GuideStep>

            <GuideStep no={3} state={printingOn ? 'ok' : 'todo'} title={t('g4')}>
              <p>{printingOn ? t('g4Ok') : t('g4Off')}</p>
              {!printingOn && (
                <div className="stg-step-actions">
                  <button className="btn sm" type="button" disabled={branchSave.isPending}
                    onClick={() => branchSave.mutate({ printerEnabled: true })}>{t('g4Do')}</button>
                </div>
              )}
            </GuideStep>

            <GuideStep no={4} state={stationCollecting ? 'ok' : 'todo'} title={t('s4')}>
              <p>{stationCollecting ? t('s4Ok') : printingOn ? t('s4Wait') : t('s4NeedsPrint')}</p>
              {stationCollecting && (stationQ.data?.stations ?? 0) > 1 && <p className="stg-step-note">{t('manyStationsNote')}</p>}
            </GuideStep>
          </ol>
          ) : app === 'cleanter' ? (
          <ol className="stg-guide">
            <GuideStep no={1} state={android ? 'ok' : 'bad'} title={t('g1')}>
              <p>{android ? t('c1Ok') : t('c1Bad')}</p>
            </GuideStep>

            <GuideStep no={2} state={health?.ok ? 'ok' : 'todo'} title={t('c2')}>
              <p>{t('c2Body')}</p>
              {android ? (
                <div className="stg-step-actions">
                  <a className="btn sm ghost" href={CLEANTER_PLAY_URL} target="_blank" rel="noopener noreferrer">
                    ↗ {t('c2Get')}
                  </a>
                </div>
              ) : (
                <div className="stg-step-scan">
                  <MiniQr value={CLEANTER_PLAY_URL} className="stg-step-qr" />
                  <span>{t('g2Qr')}</span>
                </div>
              )}
            </GuideStep>

            <GuideStep no={3} state={cleanterReady ? 'ok' : 'todo'} title={t('c3')}>
              <p>{t('c3Body')}</p>
              <p className="stg-step-note">{t('c3Note')}</p>
            </GuideStep>

            {/* The one step that talks to the bridge from a tap — the only way Chrome will
                show its permission prompt. Everything it learns is shown as-is: version,
                printer name, and the printer's own complaint when there is one. */}
            <GuideStep no={4} state={cleanterReady ? 'ok' : health ? 'bad' : 'todo'} title={t('c4')}>
              {health == null && <p>{t('c4Body')}</p>}
              {health?.ok && (
                <>
                  <p>{cleanterReady ? t('c4Ok')
                    : cleanterPrinter?.problem ? describePrinterProblem(cleanterPrinter.problem, lang).long
                      : t('c4NoPrinter')}</p>
                  <p className="stg-status">
                    <code><Ltr>{'Cleanter ' + health.version}</Ltr></code>
                    {cleanterPrinter?.name && <code><Ltr>{cleanterPrinter.name}</Ltr></code>}
                  </p>
                </>
              )}
              {health && !health.ok && <p>{describeCleanterFailure(health, lang).long}</p>}
              <div className="stg-step-actions">
                <button className="btn sm" type="button" disabled={connecting || !android} onClick={connect}>
                  {connecting ? t('c4Wait') : health ? t('c4Again') : t('c4Do')}
                </button>
              </div>
            </GuideStep>

            <GuideStep no={5} state={printingOn ? 'ok' : 'todo'} title={t('g4')}>
              <p>{printingOn ? t('g4Ok') : t('g4Off')}</p>
              {!printingOn && (
                <div className="stg-step-actions">
                  <button className="btn sm" type="button" disabled={branchSave.isPending}
                    onClick={() => branchSave.mutate({ printerEnabled: true })}>{t('g4Do')}</button>
                </div>
              )}
            </GuideStep>

            <GuideStep no={6} state={verified ? 'ok' : lastCleanterFailure ? 'bad' : 'todo'} title={t('g5')}>
              <p>{verified ? t('c6Ok') : cleanterCanPrint ? t('c6Body') : t('c6Wait')}</p>
              <div className="stg-step-actions">
                <button className="btn sm ghost" type="button" disabled={!cleanterCanPrint} onClick={runTestPrint}>
                  🖨 {verified ? t('g5Again') : t('testPrint')}
                </button>
              </div>
              {lastCleanterFailure && (
                <div className="stg-fix">
                  <b>{describeCleanterFailure({ ok: false, reason: lastCleanterFailure.reason ?? 'unreachable', code: lastCleanterFailure.code }, lang).long}</b>
                </div>
              )}
              {verified && <p className="stg-step-note">{t('c6NoPaper')}</p>}
            </GuideStep>
          </ol>
          ) : (
          <ol className="stg-guide">
            <GuideStep no={1} state={android ? 'ok' : 'bad'} title={t('g1')}>
              <p>{android ? t('g1Ok') : t('g1Bad')}</p>
            </GuideStep>

            <GuideStep no={2} state={verified ? 'ok' : 'todo'} title={t('g2')}>
              <p>{t('g2Body')}</p>
              {android ? (
                <div className="stg-step-actions">
                  <a className="btn sm ghost" href={RAWBT_PLAY_URL} target="_blank" rel="noopener noreferrer">
                    ↗ {t('g2Get')}
                  </a>
                </div>
              ) : (
                // On a laptop the store link is useless on THIS screen — the code carries
                // it to the tablet that has to install it.
                <div className="stg-step-scan">
                  <MiniQr value={RAWBT_PLAY_URL} className="stg-step-qr" />
                  <span>{t('g2Qr')}</span>
                </div>
              )}
            </GuideStep>

            {/* The IP is the one thing in this whole guide an owner cannot guess, and the
                old copy asked for it without saying where it comes from. It comes off the
                printer's own self-test slip — no PC, no router password — and the reservation
                warning is here because a DHCP lease change breaks printing silently. */}
            <GuideStep no={3} state={verified ? 'ok' : 'todo'} title={t('g3')}>
              <p>{t('g3Body')}</p>
              <p className="stg-step-note">{t('g3Ip')} {t('g3Static')}</p>
              <p className="stg-step-note">{t('g3Note')}</p>
            </GuideStep>

            <GuideStep no={4} state={printingOn ? 'ok' : 'todo'} title={t('g4')}>
              <p>{printingOn ? t('g4Ok') : t('g4Off')}</p>
              {!printingOn && (
                <div className="stg-step-actions">
                  <button className="btn sm" type="button" disabled={branchSave.isPending}
                    onClick={() => branchSave.mutate({ printerEnabled: true })}>{t('g4Do')}</button>
                </div>
              )}
            </GuideStep>

            <GuideStep no={5} state={verified ? 'ok' : probe === 'failed' ? 'bad' : 'todo'} title={t('g5')}>
              <p>{verified ? t('g5Ok') : t('g5Body')}</p>
              {probe === 'asking' ? (
                <div className="stg-step-ask">
                  <b>{t('g5Ask')}</b>
                  <div className="stg-step-actions">
                    <button className="btn sm" type="button" onClick={() => answerProbe(true)}>{t('g5Yes')}</button>
                    <button className="btn sm ghost" type="button" onClick={() => answerProbe(false)}>{t('g5No')}</button>
                  </div>
                </div>
              ) : (
                <div className="stg-step-actions">
                  <button className="btn sm ghost" type="button" onClick={runTestPrint}>
                    🖨 {verified ? t('g5Again') : t('testPrint')}
                  </button>
                </div>
              )}
              {probe === 'failed' && (
                <div className="stg-fix">
                  <b>{t('fixTitle')}</b>
                  <ul>
                    <li>{t('fix1')}</li><li>{t('fix2')}</li><li>{t('fix3')}</li><li>{t('fix4')}</li>
                  </ul>
                </div>
              )}
            </GuideStep>
          </ol>
          )}
        </PaneSection>
      )}
    </SettingsShell>
  );
}

/* ============================ 04 · RECEIPT ============================ */
export function ReceiptSection({ branchId }: { branchId?: number }) {
  const { user } = useAuth();
  const rid = user!.restaurantId!;
  const t = useT(DICT);
  const toast = useToast();
  const qc = useQueryClient();

  const restaurantQ = useQuery({
    queryKey: ['restaurant', rid],
    queryFn: () => api.get<Restaurant>(`/api/restaurants/${rid}`),
  });

  // Receipt customization draft — hydrated from the saved JSON, edited locally with a live
  // preview, saved via its own PATCH (mirrors the menu-theme flow in MenuManager).
  const [rcpt, setRcpt] = useState<ReceiptSettings>({ ...RECEIPT_DEFAULTS });
  useEffect(() => {
    if (restaurantQ.data) setRcpt(parseReceiptSettings(restaurantQ.data.receiptSettingsJson));
  }, [restaurantQ.data?.id]); // eslint-disable-line
  const setRcptField = <K extends keyof ReceiptSettings>(k: K, v: ReceiptSettings[K]) =>
    setRcpt((p) => ({ ...p, [k]: v }));
  const rcptSave = useMutation({
    mutationFn: () => api.patch<Restaurant>(`/api/restaurants/${rid}/receipt`,
      { receiptSettingsJson: JSON.stringify(rcpt) }),
    onSuccess: (r) => {
      qc.setQueryData(['restaurant', rid], r);
      toast(t('rcptSaved'));
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Error'),
  });

  const hasLogo = !!restaurantQ.data?.logoUrl;
  const hasPhone = !!restaurantQ.data?.phone;

  return (
    <SettingsShell
      mark="🧾"
      surface={t('sfc_receipt')}
      title={t('receiptTitle')}
      sub={t('receiptSub')}
      asideWidth="paper"
      actions={
        <button className="btn sm" type="button" disabled={rcptSave.isPending}
          onClick={() => rcptSave.mutate()}>{t('rcptSave')}</button>
      }
      aside={
        <Specimen label={t('rcptPreview')}>
          <div className="receipt-preview-sheet">
            <ReceiptSheet order={makeTestOrder(rid, branchId ?? 0)} restaurant={restaurantQ.data}
              tableNumber="5" settingsOverride={rcpt} />
          </div>
        </Specimen>
      }
    >
      <PaneSection no="01" title={t('rcptStyle')} sub={t('rcptStyleSub')}>
        <div className="seg seg-wrap">
          {(['classic', 'minimal', 'bold', 'retro', 'fancy', 'ticket'] as ReceiptStyle[]).map((st) => (
            <button key={st} type="button" className={rcpt.style === st ? 'on' : ''}
              onClick={() => setRcptField('style', st)}>
              {t('rcpt' + st.charAt(0).toUpperCase() + st.slice(1))}
            </button>
          ))}
        </div>
      </PaneSection>

      <PaneSection no="02" title={t('rcptLangTitle')} sub={t('rcptLangSub')}>
        <div className="seg" role="radiogroup" aria-label={t('rcptLangTitle')}>
          {(['bilingual', 'en'] as ReceiptLanguage[]).map((lg) => (
            <button key={lg} type="button" role="radio" aria-checked={rcpt.language === lg}
              className={rcpt.language === lg ? 'on' : ''} onClick={() => setRcptField('language', lg)}>
              {t(lg === 'en' ? 'rcptLangEn' : 'rcptLangBoth')}
            </button>
          ))}
        </div>
      </PaneSection>

      <PaneSection no="03" title={t('rcptContentTitle')} sub={t('rcptContentSub')}>
        <div className="profile-settings">
          {/* Both rows carry long labels, so they take the full width instead of
              sharing the grid's narrow control column. */}
          <div className="profile-setting stg-span2">
            <div><b>{t('rcptShowLogo')}</b>{!hasLogo && <span>{t('rcptNoLogo')}</span>}</div>
            <button type="button" className={'switch' + (rcpt.showLogo ? ' on' : '')}
              role="switch" aria-checked={rcpt.showLogo} aria-label={t('rcptShowLogo')}
              disabled={!hasLogo}
              onClick={() => setRcptField('showLogo', !rcpt.showLogo)}><span /></button>
          </div>
          <div className="profile-setting stg-span2">
            <div><b>{t('rcptShowPhone')}</b>{!hasPhone && <span>{t('rcptNoPhone')}</span>}</div>
            <button type="button" className={'switch' + (rcpt.showPhone ? ' on' : '')}
              role="switch" aria-checked={rcpt.showPhone} aria-label={t('rcptShowPhone')}
              disabled={!hasPhone}
              onClick={() => setRcptField('showPhone', !rcpt.showPhone)}><span /></button>
          </div>
        </div>
        <div className="profile-fields" style={{ marginTop: 13 }}>
          <label className="field stg-span2"><span>{t('rcptFooter')}</span>
            <textarea rows={2} maxLength={200} value={rcpt.footerText} placeholder={t('rcptFooterPh')}
              onChange={(e) => setRcptField('footerText', e.target.value)} />
          </label>
          <label className="field"><span>{t('rcptVatNo')}</span>
            <input className="num" maxLength={30} value={rcpt.vatNumber}
              onChange={(e) => setRcptField('vatNumber', e.target.value)} />
          </label>
          <label className="field"><span>{t('rcptCrNo')}</span>
            <input className="num" maxLength={30} value={rcpt.crNumber}
              onChange={(e) => setRcptField('crNumber', e.target.value)} />
          </label>
        </div>
      </PaneSection>
    </SettingsShell>
  );
}

/* ============================ ASIDE · PLAN ============================ */
export function PlanSection() {
  const { user } = useAuth();
  const rid = user!.restaurantId!;
  const { lang } = useI18n();
  const t = useT(DICT);

  // Subscription is owner-visible; admin-created cafés may have none → don't retry a 404.
  const subscriptionQ = useQuery({
    queryKey: ['subscription', rid],
    queryFn: () => api.get<Subscription>(`/api/restaurants/${rid}/subscription`),
    retry: false,
  });
  const restaurantQ = useQuery({
    queryKey: ['restaurant', rid],
    queryFn: () => api.get<Restaurant>(`/api/restaurants/${rid}`),
  });
  const features = useFeatures();
  const sub = subscriptionQ.data;

  // bidi-ok: the locale follows the UI language, so an Arabic page gets an Arabic date
  // that is already RTL-native. Forcing it LTR would reverse a correct string.
  const fmtDate = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString(lang === 'ar' ? 'ar' : 'en-GB', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
  const isOneTime = sub?.billingCycle === 'ONE_TIME';
  // The tier names itself; the cycle is a separate line. These used to be one string, so a
  // lifetime Pro café read simply "Lifetime" and never showed which tier it was on.
  // Through the dictionary, not straight out of the enum: this is the biggest word on the
  // page, and "STANDARD" sitting in an otherwise Arabic screen is the one-language rule
  // broken in the largest possible type.
  const tier = sub?.tier || restaurantQ.data?.plan;
  const planLabel = isOneTime ? t('oneTime') : (tier ? t('tier_' + tier) : t('planTitle'));

  // Every feature the platform gates, in the order the Plans page lists them — not a
  // hand-picked three. The old list named loyalty, analytics and a "Pro look studio" that
  // was never on the grid at all, so a café read a line item no plan sells while the four
  // features it might actually be paying for went unmentioned.
  //
  // Rows come from FEATURES rather than from `features.features`, because a list that only
  // renders what you already have cannot answer the question this pane exists for: what is
  // in the tier above yours. Every feature shows; the tick is what changes.
  const included = FEATURES.map((f) => {
    const on = features.has(f);
    return { key: f, on, label: t('incl_' + f), sub: t('incld_' + f), state: on ? t('inclOn') : t('inclOff') };
  });

  return (
    <SettingsShell
      mark={planLabel.charAt(0).toUpperCase()}
      markClass="seal"
      surface={t('sfc_billing')}
      title={planLabel}
      sub={t('planSub')}
      aside={sub ? (
        <section className="profile-plan-card">
          {/* The hero already carries the tier — this card answers what the hero
              cannot: how it is billed, whether it is live, and until when. */}
          <span className="profile-side-label">{t('subscription')}</span>
          <div className="profile-plan-name">
            {isOneTime ? t('oneTime') : sub.billingCycle === 'YEARLY' ? t('cycYearly') : t('cycMonthly')}
          </div>
          <b className={'sub-pill st-' + sub.status}>{t('st_' + sub.status)}</b>
          <dl>
            <div><dt>{isOneTime ? t('access') : sub.status === 'EXPIRED' ? t('ended') : t('renews')}</dt><dd>{isOneTime ? t('lifetime') : fmtDate(sub.endDate)}</dd></div>
          </dl>
        </section>
      ) : (
        <Specimen label={t('subscription')}>
          <p className="stg-spec-note"><b>{t('noSub')}</b><br />{t('noSubHint')}</p>
        </Specimen>
      )}
    >
      <PaneSection no="01" title={t('inclTitle')} sub={t('inclSub')}>
        <div className="stg-incl">
          {included.map((f) => (
            <div key={f.key} className={'stg-incl-row' + (f.on ? ' on' : '')}>
              <span className="mk" aria-hidden="true">{f.on ? '✓' : '·'}</span>
              <div><b>{f.label}</b><span>{f.sub}</span></div>
              <span className="st">{f.state}</span>
            </div>
          ))}
        </div>
      </PaneSection>
    </SettingsShell>
  );
}
