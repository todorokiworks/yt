import { attachGloss } from "./gloss";

type Phrase = {
  n: number;
  start: string;
  end: string;
  en: string;
  ja: string;
};

type YouTubePlayer = {
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
  getCurrentTime: () => number;
  getPlayerState: () => number;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement,
        options: {
          videoId: string;
          playerVars: Record<string, number | string>;
          events: { onReady: () => void };
        },
      ) => YouTubePlayer;
      PlayerState: { PLAYING: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

function toSeconds(timestamp: string): number {
  const [hours, minutes, rest] = timestamp.split(":");
  const [seconds, millis] = rest.split(",");
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(millis) / 1000;
}

function loadYouTube(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  return new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
}

export async function startWatch(root: HTMLElement): Promise<void> {
  const videoId = root.dataset.videoId ?? "";
  const phrases = JSON.parse(root.querySelector("[data-phrase-json]")?.textContent || "[]") as Phrase[];
  const script = root.querySelector<HTMLElement>("[data-script]");
  const cards = [...root.querySelectorAll<HTMLElement>("[data-phrase]")];
  const pos = root.querySelector<HTMLElement>("[data-pos]");
  const playerHost = root.querySelector<HTMLElement>("[data-yt]");
  if (!script || !playerHost || phrases.length === 0) return;
  attachGloss(root);

  const storageKey = `yt-phrase:${videoId}`;
  const saved = Number(sessionStorage.getItem(storageKey));
  let current = Number.isInteger(saved) && saved >= 0 && saved < phrases.length ? saved : 0;
  let player: YouTubePlayer | null = null;
  let lockUntil = 0;

  function phraseIndexAt(time: number): number {
    let found = 0;
    for (let index = 0; index < phrases.length; index += 1) {
      if (toSeconds(phrases[index].start) <= time + 0.15) found = index;
      else break;
    }
    return found;
  }

  function reveal(index: number): void {
    const card = cards[index];
    const scriptBox = script.getBoundingClientRect();
    const cardBox = card.getBoundingClientRect();
    const outside = cardBox.top < scriptBox.top + 8 || cardBox.bottom > scriptBox.bottom - 8;
    if (outside) card.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function show(index: number, seek: boolean): void {
    current = Math.max(0, Math.min(phrases.length - 1, index));
    cards.forEach((card, cardIndex) => {
      card.classList.toggle("is-current", cardIndex === current);
    });
    if (pos) pos.textContent = String(current + 1);
    sessionStorage.setItem(storageKey, String(current));
    reveal(current);
    if (!seek || !player) return;
    player.seekTo(toSeconds(phrases[current].start), true);
    player.playVideo();
    lockUntil = Date.now() + 1500;
  }

  root.querySelector("[data-prev]")?.addEventListener("click", () => show(current - 1, true));
  root.querySelector("[data-next]")?.addEventListener("click", () => show(current + 1, true));
  cards.forEach((card) => {
    card.addEventListener("click", (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".phrase__word")) return;
      show(Number(card.dataset.phrase), true);
    });
  });
  document.addEventListener("keydown", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.closest(".phrase__word"))) return;
    if (event.key === "ArrowDown" || event.key === "ArrowRight" || event.key === "j") {
      event.preventDefault();
      show(current + 1, true);
    }
    if (event.key === "ArrowUp" || event.key === "ArrowLeft" || event.key === "k") {
      event.preventDefault();
      show(current - 1, true);
    }
  });

  show(current, false);
  await loadYouTube();
  if (!window.YT) return;
  player = new window.YT.Player(playerHost, {
    videoId,
    playerVars: { rel: 0, playsinline: 1 },
    events: {
      onReady: () => {
        window.setInterval(() => {
          if (!player || Date.now() < lockUntil) return;
          if (player.getPlayerState() !== window.YT?.PlayerState.PLAYING) return;
          const next = phraseIndexAt(player.getCurrentTime());
          if (next !== current) show(next, false);
        }, 400);
      },
    },
  });
}
