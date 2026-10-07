import fs from "node:fs";
import path from "node:path";

export type Phrase = {
  n: number;
  start: string;
  end: string;
  en: string;
  ja: string;
};

export type Video = {
  id: string;
  title: string;
  phrases: Phrase[];
};

const videoDir = path.join(process.cwd(), "src/data/videos");

export function listVideos(): Video[] {
  if (!fs.existsSync(videoDir)) return [];
  return fs
    .readdirSync(videoDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(fs.readFileSync(path.join(videoDir, name), "utf8")) as Video)
    .sort((a, b) => a.title.localeCompare(b.title, "ja"));
}

export function getVideo(id: string): Video | undefined {
  const file = path.join(videoDir, `${id}.json`);
  if (!fs.existsSync(file)) return undefined;
  return JSON.parse(fs.readFileSync(file, "utf8")) as Video;
}

export function readSrt(id: string): string {
  return fs.readFileSync(path.join(videoDir, `${id}.srt`), "utf8");
}

export { formatClock } from "./phrases.mjs";
