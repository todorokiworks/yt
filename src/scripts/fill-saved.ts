import { formatClock, toSrt } from "../lib/phrases.mjs";
import { readSaved } from "../lib/saved-videos.mjs";
import { startWatch } from "./watch";

type Phrase = {
  n: number;
  start: string;
  end: string;
  en: string;
  ja: string;
};

export function fillSavedWatch(): void {
  const root = document.querySelector<HTMLElement>(".watch");
  const missing = document.querySelector<HTMLElement>("[data-missing]");
  if (!root) return;
  const id = new URLSearchParams(location.search).get("id") ?? "";
  const video = readSaved(id);
  if (!video) {
    root.hidden = true;
    if (missing) missing.hidden = false;
    return;
  }

  root.dataset.videoId = video.id;
  document.title = video.title;
  const title = root.querySelector(".watch-header__title");
  if (title) title.textContent = video.title;
  const count = root.querySelector(".watch-header__count");
  if (count) {
    count.replaceChildren(document.createTextNode(""));
    const pos = document.createElement("span");
    pos.dataset.pos = "";
    pos.textContent = "1";
    count.append(pos, document.createTextNode(` / ${video.phrases.length}`));
  }
  const srt = root.querySelector<HTMLAnchorElement>(".watch-header__srt");
  if (srt) {
    const file = new Blob([toSrt(video.phrases)], { type: "application/x-subrip" });
    srt.href = URL.createObjectURL(file);
    srt.download = `${video.id}.srt`;
  }
  const json = root.querySelector("[data-phrase-json]");
  if (json) json.textContent = JSON.stringify(video.phrases);
  const script = root.querySelector("[data-script]");
  if (script) {
    script.replaceChildren();
    video.phrases.forEach((phrase: Phrase, index: number) => {
      script.append(renderPhrase(phrase, index));
    });
  }
  startWatch(root);
}

function renderPhrase(phrase: Phrase, index: number): HTMLElement {
  const article = document.createElement("article");
  article.className = index === 0 ? "phrase is-current" : "phrase";
  article.dataset.phrase = String(index);

  const meta = document.createElement("div");
  meta.className = "phrase__meta";
  const num = document.createElement("span");
  num.className = "phrase__num";
  num.textContent = String(phrase.n).padStart(2, "0");
  const time = document.createElement("time");
  time.className = "phrase__time";
  time.textContent = formatClock(phrase.start);
  meta.append(num, time);

  const en = document.createElement("p");
  en.className = "phrase__en";
  en.textContent = phrase.en;
  const ja = document.createElement("p");
  ja.className = "phrase__ja";
  ja.textContent = phrase.ja.trim() || "日本語訳は未設定です。";
  article.append(meta, en, ja);
  return article;
}
