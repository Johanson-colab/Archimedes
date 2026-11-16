// Exact finite decimal input, bounded for small human-confirmed metric files.
function parseDecimal(value) {
  const text = String(value).trim();
  const match = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:e([+-]?\d+))?$/i.exec(text);
  if (!match) return null;
  const fraction = match[3] ?? match[4] ?? '';
  const digits = `${match[2] || ''}${fraction}`.replace(/^0+/, '') || '0';
  let exponent = Number(match[5] || 0) - fraction.length;
  if (digits.length > 1000 || !Number.isSafeInteger(exponent) || Math.abs(exponent) > 1000) return null;
  let coefficient = BigInt(digits) * (match[1] === '-' ? -1n : 1n);
  if (coefficient === 0n) return { coefficient: 0n, exponent: 0 };
  while (coefficient % 10n === 0n) { coefficient /= 10n; exponent++; }
  if (Math.abs(exponent) > 1000) return null;
  return { coefficient, exponent };
}
function aligned(first, second) {
  const exponent = Math.min(first.exponent, second.exponent);
  return { exponent, first: first.coefficient * 10n ** BigInt(first.exponent - exponent), second: second.coefficient * 10n ** BigInt(second.exponent - exponent) };
}
function difference(first, second) {
  const values = aligned(first, second), coefficient = values.first - values.second;
  return { coefficient: coefficient < 0n ? -coefficient : coefficient, exponent: values.exponent };
}
function lessOrEqual(first, second) { const values = aligned(first, second); return values.first <= values.second; }
function decimalText(value) {
  if (value.coefficient === 0n) return '0';
  let { coefficient, exponent } = value;
  while (coefficient % 10n === 0n) { coefficient /= 10n; exponent++; }
  return exponent === 0 ? String(coefficient) : `${coefficient}e${exponent}`;
}

// Syntax is checked on the original JSON first. Only numeric value tokens
// outside strings are then quoted, so JSON.parse cannot round their decimals.
function parseJsonDecimals(text) {
  JSON.parse(text);
  let output = '', inString = false, escaped = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (inString) {
      output += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
    } else if (character === '"') { output += character; inString = true; }
    else if (character === '-' || /[0-9]/.test(character)) {
      const token = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?/i.exec(text.slice(index))[0];
      output += JSON.stringify(token); index += token.length - 1;
    } else output += character;
  }
  return JSON.parse(output);
}
module.exports = { parseDecimal, difference, lessOrEqual, decimalText, parseJsonDecimals };
