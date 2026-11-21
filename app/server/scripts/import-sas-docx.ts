import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";

interface Paragraph {
  text: string;
  embeds: string[];
}

interface KeyEntry {
  answer: string;
  points: number;
  discussion: string;
}

interface ParsedQuestion {
  type: "pg" | "bs" | "isian";
  question: string;
  options: string[] | null;
  answer: string;
  discussion: string;
  points: number;
  images: string[];
}

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const value = i >= 0 ? process.argv[i + 1] : undefined;
  if (!value) throw new Error(`Argumen --${name} wajib diisi.`);
  return value;
}

function xmlDecode(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(Number.parseInt(n, 16)));
}

function unzipText(docx: string, member: string): string {
  return execFileSync("unzip", ["-p", docx, member], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}

function unzipBuffer(docx: string, member: string): Buffer {
  return execFileSync("unzip", ["-p", docx, member], { encoding: "buffer", maxBuffer: 32 * 1024 * 1024 });
}

function parseParagraphs(xml: string): Paragraph[] {
  const result: Paragraph[] = [];
  for (const match of xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)) {
    const block = match[0];
    const text = [...block.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
      .map((item) => xmlDecode(item[1]))
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    const embeds = [...block.matchAll(/r:embed="([^"]+)"/g)].map((item) => item[1]);
    if (text || embeds.length > 0) result.push({ text, embeds });
  }
  return result;
}

function section(lines: string[], start: RegExp, end: RegExp): string[] {
  const from = lines.findIndex((line) => start.test(line));
  if (from < 0) return [];
  const relativeEnd = lines.slice(from + 1).findIndex((line) => end.test(line));
  const to = relativeEnd < 0 ? lines.length : from + 1 + relativeEnd;
  return lines.slice(from + 1, to).filter((line) => line && !/^(Pilih|Tarik|Lingkarilah|Isilah)/i.test(line));
}

function optionsIn(line: string): { prefix: string; values: string[] } {
  const first = line.search(/(?:^|\s)A\.\s*/);
  if (first < 0) return { prefix: line, values: [] };
  const prefix = line.slice(0, first).trim();
  const tail = line.slice(first).trim();
  const values = [...tail.matchAll(/(?:^|\s)([A-D])\.\s*(.*?)(?=(?:\s+[A-D]\.\s)|$)/g)].map((m) => m[2].trim());
  return { prefix, values };
}

function parseMultipleChoice(lines: string[]): { question: string; options: string[] }[] {
  const out: { question: string; options: string[] }[] = [];
  let pending: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const parsed = optionsIn(lines[i]);
    if (parsed.values.length === 0) {
      pending.push(lines[i]);
      continue;
    }
    if (parsed.prefix) pending.push(parsed.prefix);
    const options = [...parsed.values];
    while (i + 1 < lines.length && /^[B-D]\.\s*/.test(lines[i + 1])) {
      const extra = [...lines[i + 1].matchAll(/(?:^|\s)([B-D])\.\s*(.*?)(?=(?:\s+[B-D]\.\s)|$)/g)].map((m) => m[2].trim());
      options.push(...extra);
      i += 1;
    }
    out.push({ question: pending.join(" ").replace(/\s+/g, " ").trim(), options });
    pending = [];
  }
  return out;
}

function parseMatching(lines: string[]): { question: string; options: string[] }[] {
  const prompts: string[] = [];
  const answers: string[] = [];
  let pending: string[] = [];
  for (const raw of lines) {
    const line = raw.replace(/^[•·]\s*/, "").trim();
    if (!line) continue;
    const answer = line.match(/^([A-E])\.\s*(.+)$/);
    if (answer) {
      prompts.push(pending.join(" ").trim());
      answers.push(answer[2].trim());
      pending = [];
    } else if (line !== "•") {
      pending.push(line);
    }
  }
  return prompts.filter(Boolean).map((question) => ({ question, options: answers }));
}

function parseTrueFalse(lines: string[]): string[] {
  const out: string[] = [];
  let pending: string[] = [];
  for (const line of lines) {
    if (/^B\s*\/\s*S$/i.test(line)) {
      if (pending.length) out.push(pending.join(" ").trim());
      pending = [];
    } else {
      pending.push(line);
    }
  }
  return out;
}

function parseShortAnswer(lines: string[]): string[] {
  const out: string[] = [];
  let pending: string[] = [];
  for (const line of lines) {
    if (/^Jawab\s*:/i.test(line)) {
      if (pending.length) out.push(pending.join(" ").trim());
      pending = [];
    } else if (!/^~/.test(line)) {
      pending.push(line);
    }
  }
  return out;
}

function parseKeys(lines: string[]): KeyEntry[] {
  const start = lines.findIndex((line) => /^KUNCI DAN PEMBAHASAN$/i.test(line));
  if (start < 0) throw new Error("Bagian KUNCI DAN PEMBAHASAN tidak ditemukan.");
  const keys: KeyEntry[] = [];
  let current: KeyEntry | null = null;
  for (const line of lines.slice(start + 1)) {
    const head = line.match(/^\d+\.\s+(.+?)\s+\((\d+)\s+poin\)$/i);
    if (head) {
      current = { answer: head[1].trim(), points: Number(head[2]), discussion: "" };
      keys.push(current);
    } else if (current && line) {
      current.discussion = `${current.discussion} ${line}`.trim();
    }
  }
  return keys;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function sql(value: string | null): string {
  return value === null ? "NULL" : `'${value.replace(/'/g, "''")}'`;
}

const docx = arg("docx");
const product = arg("product");
const subject = arg("subject");
const grade = Number(arg("grade"));
const paket = arg("paket").toUpperCase();
const output = arg("output");
const assetDir = arg("assets");
const simId = `${product}-${normalize(subject).replace(/ /g, "-")}-p${paket.toLowerCase()}`;

const documentXml = unzipText(docx, "word/document.xml");
const relsXml = unzipText(docx, "word/_rels/document.xml.rels");
const paragraphs = parseParagraphs(documentXml);
const lines = paragraphs.map((p) => p.text).filter(Boolean);
const contentLines = lines.slice(0, lines.findIndex((line) => /^KUNCI DAN PEMBAHASAN$/i.test(line)));
const keys = parseKeys(lines);

const pg = parseMultipleChoice(section(contentLines, /^I\.\s/, /^II\.\s/));
const matching = parseMatching(section(contentLines, /^II\.\s/, /^III\.\s/));
const bs = parseTrueFalse(section(contentLines, /^III\.\s/, /^IV\.\s/));
const short = parseShortAnswer(section(contentLines, /^IV\.\s/, /^KUNCI DAN PEMBAHASAN$/));
const raw = [
  ...pg.map((q) => ({ type: "pg" as const, ...q })),
  ...matching.map((q) => ({ type: "pg" as const, ...q })),
  ...bs.map((question) => ({ type: "bs" as const, question, options: null })),
  ...short.map((question) => ({ type: "isian" as const, question, options: null }))
];

if (raw.length !== keys.length) {
  throw new Error(`Jumlah soal (${raw.length}) tidak sama dengan jumlah kunci (${keys.length}). PG=${pg.length}, jodoh=${matching.length}, BS=${bs.length}, isian=${short.length}`);
}

const relTargets = new Map<string, string>();
for (const match of relsXml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g)) {
  relTargets.set(match[1], match[2].replace(/^\.\.\//, ""));
}

const questionPositions: number[] = [];
let cursor = 0;
for (const item of raw) {
  const needle = normalize(item.question).slice(0, 36);
  let found = paragraphs.findIndex((p, index) => index >= cursor && normalize(p.text).includes(needle));
  if (found < 0) found = paragraphs.findIndex((p) => normalize(p.text).includes(needle));
  questionPositions.push(found < 0 ? cursor : found);
  cursor = Math.max(cursor, found + 1);
}

mkdirSync(assetDir, { recursive: true });
const imagesByQuestion = raw.map(() => [] as string[]);
let imageNo = 0;
for (let pIndex = 0; pIndex < paragraphs.length; pIndex += 1) {
  for (const relId of paragraphs[pIndex].embeds) {
    const target = relTargets.get(relId);
    if (!target?.startsWith("media/")) continue;
    // Naskah menaruh ilustrasi setelah kalimat soal. Kaitkan ke soal
    // terakhir yang sudah dimulai, bukan soal berikutnya yang kebetulan
    // lebih dekat secara jumlah paragraf.
    let nearest = -1;
    for (let qIndex = 0; qIndex < questionPositions.length; qIndex += 1) {
      if (questionPositions[qIndex] <= pIndex) nearest = qIndex;
      else break;
    }
    if (nearest < 0) nearest = 0;
    imageNo += 1;
    const extension = extname(target) || ".png";
    const filename = `${simId}-q${String(nearest + 1).padStart(2, "0")}-${imageNo}${extension}`;
    writeFileSync(join(assetDir, filename), unzipBuffer(docx, `word/${target}`));
    imagesByQuestion[nearest].push(`/question-assets/${filename}`);
  }
}

const questions: ParsedQuestion[] = raw.map((item, index) => {
  const key = keys[index];
  let answer = key.answer;
  if (item.type === "pg") {
    const letter = key.answer.match(/^([A-E])(?:\b|\s|$)/i)?.[1]?.toUpperCase();
    const optionIndex = letter ? letter.charCodeAt(0) - 65 : -1;
    if (optionIndex < 0 || !item.options?.[optionIndex]) {
      throw new Error(`Kunci pilihan ganda nomor ${index + 1} tidak valid: ${key.answer}`);
    }
    answer = item.options[optionIndex];
  } else if (item.type === "bs") {
    answer = /^benar$/i.test(key.answer) ? "Benar" : "Salah";
	} else {
		// Untuk jawaban seperti "6 roti", input angka "6" tetap dianggap
		// benar. Jawaban lengkap tetap terlihat di pembahasan.
		answer = key.answer.match(/^[-+]?\d+(?:[.,]\d+)?/)?.[0] ?? key.answer;
  }
  return { ...item, answer, discussion: key.discussion, points: key.points, images: imagesByQuestion[index] };
});

const title = `SAS ${subject} Kelas ${grade} Paket ${paket}`;
const statements = [
  `DELETE FROM questions WHERE simulation_id = ${sql(simId)};`,
  `INSERT INTO simulations (id, product_id, subject, grade, paket, title, total_minutes, max_points, created_at) VALUES (${sql(simId)}, ${sql(product)}, ${sql(subject)}, ${grade}, ${sql(paket)}, ${sql(title)}, 60, ${questions.reduce((sum, q) => sum + q.points, 0)}, datetime('now')) ON CONFLICT(id) DO UPDATE SET product_id=excluded.product_id, subject=excluded.subject, grade=excluded.grade, paket=excluded.paket, title=excluded.title, total_minutes=excluded.total_minutes, max_points=excluded.max_points;`
];
questions.forEach((q, index) => {
  statements.push(
    `INSERT INTO questions (chapter_id, simulation_id, type, question, options, image_urls, answer, discussion, subject, grade, points, sort_order) VALUES (NULL, ${sql(simId)}, ${sql(q.type)}, ${sql(q.question)}, ${sql(q.options ? JSON.stringify(q.options) : null)}, ${sql(q.images.length ? JSON.stringify(q.images) : null)}, ${sql(q.answer)}, ${sql(q.discussion)}, ${sql(subject)}, ${grade}, ${q.points}, ${index});`
  );
});

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `-- Dibuat dari ${basename(docx)} oleh import-sas-docx.ts\n${statements.join("\n")}\n`);
console.log(JSON.stringify({ simulation: simId, questions: questions.length, images: imageNo, output }, null, 2));
