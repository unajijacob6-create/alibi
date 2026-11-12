// Parse caption lines that mark grabbable words as [[word]].

export interface ParsedLine {
  /** Text with markers removed. */
  text: string;
  /** Marked words with their positions in `text`. */
  marks: { text: string; start: number; end: number }[];
  /** Problems found while parsing, e.g. an unclosed marker. */
  errors: string[];
}

const SINGLE_WORD = /^[\p{L}\p{N}][\p{L}\p{N}'’-]*$/u;

export function parseLine(raw: string): ParsedLine {
  const marks: ParsedLine["marks"] = [];
  const errors: string[] = [];
  let text = "";
  let i = 0;
  while (i < raw.length) {
    const open = raw.indexOf("[[", i);
    if (open === -1) {
      text += raw.slice(i);
      break;
    }
    text += raw.slice(i, open);
    const close = raw.indexOf("]]", open + 2);
    if (close === -1) {
      errors.push(`unclosed [[ in: ${raw}`);
      text += raw.slice(open + 2);
      break;
    }
    const word = raw.slice(open + 2, close).trim();
    if (!SINGLE_WORD.test(word)) {
      errors.push(`marked text must be one word, got "${word}"`);
    }
    marks.push({ text: word, start: text.length, end: text.length + word.length });
    text += word;
    i = close + 2;
  }
  if (text.includes("]]") || text.includes("[[")) {
    errors.push(`stray bracket in: ${raw}`);
  }
  return { text, marks, errors };
}
