import fs from "node:fs";
import path from "node:path";
import { fetchCaptions } from "../src/lib/fetch-captions.mjs";
import { groupPhrases, parseVtt, toSrt, videoIdFromUrl } from "../src/lib/phrases.mjs";
import { translateToJapanese } from "../src/lib/translate.mjs";

const videoDir = path.resolve("src/data/videos");

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

const { title, vtt } = await fetchCaptions(url);
const grouped = groupPhrases(parseVtt(vtt));
if (grouped.length === 0) throw new Error("フレーズを作れませんでした");
const phrases = await translatePhrases(grouped);
writeVideo({ id, title, phrases });
console.log(`書き出しました: ${id} (${phrases.length} フレーズ)`);
