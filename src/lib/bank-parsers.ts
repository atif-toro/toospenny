/**
 * Bank statement CSV parsing.
 *
 * Client-safe: no server-only imports. Handles the CSV exports of the UK banks
 * Too Spenny supports out of the box, plus a generic fallback that inspects the
 * header row for anything date / description / amount shaped.
 */

export type ParsedRow = {
  /** ISO date, YYYY-MM-DD */
  date: string;
  description: string;
  /** Positive pence value */
  amountPence: number;
  type: "income" | "expense";
};

export type BankId =
  | "monzo"
  | "starling"
  | "revolut"
  | "natwest"
  | "lloyds"
  | "halifax"
  | "bankofscotland"
  | "barclays"
  | "hsbc"
  | "santander"
  | "nationwide"
  | "chase"
  | "amex"
  | "capitalone"
  | "tsb"
  | "cooperative"
  | "generic";

export type BankPreset = {
  id: BankId;
  label: string;
  /** Header names (lowercased) that identify this export. */
  signature: string[];
  dateColumns: string[];
  descriptionColumns: string[];
  /** Single signed amount column. */
  amountColumns?: string[];
  /** Separate money-out / money-in columns. */
  debitColumns?: string[];
  creditColumns?: string[];
  /** Amex bills debits as positive numbers in a signed column. */
  invertSign?: boolean;
  dateFormat?: "iso" | "dmy" | "auto";
};

export const BANK_PRESETS: BankPreset[] = [
  {
    id: "monzo",
    label: "Monzo",
    signature: ["transaction id", "amount", "local amount"],
    dateColumns: ["date"],
    descriptionColumns: ["name", "description", "notes and #tags", "emoji"],
    amountColumns: ["amount"],
    dateFormat: "auto",
  },
  {
    id: "starling",
    label: "Starling",
    signature: ["counter party", "amount (gbp)"],
    dateColumns: ["date"],
    descriptionColumns: ["counter party", "reference"],
    amountColumns: ["amount (gbp)", "amount"],
    dateFormat: "dmy",
  },
  {
    id: "revolut",
    label: "Revolut",
    signature: ["started date", "completed date", "state"],
    dateColumns: ["completed date", "started date"],
    descriptionColumns: ["description"],
    amountColumns: ["amount"],
    dateFormat: "auto",
  },
  {
    id: "natwest",
    label: "NatWest",
    signature: ["value", "account name", "account number"],
    dateColumns: ["date"],
    descriptionColumns: ["description", "transaction type"],
    amountColumns: ["value", "amount"],
    dateFormat: "dmy",
  },
  {
    id: "lloyds",
    label: "Lloyds Bank",
    signature: ["transaction date", "debit amount", "credit amount"],
    dateColumns: ["transaction date"],
    descriptionColumns: ["transaction description", "description"],
    debitColumns: ["debit amount"],
    creditColumns: ["credit amount"],
    dateFormat: "dmy",
  },
  {
    id: "halifax",
    label: "Halifax",
    signature: ["transaction date", "debit amount", "credit amount", "transaction description"],
    dateColumns: ["transaction date"],
    descriptionColumns: ["transaction description", "description"],
    debitColumns: ["debit amount"],
    creditColumns: ["credit amount"],
    dateFormat: "dmy",
  },
  {
    id: "bankofscotland",
    label: "Bank of Scotland",
    signature: ["transaction date", "debit amount", "credit amount"],
    dateColumns: ["transaction date"],
    descriptionColumns: ["transaction description", "description"],
    debitColumns: ["debit amount"],
    creditColumns: ["credit amount"],
    dateFormat: "dmy",
  },
  {
    id: "barclays",
    label: "Barclays",
    signature: ["memo", "subcategory", "amount"],
    dateColumns: ["date"],
    descriptionColumns: ["memo", "description"],
    amountColumns: ["amount"],
    dateFormat: "dmy",
  },
  {
    id: "santander",
    label: "Santander",
    signature: ["from:", "to:", "account:"],
    dateColumns: ["date"],
    descriptionColumns: ["description"],
    amountColumns: ["amount"],
    dateFormat: "dmy",
  },
  {
    id: "nationwide",
    label: "Nationwide",
    signature: ["paid out", "paid in", "balance"],
    dateColumns: ["date"],
    descriptionColumns: ["description", "transaction type"],
    debitColumns: ["paid out"],
    creditColumns: ["paid in"],
    dateFormat: "dmy",
  },
  {
    id: "tsb",
    label: "TSB",
    signature: ["transaction date", "debit amount", "credit amount", "transaction type"],
    dateColumns: ["transaction date"],
    descriptionColumns: ["transaction description", "description"],
    debitColumns: ["debit amount"],
    creditColumns: ["credit amount"],
    dateFormat: "dmy",
  },
  {
    id: "cooperative",
    label: "The Co-operative Bank",
    signature: ["paid out", "paid in", "description"],
    dateColumns: ["date"],
    descriptionColumns: ["description"],
    debitColumns: ["paid out"],
    creditColumns: ["paid in"],
    dateFormat: "dmy",
  },
  {
    id: "amex",
    label: "American Express",
    signature: ["appears on your statement as"],
    dateColumns: ["date", "transaction date"],
    descriptionColumns: ["description", "appears on your statement as"],
    amountColumns: ["amount"],
    invertSign: true,
    dateFormat: "dmy",
  },
  {
    id: "capitalone",
    label: "Capital One",
    signature: ["debit", "credit", "card no."],
    dateColumns: ["transaction date", "date", "posted date"],
    descriptionColumns: ["description", "transaction description"],
    debitColumns: ["debit"],
    creditColumns: ["credit"],
    dateFormat: "auto",
  },
  // Generic-looking headers go last so distinctive formats win auto-detection.
  {
    id: "chase",
    label: "Chase UK",
    signature: ["transaction date", "description", "amount"],
    dateColumns: ["transaction date", "date"],
    descriptionColumns: ["description", "merchant"],
    amountColumns: ["amount"],
    dateFormat: "auto",
  },
  {
    id: "hsbc",
    label: "HSBC",
    signature: ["date", "description", "amount"],
    dateColumns: ["date"],
    descriptionColumns: ["description"],
    amountColumns: ["amount"],
    dateFormat: "dmy",
  },
];

export const GENERIC_PRESET: BankPreset = {
  id: "generic",
  label: "Other bank (auto-detect columns)",
  signature: [],
  dateColumns: ["date", "transaction date", "completed date", "started date", "posted date", "value date"],
  descriptionColumns: [
    "description",
    "transaction description",
    "name",
    "memo",
    "details",
    "reference",
    "narrative",
    "counter party",
    "merchant",
    "payee",
  ],
  amountColumns: ["amount", "value", "amount (gbp)", "transaction amount"],
  debitColumns: ["debit amount", "money out", "paid out", "debit", "withdrawal", "out"],
  creditColumns: ["credit amount", "money in", "paid in", "credit", "deposit", "in"],
  dateFormat: "auto",
};

export function presetById(id: BankId): BankPreset {
  return BANK_PRESETS.find((p) => p.id === id) ?? GENERIC_PRESET;
}

/* --------------------------------- CSV ----------------------------------- */

/** Minimal RFC4180-ish CSV parser supporting quotes, escaped quotes and CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Find the header row — some banks prepend account summary lines. */
function findHeaderIndex(rows: string[][]): number {
  const wanted = [...GENERIC_PRESET.dateColumns, "date"];
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cells = rows[i]!.map((c) => c.trim().toLowerCase());
    if (cells.length >= 2 && cells.some((c) => wanted.includes(c))) return i;
  }
  return 0;
}

export function detectBank(headers: string[]): BankPreset {
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (const preset of BANK_PRESETS) {
    if (preset.signature.length === 0) continue;
    if (preset.signature.every((s) => lower.includes(s))) return preset;
  }
  return GENERIC_PRESET;
}

/* ------------------------------- values ---------------------------------- */

function pickIndex(headers: string[], candidates: string[] | undefined): number {
  if (!candidates) return -1;
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (const c of candidates) {
    const idx = lower.indexOf(c);
    if (idx !== -1) return idx;
  }
  // loose contains match
  for (const c of candidates) {
    const idx = lower.findIndex((h) => h.includes(c));
    if (idx !== -1) return idx;
  }
  return -1;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Normalise a bank date cell into YYYY-MM-DD. */
export function normaliseDate(raw: string, format: BankPreset["dateFormat"] = "auto"): string | null {
  const value = raw.trim();
  if (!value) return null;

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const slash = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (slash) {
    let d = Number(slash[1]);
    let m = Number(slash[2]);
    // US-style exports (month first) when day-first is impossible.
    if (format !== "dmy" && d > 12 === false && m > 12) {
      const t = d; d = m; m = t;
    }
    if (m > 12) {
      const t = d; d = m; m = t;
    }
    let y = Number(slash[3]);
    if (y < 100) y += 2000;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  const named = value.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{2,4})/);
  if (named) {
    const m = MONTHS[named[2]!.toLowerCase()];
    if (!m) return null;
    let y = Number(named[3]);
    if (y < 100) y += 2000;
    return `${y}-${String(m).padStart(2, "0")}-${String(Number(named[1])).padStart(2, "0")}`;
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(
      parsed.getDate(),
    ).padStart(2, "0")}`;
  }
  return null;
}

/** Parse a money cell into signed pence. Returns null when blank/unparseable. */
export function parseMoneyCell(raw: string): number | null {
  let value = raw.trim();
  if (!value) return null;
  let negative = false;
  if (/^\(.*\)$/.test(value)) {
    negative = true;
    value = value.slice(1, -1);
  }
  value = value.replace(/[£$€,\s]/g, "");
  if (value.startsWith("-")) {
    negative = true;
    value = value.slice(1);
  } else if (value.startsWith("+")) {
    value = value.slice(1);
  }
  if (!/^\d+(\.\d+)?$/.test(value)) return null;
  const pence = Math.round(parseFloat(value) * 100);
  if (!Number.isFinite(pence)) return null;
  return negative ? -pence : pence;
}

export type ParseResult = {
  preset: BankPreset;
  headers: string[];
  rows: ParsedRow[];
  skipped: number;
};

export function parseStatement(text: string, forced?: BankPreset): ParseResult {
  const grid = parseCsv(text);
  if (grid.length === 0) {
    return { preset: forced ?? GENERIC_PRESET, headers: [], rows: [], skipped: 0 };
  }
  const headerIndex = findHeaderIndex(grid);
  const headers = grid[headerIndex]!.map((h) => h.trim());
  const preset = forced ?? detectBank(headers);

  const merged: BankPreset = {
    ...preset,
    dateColumns: [...preset.dateColumns, ...GENERIC_PRESET.dateColumns],
    descriptionColumns: [...preset.descriptionColumns, ...GENERIC_PRESET.descriptionColumns],
    amountColumns: [...(preset.amountColumns ?? []), ...(GENERIC_PRESET.amountColumns ?? [])],
    debitColumns: [...(preset.debitColumns ?? []), ...(GENERIC_PRESET.debitColumns ?? [])],
    creditColumns: [...(preset.creditColumns ?? []), ...(GENERIC_PRESET.creditColumns ?? [])],
  };

  const dateIdx = pickIndex(headers, merged.dateColumns);
  const descIdx = pickIndex(headers, merged.descriptionColumns);
  const hasSeparate =
    (preset.debitColumns && pickIndex(headers, preset.debitColumns) !== -1) ||
    (!preset.amountColumns && pickIndex(headers, merged.debitColumns) !== -1);
  const amountIdx = hasSeparate ? -1 : pickIndex(headers, merged.amountColumns);
  const debitIdx = pickIndex(headers, merged.debitColumns);
  const creditIdx = pickIndex(headers, merged.creditColumns);
  const lowerHeaders = headers.map((h) => h.trim().toLowerCase());
  const stateIdx = lowerHeaders.indexOf("state") !== -1
    ? lowerHeaders.indexOf("state")
    : lowerHeaders.indexOf("status");

  const rows: ParsedRow[] = [];
  let skipped = 0;

  for (let i = headerIndex + 1; i < grid.length; i++) {
    const cells = grid[i]!;
    const cell = (idx: number) => (idx >= 0 && idx < cells.length ? cells[idx]!.trim() : "");

    if (stateIdx !== -1) {
      const state = cell(stateIdx).toLowerCase();
      if (state && state !== "completed" && state !== "posted" && state !== "settled") {
        skipped++;
        continue;
      }
    }

    const date = normaliseDate(cell(dateIdx), preset.dateFormat);
    if (!date) {
      skipped++;
      continue;
    }

    let signed: number | null = null;
    if (amountIdx !== -1) {
      signed = parseMoneyCell(cell(amountIdx));
      if (signed !== null && preset.invertSign) signed = -signed;
    }
    if (signed === null && (debitIdx !== -1 || creditIdx !== -1)) {
      const debit = debitIdx === -1 ? null : parseMoneyCell(cell(debitIdx));
      const credit = creditIdx === -1 ? null : parseMoneyCell(cell(creditIdx));
      if (debit !== null && debit !== 0) signed = -Math.abs(debit);
      else if (credit !== null && credit !== 0) signed = Math.abs(credit);
    }
    if (signed === null || signed === 0) {
      skipped++;
      continue;
    }

    const parts = merged.descriptionColumns
      .map((c) => {
        const idx = pickIndex(headers, [c]);
        return idx === -1 ? "" : cell(idx);
      })
      .filter(Boolean);
    const description = (cell(descIdx) || parts[0] || "Imported transaction")
      .replace(/^['"\s]+/, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);

    rows.push({
      date,
      description,
      amountPence: Math.abs(signed),
      type: signed > 0 ? "income" : "expense",
    });
  }

  return { preset, headers, rows, skipped };
}

/* --------------------------- categorisation ------------------------------ */

const CATEGORY_KEYWORDS: { category: string; words: string[] }[] = [
  { category: "Groceries", words: ["tesco", "sainsbury", "asda", "aldi", "lidl", "morrisons", "waitrose", "co-op", "coop", "iceland", "ocado", "marks and spencer", "m&s food"] },
  { category: "Transport", words: ["tfl", "trainline", "uber", "bolt", "national rail", "lner", "gwr", "northern rail", "bus", "stagecoach", "citymapper"] },
  { category: "Fuel", words: ["shell", "bp ", "esso", "texaco", "gulf", "petrol", "fuel"] },
  { category: "Dining out", words: ["pret", "costa", "starbucks", "greggs", "nando", "mcdonald", "kfc", "deliveroo", "just eat", "uber eats", "domino", "restaurant", "cafe"] },
  { category: "Shopping", words: ["amazon", "argos", "ebay", "asos", "zara", "primark", "next retail", "john lewis", "ikea", "boots", "superdrug"] },
  { category: "Bills", words: ["british gas", "octopus energy", "edf", "eon", "ovo", "thames water", "council tax", "virgin media", "bt group", "sky ", "vodafone", "ee ", "o2", "three"] },
  { category: "Entertainment", words: ["netflix", "spotify", "disney", "cinema", "odeon", "vue", "steam", "playstation", "xbox", "apple.com/bill", "audible"] },
  { category: "Health", words: ["pharmacy", "nhs", "dentist", "optician", "gym", "puregym", "the gym", "nuffield"] },
  { category: "Housing", words: ["rent", "mortgage", "landlord", "letting"] },
  { category: "Income", words: ["salary", "payroll", "wages", "hmrc", "dividend", "interest paid"] },
];

/** Best-guess category name for a statement description, or null. */
export function guessCategory(description: string, type: "income" | "expense"): string | null {
  const text = description.toLowerCase();
  // Whole-word match so e.g. "netflix" is not read as the "tfl" travel keyword.
  const hasWord = (word: string) =>
    new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(text);
  if (type === "income") {
    const hit = CATEGORY_KEYWORDS.find((c) => c.category === "Income");
    if (hit && hit.words.some(hasWord)) return "Income";
    return null;
  }
  for (const entry of CATEGORY_KEYWORDS) {
    if (entry.category === "Income") continue;
    if (entry.words.some(hasWord)) return entry.category;
  }
  return null;
}

/** Key used to spot rows already present in Too Spenny. */
export function dedupeKey(date: string, amountPence: number, type: string, description: string): string {
  return `${date}|${type}|${amountPence}|${description.trim().toLowerCase().slice(0, 40)}`;
}
