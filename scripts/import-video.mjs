import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TARGET_WORDS = 28;
const MAX_WORDS = 40;
const videoDir = path.resolve("src/data/videos");

function words(text) {
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

function videoIdFromUrl(input) {
  const url = new URL(input);
  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0];
  const watchId = url.searchParams.get("v");
  if (watchId) return watchId;
  const embed = url.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/);
  if (embed) return embed[1];
  throw new Error("YouTube の URL ではありません");
}

function normalizeTime(value) {
  const match = value.trim().match(/^(\d{2}):(\d{2}):(\d{2})[.,](\d{3})/);
  if (!match) return value.trim();
  return `${match[1]}:${match[2]}:${match[3]},${match[4]}`;
}

function parseVtt(text) {
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

function groupPhrases(cues) {
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

function ytDlp() {
  if (process.env.YT_DLP) return process.env.YT_DLP;
  return "yt-dlp";
}

function runYtDlp(args) {
  return execFileSync(ytDlp(), args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

function downloadSubtitles(videoId, directory) {
  const output = path.join(directory, "%(id)s.%(ext)s");
  for (const language of ["en-orig", "en"]) {
    try {
      runYtDlp([
        "--write-auto-subs",
        "--sub-langs",
        language,
        "--sub-format",
        "vtt",
        "--skip-download",
        "-o",
        output,
        `https://www.youtube.com/watch?v=${videoId}`,
      ]);
    } catch {
      continue;
    }
    const file = fs.readdirSync(directory).find((name) => name.includes(videoId) && name.endsWith(".vtt"));
    if (file) return path.join(directory, file);
  }
  throw new Error("英語の自動字幕がありません");
}

async function translate(text) {
  const endpoint = "https://translate.googleapis.com/translate_a/single";
  const url = new URL(endpoint);
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", "en");
  url.searchParams.set("tl", "ja");
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", text);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`翻訳に失敗しました: ${response.status}`);
  const payload = await response.json();
  const translated = payload?.[0]?.map((part) => part[0]).join("");
  if (!translated) throw new Error("翻訳結果が空です");
  return translated;
}

async function translatePhrases(phrases) {
  const translated = [];
  for (const phrase of phrases) {
    translated.push({ ...phrase, ja: await translate(phrase.en) });
    process.stdout.write(`\r翻訳 ${translated.length}/${phrases.length}`);
  }
  process.stdout.write("\n");
  return translated;
}

function writeVideo(video) {
  fs.mkdirSync(videoDir, { recursive: true });
  const jsonPath = path.join(videoDir, `${video.id}.json`);
  const srtPath = path.join(videoDir, `${video.id}.srt`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(video, null, 2)}\n`);
  const cues = video.phrases.map((phrase) => `${phrase.n}\n${phrase.start} --> ${phrase.end}\n${phrase.en}\n${phrase.ja}\n`);
  fs.writeFileSync(srtPath, `${cues.join("\n")}\n`);
}

const url = process.argv[2];
const rebuild = process.argv.includes("--rebuild");
if (!url) {
  console.error("usage: node scripts/import-video.mjs <youtube-url> [--rebuild]");
  process.exit(1);
}

const id = videoIdFromUrl(url);
const jsonPath = path.join(videoDir, `${id}.json`);
if (fs.existsSync(jsonPath) && !rebuild) {
  console.log(`保存済みです: ${id}`);
  process.exit(0);
}

const title = runYtDlp(["--print", "%(title)s", "--skip-download", `https://www.youtube.com/watch?v=${id}`]).trim();
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "yt-subs-"));
try {
  const vttPath = downloadSubtitles(id, temporary);
  const cues = parseVtt(fs.readFileSync(vttPath, "utf8"));
  const grouped = groupPhrases(cues);
  if (grouped.length === 0) throw new Error("フレーズを作れませんでした");
  const phrases = await translatePhrases(grouped);
  writeVideo({ id, title, phrases });
  console.log(`書き出しました: ${id} (${phrases.length} フレーズ)`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
