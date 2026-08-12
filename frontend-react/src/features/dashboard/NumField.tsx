import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';

/**
 * A number input you can actually type a decimal into.
 *
 * The obvious pattern — `value={String(n)}` with `onChange={e => set(Number(e.target.value))}`
 * — silently eats the decimal point: typing "0." parses to 0, re-renders as "0", and the "."
 * you just typed disappears. You can never reach "0.0085". Stock's cost, waste-%, purchase-size
 * and recipe-amount fields all had this, which made them feel broken rather than fiddly —
 * the only way through was the spinner arrows or a paste.
 *
 * The fix is to keep the raw keystrokes locally so in-progress text like "0." or "" survives,
 * and only report a parsed number outward when the text is a complete one. External updates
 * (loading an existing row, a form reset) are adopted only while the field isn't focused, so
 * the component never fights the person typing.
 */
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number | null | undefined;
  /** null when the field is cleared */
  onValue: (n: number | null) => void;
};

export default function NumField({ value, onValue, ...rest }: Props) {
  const [raw, setRaw] = useState(() => (value == null ? '' : String(value)));
  const focused = useRef(false);

  useEffect(() => {
    if (focused.current) return;
    setRaw(value == null ? '' : String(value));
  }, [value]);

  return (
    <input
      {...rest}
      type="number"
      inputMode="decimal"
      value={raw}
      onFocus={(e) => { focused.current = true; rest.onFocus?.(e); }}
      onBlur={(e) => {
        focused.current = false;
        // normalise on the way out: "0." → "0", "" stays empty
        setRaw(value == null ? '' : String(value));
        rest.onBlur?.(e);
      }}
      onChange={(e) => {
        const next = e.target.value;
        setRaw(next);
        if (next.trim() === '') { onValue(null); return; }
        const n = Number(next);
        if (Number.isFinite(n)) onValue(n);
      }}
    />
  );
}
