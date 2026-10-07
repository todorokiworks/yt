import { groupPhrases, parseVtt, videoIdFromUrl } from "../lib/phrases.mjs";
import { readSaved, writeSaved } from "../lib/saved-videos.mjs";
import { translateToJapanese } from "../lib/translate.mjs";

type SavedVideo = {
  id: string;
  title: string;
  phrases: Array<{ n: number; start: string; end: string; en: string; ja: string }>;
};

export function watchHref(id: string, known: Set<string>): string {
  if (known.has(id)) return `/watch/${id}`;
  return `/watch/saved?id=${encodeURIComponent(id)}`;
}

export async function createVideo(url: string, known: Set<string>, onStatus: (message: string) => void): Promise<string> {
  const id = videoIdFromUrl(url);
  if (known.has(id) || readSaved(id)) return watchHref(id, known);

  onStatus("字幕を取得しています…");
  const response = await fetch("/api/captions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const payload = (await response.json()) as { id?: string; title?: string; vtt?: string; error?: string };
  if (!response.ok || !payload.vtt || !payload.id || !payload.title) {
    throw new Error(payload.error || "字幕を取得できませんでした");
  }

  const phrases = groupPhrases(parseVtt(payload.vtt));
  if (phrases.length === 0) throw new Error("フレーズを作れませんでした");

  for (let index = 0; index < phrases.length; index += 1) {
    onStatus(`翻訳しています… ${index + 1} / ${phrases.length}`);
    phrases[index].ja = await translateToJapanese(phrases[index].en);
  }

  const video: SavedVideo = { id: payload.id, title: payload.title, phrases };
  writeSaved(video);
  return watchHref(video.id, known);
}
