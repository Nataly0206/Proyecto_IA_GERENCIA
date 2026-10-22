import { TextField } from '@mui/material';

export default function GroupedNumberField({ label, value, onChange, decimals = 2, min = 0, max, required = false }: {
  label: string; value: string; onChange: (value: string) => void; decimals?: number; min?: number; max?: number; required?: boolean;
}) {
  const format = (raw: string) => {
    const [integer, fraction] = raw.split('.');
    return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction !== undefined ? `.${fraction}` : '');
  };
  return <TextField size="small" required={required} label={label} value={format(value)}
    inputProps={{ inputMode: decimals ? 'decimal' : 'numeric' }}
    onChange={(event) => {
      const input = event.target;
      const raw = input.value.replace(/,/g, '');
      if (!(decimals ? new RegExp(`^\\d*(?:\\.\\d{0,${decimals}})?$`) : /^\d*$/).test(raw)) return;
      const position = input.selectionStart ?? input.value.length;
      const digitsBeforeCursor = input.value.slice(0, position).replace(/,/g, '').length;
      const normalized = raw.startsWith('.') ? `0${raw}` : raw.replace(/^0+(?=\d)/, '');
      input.setCustomValidity(normalized && (Number(normalized) < min || (max !== undefined && Number(normalized) > max))
        ? `Ingresa un valor ${max !== undefined ? `entre ${min} y ${max}` : `mayor o igual a ${min}`}.` : '');
      onChange(normalized);
      requestAnimationFrame(() => {
        const formatted = format(normalized);
        let cursor = 0, count = 0;
        while (cursor < formatted.length && count < digitsBeforeCursor) {
          if (formatted[cursor] !== ',') count += 1;
          cursor += 1;
        }
        input.setSelectionRange(cursor, cursor);
      });
    }} />;
}

