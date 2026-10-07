const TARGET_WORDS = 28;
const MAX_WORDS = 40;

export function words(text) {
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

export function videoIdFromUrl(input) {
  const trimmed = String(input ?? "").trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new Error("YouTube の URL ではありません");
  }
  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    if (id) return id;
  }
  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    const watchId = url.searchParams.get("v");
    if (watchId) return watchId;
    const embed = url.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/);
    if (embed) return embed[1];
  }
  throw new Error("YouTube の URL ではありません");
}

export function formatClock(timestamp) {
  const [hours, minutes, rest] = timestamp.split(":");
  const seconds = rest.split(",")[0];
  if (hours === "00") return `${minutes}:${seconds}`;
  return `${Number(hours)}:${minutes}:${seconds}`;
}

export function toSrt(phrases) {
  return `${phrases
    .map((phrase) => `${phrase.n}\n${phrase.start} --> ${phrase.end}\n${phrase.en}\n${phrase.ja}\n`)
    .join("\n")}\n`;
}

export function parseVtt(text) {
  const lines = text.split(/\r?\n/);
  const timestamp = /^(\d{2}:\d{2}:\d{2}[.,]\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}[.,]\d{3})/;
  const tag = /<[^>]+>/g;
  const cues = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].trim().match(timestamp);
    if (!match) continue;
    const startMs = toMs(match[1]);
    const endMs = toMs(match[2]);
    index += 1;
    const body = [];
    while (index < lines.length && !timestamp.test(lines[index].trim())) {
      const cleaned = decode(lines[index].replace(tag, "")).replace(/\s+/g, " ").trim();
      if (cleaned && !cleaned.startsWith("WEBVTT") && !cleaned.startsWith("Kind:") && !cleaned.startsWith("Language:")) {
        body.push(cleaned);
      }
      index += 1;
    }
    index -= 1;
    if (endMs - startMs < 20 || body.length === 0) continue;
    cues.push({
      start: normalizeTime(match[1]),
      end: normalizeTime(match[2]),
      text: body.at(-1),
    });
  }
  return cues;
}

export function groupPhrases(cues) {
  const phrases = [];
  let pending = [];
  let rest = "";
  let start = null;
  let end = null;

  function flush() {
    const en = pending.join(" ").replace(/\s+/g, " ").trim();
    if (en) phrases.push({ start, end, en });
    pending = [];
    start = null;
  }

  function pushPiece(piece, cueStart, cueEnd) {
    for (const chunk of splitLong(piece)) {
      if (pending.length && words(pending.join(" ")) + words(chunk) > MAX_WORDS) flush();
      if (!start) start = cueStart;
      pending.push(chunk);
      end = cueEnd;
      const total = words(pending.join(" "));
      const isQuestion = /\?["']?$/.test(chunk);
      if (total >= TARGET_WORDS && !isQuestion) flush();
      else if (total >= 18 && isQuestion) flush();
    }
  }

  for (const cue of cues) {
    const speaker = /^>>/.test(cue.text.trim());
    const piece = cue.text.replace(/>>/g, " ").replace(/\s+/g, " ").trim();
    if (!piece) continue;
    if (speaker && !rest && pending.length && words(pending.join(" ")) >= 8) flush();
    if (!start) start = cue.start;
    const combined = [rest, piece].filter(Boolean).join(" ");
    const taken = takeSentences(combined);
    rest = taken.rest;
    for (const sentence of taken.parts) pushPiece(sentence, cue.start, cue.end);
    end = cue.end;
  }
  if (rest) pushPiece(rest, start, end);
  flush();

  const merged = [];
  for (const phrase of phrases) {
    const previous = merged.at(-1);
    const short = words(phrase.en) <= 5 && !/\?["']?$/.test(phrase.en);
    if (previous && short && words(previous.en) + words(phrase.en) <= 36) {
      previous.en = `${previous.en} ${phrase.en}`;
      previous.end = phrase.end;
    } else {
      merged.push({ ...phrase });
    }
  }
  return merged.map((phrase, index) => ({
    n: index + 1,
    start: phrase.start,
    end: phrase.end,
    en: phrase.en,
    ja: "",
  }));
}

function normalizeTime(value) {
  const match = value.trim().match(/^(\d{2}):(\d{2}):(\d{2})[.,](\d{3})/);
  if (!match) return value.trim();
  return `${match[1]}:${match[2]}:${match[3]},${match[4]}`;
}

function toMs(timestamp) {
  const match = timestamp.match(/(\d{2}):(\d{2}):(\d{2})[.,](\d{3})/);
  return ((Number(match[1]) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000 + Number(match[4]);
}

function decode(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ");
}

function takeSentences(text) {
  const parts = [];
  const re = /[.!?]["']?(?=\s|$)/g;
  let last = 0;
  let match;
  while ((match = re.exec(text))) {
    const sentence = text.slice(last, match.index + match[0].length).trim();
    if (sentence) parts.push(sentence);
    last = match.index + match[0].length;
  }
  return { parts, rest: text.slice(last).trim() };
}

function splitLong(sentence, maxWords = 34) {
  if (words(sentence) <= maxWords) return [sentence];
  const chunks = [];
  let rest = sentence;
  while (words(rest) > maxWords) {
    const tokens = rest.split(/\s+/);
    const window = tokens.slice(0, maxWords).join(" ");
    const conjunctions = [...window.matchAll(/,\s+(?:and|but|so|because|which|when|where)\b/gi)];
    const commas = [...window.matchAll(/,\s+/g)];
    const use = conjunctions.at(-1) || commas.at(-1);
    if (use && words(window.slice(0, use.index)) >= 12) {
      chunks.push(rest.slice(0, use.index + use[0].length).trim().replace(/,\s*$/, ""));
      rest = rest.slice(use.index + use[0].length).trim();
      continue;
    }
    chunks.push(tokens.slice(0, maxWords).join(" "));
    rest = tokens.slice(maxWords).join(" ");
  }
  if (rest) chunks.push(rest);
  return chunks;
}
