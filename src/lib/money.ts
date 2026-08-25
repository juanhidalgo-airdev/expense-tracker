/**
 * Money handling.
 *
 * Amounts are integer minor units (cents) plus an ISO-4217 code, never floats:
 * 0.1 + 0.2 is a real bug in anything that sums expenses, and JavaScript has no
 * decimal type. Everything that parses or formats an amount goes through here,
 * so there is exactly one place that knows about currency exponents.
 */

/** Minor-unit exponent. Not always 2 — JPY has 0, and the roadmap is multi-country. */
export function minorUnitExponent(currency: string): number {
  const zeroDecimal = ["JPY", "KRW", "VND", "CLP", "ISK", "XAF", "XOF"];
  const threeDecimal = ["BHD", "IQD", "JOD", "KWD", "OMR", "TND"];

  const code = currency.toUpperCase();
  if (zeroDecimal.includes(code)) return 0;
  if (threeDecimal.includes(code)) return 3;
  return 2;
}

export class MoneyParseError extends Error {}

/**
 * Parses user input into integer minor units.
 *
 * Tolerant of what people actually type: a leading currency symbol, thousands
 * separators, and both decimal conventions (1,234.56 and 1.234,56). Rejects
 * anything it cannot read unambiguously rather than guessing — a silently
 * misparsed amount is worse than an error message.
 */
export function parseAmountToMinor(input: string, currency = "USD"): number {
  const exponent = minorUnitExponent(currency);

  let cleaned = input.trim().replace(/[^\d.,-]/g, "");
  if (cleaned === "") {
    throw new MoneyParseError("Enter an amount.");
  }
  if (cleaned.includes("-")) {
    throw new MoneyParseError("Amount must be greater than zero.");
  }

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  if (lastComma !== -1 && lastDot !== -1) {
    // Whichever separator comes last is the decimal one.
    const decimalSep = lastComma > lastDot ? "," : ".";
    const thousandsSep = decimalSep === "," ? "." : ",";
    cleaned = cleaned.split(thousandsSep).join("");
    cleaned = cleaned.replace(decimalSep, ".");
  } else if (lastComma !== -1) {
    // A lone comma: decimal separator if it looks like one (1,50), else
    // thousands (1,500). Three trailing digits is the ambiguous case, and
    // thousands is overwhelmingly the more common intent.
    const after = cleaned.length - lastComma - 1;
    cleaned = after === 3 ? cleaned.split(",").join("") : cleaned.replace(",", ".");
  }

  if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === "." || cleaned === "") {
    throw new MoneyParseError("That does not look like an amount.");
  }

  const [whole, fraction = ""] = cleaned.split(".");
  if (fraction.length > exponent) {
    throw new MoneyParseError(
      exponent === 0
        ? `${currency} amounts cannot have decimal places.`
        : `Amounts can have at most ${exponent} decimal places.`,
    );
  }

  const padded = fraction.padEnd(exponent, "0");
  const minor = Number(`${whole || "0"}${padded}`);

  if (!Number.isSafeInteger(minor)) {
    throw new MoneyParseError("That amount is too large.");
  }
  if (minor <= 0) {
    throw new MoneyParseError("Amount must be greater than zero.");
  }

  return minor;
}

/** Formats minor units for display in the viewer's locale. */
export function formatMinor(amountMinor: number, currency = "USD", locale?: string): string {
  const exponent = minorUnitExponent(currency);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(amountMinor / 10 ** exponent);
}

/** Minor units back to a plain editable string, e.g. for populating a form. */
export function minorToInput(amountMinor: number, currency = "USD"): string {
  const exponent = minorUnitExponent(currency);
  return (amountMinor / 10 ** exponent).toFixed(exponent);
}
