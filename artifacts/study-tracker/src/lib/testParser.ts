/** Parsed answer-key option */
export interface ParsedOption {
  /** 'a', 'b', 'c', 'd' — or '' when the question has no option labels */
  label: string;
  text: string;
}

/** One parsed question with its options and the correct answer resolved */
export interface ParsedQuestion {
  number: number;
  questionText: string;
  options: ParsedOption[];
  /** Raw answer text for this question number from the answer block */
  correctAnswerText: string;
  /** Index into `options[]` that matches the answer, or -1 if not determinable */
  correctOptionIndex: number;
}

/**
 * Parse a raw question block + answer block into structured questions.
 *
 * Question block format (flexible):
 *   1. Question text?
 *   a) Option A
 *   b) Option B        ← options can be on the same or separate lines; label optional
 *
 * Answer block format (flexible):
 *   1. c) 1947         ← with option label
 *   2. শাহজাহান        ← without option label (matched by text)
 */
export function parseTestContent(
  questionText: string,
  answerText: string
): ParsedQuestion[] {
  // ── Build answer map: question-number → raw answer string ──────────────────
  const answerMap: Record<number, string> = {};
  for (const line of answerText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Match: "1. c) 1947"  or  "1) c) 1947"  or  "1. 1947"
    const m = trimmed.match(/^(\d+)[.):]?\s+(.+)/);
    if (m) {
      answerMap[parseInt(m[1], 10)] = m[2].trim();
    }
  }

  // ── Split question text into per-question blocks ───────────────────────────
  // Split on lines that start a new question number ("1.", "2)", etc.)
  const blocks = questionText
    .split(/(?=^\s*\d+[.)]\s)/m)
    .map(b => b.trim())
    .filter(b => b && /^\d+/.test(b));

  const result: ParsedQuestion[] = [];

  for (const block of blocks) {
    const rawLines = block.split('\n').map(l => l.trim()).filter(l => l);
    if (!rawLines.length) continue;

    // First line: "1. Question text?" or "1) Question text?"
    const numMatch = rawLines[0].match(/^(\d+)[.)]\s*(.*)/);
    if (!numMatch) continue;

    const qNum = parseInt(numMatch[1], 10);
    const questionLine = numMatch[2].trim();

    // ── Extract options ──────────────────────────────────────────────────────
    // Options can be:
    //   a) text    a. text    A) text    — labelled
    //   just plain text lines           — unlabelled
    // We also handle everything after the question on separate lines until
    // the next question number.
    const options: ParsedOption[] = [];
    let qTextContinuation = questionLine;

    for (const line of rawLines.slice(1)) {
      // Labelled option: a) / a. / A) / A.
      const optMatch = line.match(/^([a-dA-D])[).]\s+(.+)/);
      if (optMatch) {
        options.push({ label: optMatch[1].toLowerCase(), text: optMatch[2].trim() });
        continue;
      }
      // If no options collected yet and this line doesn't look like an option,
      // treat it as continuation of the question text.
      if (options.length === 0 && !/^\d+[.)]/.test(line)) {
        qTextContinuation += ' ' + line;
        continue;
      }
      // Unlabelled option line
      if (!/^\d+[.)]/.test(line)) {
        options.push({ label: '', text: line.trim() });
      }
    }

    // ── Resolve correct option ───────────────────────────────────────────────
    const correctAnswerRaw = answerMap[qNum] ?? '';
    let correctOptionIndex = -1;

    if (correctAnswerRaw && options.length > 0) {
      // Try label match first: "c) 1947" or "c. 1947"
      const labelMatch = correctAnswerRaw.match(/^([a-dA-D])[).]\s*(.*)/);
      if (labelMatch) {
        const label = labelMatch[1].toLowerCase();
        const idx = options.findIndex(o => o.label === label);
        if (idx !== -1) {
          correctOptionIndex = idx;
        } else {
          // Label not in options (unlabelled options) — fall through to text match
          const content = (labelMatch[2] || correctAnswerRaw).toLowerCase().trim();
          correctOptionIndex = findByText(options, content);
        }
      } else {
        // No label prefix — match by text content
        correctOptionIndex = findByText(options, correctAnswerRaw.toLowerCase().trim());
      }
    }

    result.push({
      number: qNum,
      questionText: qTextContinuation.trim(),
      options,
      correctAnswerText: correctAnswerRaw,
      correctOptionIndex,
    });
  }

  return result.sort((a, b) => a.number - b.number);
}

/** Find option index by fuzzy text match (handles partial contains). */
function findByText(options: ParsedOption[], needle: string): number {
  if (!needle) return -1;
  // Exact match first
  let idx = options.findIndex(o => o.text.toLowerCase() === needle);
  if (idx !== -1) return idx;
  // Contains match
  idx = options.findIndex(o =>
    o.text.toLowerCase().includes(needle) || needle.includes(o.text.toLowerCase())
  );
  return idx;
}
