import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { groupPhrases, parseVtt, toSrt, videoIdFromUrl } from "../src/lib/phrases.mjs";
import { translateToJapanese } from "../src/lib/translate.mjs";

const videoDir = path.resolve("src/data/videos");

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

async function translatePhrases(phrases) {
  const translated = [];
  for (const phrase of phrases) {
    translated.push({ ...phrase, ja: await translateToJapanese(phrase.en) });
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
  fs.writeFileSync(srtPath, toSrt(video.phrases));
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
