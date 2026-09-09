import { useI18n, pick } from '../../../lib/i18n';
import type { BaseUnit, CoverRow, StockItemRow } from '../../../lib/types';
import { Gauge, stateLabel } from './parts';
import { LINE_AT, levelOf, qty, unitTag } from './units';

type T = (k: string) => string;

/**
 * The shelf before anything is on it.
 *
 * <p>This is the only screen an owner sees before deciding whether stock is worth their
 * evening, and for a new café it is the common state rather than the edge case. It has one
 * job — get the first few things onto the shelf — and one button.
 *
 * <p>What it adds back is the sentence the old screen would not say: what happens after.
 * That was left out on the grounds that a setup ladder is a bill presented to someone who
 * has not agreed to buy, which was right about a to-do list and wrong about a promise. These
 * three lines are not homework: two of the three happen without the owner doing anything,
 * which is the actual pitch, and saying so is what makes the one button worth pressing.
 */
export default function FirstRun({ t, onAdd }: { t: T; onAdd: () => void }) {
  const { lang } = useI18n();
  return (
    <div className="stk-first">
      <header className="stk-first-copy">
        <span className="stk-eyebrow">{t('firstEyebrow')}</span>
        <h2>{t('firstTitle')}</h2>
        <p>{t('firstBody')}</p>
        <button className="key" onClick={onAdd}>
          <span className="ic" aria-hidden>+</span>{t('firstCta')}
        </button>
      </header>

      {/* Three rows of a real shelf, drawn by the same parts the real one uses, so what they
          are being shown is what they will get. Labelled as a sample, because a screen that
          shows made-up numbers without saying so is a screen that has lied once. */}
      <figure className="stk-sample" aria-label={t('sampleAria')}>
        <figcaption className="stk-eyebrow">{t('sampleH')}</figcaption>
        <div className="stk-list" aria-hidden>
          <div className="stk-axis">
            <span className="stk-row-track">
              <i className="stk-row-rule" style={{ insetInlineStart: `${LINE_AT}%` }} />
              <em className="stk-axis-cap" style={{ insetInlineStart: `${LINE_AT}%` }}>
                {t('lineCap')}
              </em>
            </span>
          </div>
          <div className="stk-band">
            {SAMPLE.map(({ item, days }) => {
              const label = stateLabel(
                item, days != null ? ({ daysLeft: days } as CoverRow) : undefined, t, lang);
              return (
                <div className="stk-row" data-state={levelOf(item)} key={item.id}>
                  <span className="stk-row-name"><b>{pick(item, 'name', lang)}</b></span>
                  <span className="stk-row-qty num">
                    {qty(item.onHand, item.baseUnit)}<i>{unitTag(item.baseUnit, t)}</i>
                  </span>
                  <span className="stk-row-track">
                    <i className="stk-row-rule" style={{ insetInlineStart: `${LINE_AT}%` }} />
                    <Gauge item={item} rule={false} className="in-row" />
                  </span>
                  <span className="stk-row-state" data-tone={label.tone}>{label.text}</span>
                </div>
              );
            })}
          </div>
        </div>
      </figure>

      {/* The loop, as a promise. A real sequence in time, so it is numbered; the numbers stop
          at the one step that is theirs and the other two say who does them. */}
      <section className="stk-loop-how">
        <h3 className="stk-eyebrow">{t('firstHow')}</h3>
        <ol>
          <li>{t('firstStep1')}</li>
          <li>{t('firstStep2')}</li>
          <li>{t('firstStep3')}</li>
        </ol>
      </section>
    </div>
  );
}

/** The shelf an owner is being offered, in the three states that matter. Not their data. */
const sample = (
  id: number, nameEn: string, nameAr: string, baseUnit: BaseUnit,
  onHand: number, par: number, reorder: number,
): StockItemRow => ({
  id, nameEn, nameAr, kind: 'INGREDIENT', baseUnit, purchaseUnitSize: 1, costPerBaseUnit: 0,
  wastePct: 0, allergens: [], archived: false, onHand, parLevel: par, reorderPoint: reorder,
  low: onHand > 0 && onHand <= reorder, out: onHand <= 0, counted: true,
});
const SAMPLE: { item: StockItemRow; days?: number }[] = [
  { item: sample(-1, 'Coffee beans', 'حبوب بن', 'G', 0, 3000, 1000) },
  { item: sample(-2, 'Milk', 'حليب', 'ML', 3500, 12000, 4000) },
  { item: sample(-3, 'Cups 12oz', 'أكواب ١٢ أونصة', 'PIECE', 180, 300, 60), days: 6 },
];
