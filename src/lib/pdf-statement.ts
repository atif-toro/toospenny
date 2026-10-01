/**
 * Client-side PDF bank statement reading.
 *
 * Runs entirely in the browser using pdf.js — no server call, no AI, no cost.
 * Works on digital statements downloaded from a bank (they carry a real text
 * layer). Scanned/photographed PDFs have no text and are reported as such so
 * the user can be told to download the CSV or PDF from their bank instead.
 */

import { normaliseDate, parseMoneyCell, type ParsedRow } from "@/lib/bank-parsers";

export type PdfParseResult = {
  rows: ParsedRow[];
  /** True when the PDF carried no extractable text (scan or photo). */
  imageOnly: boolean;
  pages: number;
};

type Line = { y: number; text: string };

const MONEY = /(?:£\s?)?-?\(?\d{1,3}(?:,\d{3})*(?:\.\d{2})\)?(?:\s?(?:CR|DR))?/gi;

const DATE_PATTERNS = [
  /^(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})\b/,
  /^(\d{4}-\d{2}-\d{2})\b/,
  /^(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})\b/,
  /^(\d{1,2}\s+[A-Za-z]{3,9})\b/,
];

const NOISE =
  /^(opening balance|closing balance|balance brought forward|balance carried forward|total|statement|page \d|continued|start balance|end balance)/i;

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjs;
}

/** Pull visual text lines out of every page, in reading order. */
export async function extractPdfLines(data: ArrayBuffer): Promise<{ lines: string[]; pages: number }> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const lines: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const buckets: Line[] = [];
    for (const item of content.items as Array<{ str?: string; transform?: number[] }>) {
      const str = (item.str ?? "").replace(/\s+/g, " ");
      if (!str.trim()) continue;
      const y = Math.round((item.transform?.[5] ?? 0) * 2) / 2;
      const found = buckets.find((b) => Math.abs(b.y - y) < 3);
      if (found) found.text += ` ${str}`;
      else buckets.push({ y, text: str });
    }
    buckets.sort((a, b) => b.y - a.y);
    for (const b of buckets) lines.push(b.text.replace(/\s+/g, " ").trim());
  }
  doc.cleanup();
  return { lines, pages: doc.numPages };
}

function yearFromLines(lines: string[]): number {
  for (const line of lines) {
    const m = line.match(/\b(20\d{2})\b/);
    if (m) return Number(m[1]);
  }
  return new Date().getFullYear();
}

/** Bank-internal reference tokens (e.g. "35123213787726000N", "FP 12345678"). */
const REFERENCE_TOKEN = /^(?:[A-Z]{0,3}\d[\dA-Z]{9,}|\d{6,})$/i;

/** Split a description into human-readable words and bank reference codes. */
export function splitReference(text: string): { words: string; reference: string } {
  const words: string[] = [];
  const refs: string[] = [];
  for (const tok of text.split(/\s+/).filter(Boolean)) {
    if (REFERENCE_TOKEN.test(tok)) refs.push(tok);
    else words.push(tok);
  }
  const w = words.join(" ").trim();
  // A lone leading number like "10" left over from a reference is not a description.
  return { words: /^[\d\s.,-]*$/.test(w) ? "" : w, reference: refs.join(" ") };
}

type Pending = {
  date: string;
  amountPence: number;
  type: "income" | "expense";
  words: string[];
  refs: string[];
};

function finish(p: Pending): ParsedRow {
  const description = p.words.join(" ").replace(/\s{2,}/g, " ").replace(/[|·]+/g, " ").trim() || p.refs.join(" ") || "Transaction";
  const row: ParsedRow = { date: p.date, description: description.slice(0, 300), amountPence: p.amountPence, type: p.type };
  if (p.refs.length) row.reference = p.refs.join(" ").slice(0, 120);
  return row;
}

/**
 * Turn statement text lines into transaction rows.
 *
 * Many banks (NatWest, Lloyds, Barclays…) print a transaction across several
 * lines: the date/amount/reference on one, the payee on the next. Lines with
 * no money are stitched onto the transaction above them; lines with money but
 * no date reuse the last seen date (banks print the date once per day).
 */
export function rowsFromLines(lines: string[]): ParsedRow[] {
  const fallbackYear = yearFromLines(lines);
  const rows: ParsedRow[] = [];
  let lastBalance: number | null = null;
  let lastDate: string | null = null;
  let pending: Pending | null = null;
  const flush = () => {
    if (pending) rows.push(finish(pending));
    pending = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (NOISE.test(line)) {
      flush();
      continue;
    }

    let dateText: string | null = null;
    let rest = line;
    for (const pattern of DATE_PATTERNS) {
      const m = line.match(pattern);
      if (m) {
        dateText = m[1]!;
        rest = line.slice(m[0].length).trim();
        break;
      }
    }

    if (dateText && NOISE.test(rest)) {
      flush();
      const opening = rest.match(MONEY);
      if (opening && opening.length > 0) {
        const value = parseMoneyCell(opening[opening.length - 1]!.replace(/\s?(CR|DR)$/i, ""));
        if (value !== null) lastBalance = value;
      }
      if (dateText) {
        const d = normaliseDate(/\d{4}|\d{2}$/.test(dateText) ? dateText : `${dateText} ${fallbackYear}`);
        if (d) lastDate = d;
      }
      continue;
    }

    let date: string | null = null;
    if (dateText) {
      date = normaliseDate(/\d{4}|\d{2}$/.test(dateText) ? dateText : `${dateText} ${fallbackYear}`);
      if (date) lastDate = date;
    }

    const money = rest.match(MONEY);
    if (!money || money.length === 0) {
      // Continuation line: payee / memo for the transaction above.
      if (pending) {
        const { words, reference } = splitReference(rest);
        if (words) pending.words.push(words);
        if (reference) pending.refs.push(reference);
      }
      continue;
    }

    const txDate = date ?? lastDate;
    if (!txDate) continue;

    const hasBalance = money.length >= 2;
    const amountToken = hasBalance ? money[money.length - 2]! : money[money.length - 1]!;
    const balanceToken = hasBalance ? money[money.length - 1]! : null;
    const amountPence = parseMoneyCell(amountToken.replace(/\s?(CR|DR)$/i, ""));
    if (amountPence === null || amountPence === 0) continue;
    const balance = balanceToken ? parseMoneyCell(balanceToken.replace(/\s?(CR|DR)$/i, "")) : null;

    let text = rest;
    for (const token of money) text = text.replace(token, " ");
    const { words, reference } = splitReference(text);

    let type: "income" | "expense";
    if (amountPence < 0 || /DR$/i.test(amountToken.trim())) type = "expense";
    else if (/CR$/i.test(amountToken.trim())) type = "income";
    else if (balance !== null && lastBalance !== null && balance !== lastBalance) type = balance > lastBalance ? "income" : "expense";
    else if (/\b(salary|wages|refund|received|credit|transfer in|interest|cashback|payment in|deposit)\b/i.test(words)) type = "income";
    else type = "expense";
    if (balance !== null) lastBalance = balance;

    flush();
    pending = { date: txDate, amountPence: Math.abs(amountPence), type, words: words ? [words] : [], refs: reference ? [reference] : [] };
  }
  flush();
  return rows;
}

export async function parsePdfStatement(data: ArrayBuffer): Promise<PdfParseResult> {
  const { lines, pages } = await extractPdfLines(data);
  const textLength = lines.join("").trim().length;
  if (textLength < 40) return { rows: [], imageOnly: true, pages };
  return { rows: rowsFromLines(lines), imageOnly: false, pages };
}
