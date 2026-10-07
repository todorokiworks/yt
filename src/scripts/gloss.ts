import { translateToJapanese } from "../lib/translate.mjs";

const WORD = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g;
const cache = new Map<string, string>();

type Gesture = {
  pointerId: number;
  line: HTMLElement;
  start: number;
  end: number;
  x: number;
  y: number;
  mode: "pending" | "drag" | "scroll";
};

export function attachGloss(root: HTMLElement): void {
  const popup = root.querySelector<HTMLElement>("[data-gloss]");
  const term = root.querySelector<HTMLElement>("[data-gloss-term]");
  const meaning = root.querySelector<HTMLElement>("[data-gloss-meaning]");
  const script = root.querySelector<HTMLElement>("[data-script]");
  if (!popup || !term || !meaning || !script) return;

  root.querySelectorAll<HTMLElement>(".phrase__en").forEach(renderWords);

  let gesture: Gesture | null = null;
  let glossClick = false;
  let requestSeq = 0;
  let controller: AbortController | null = null;

  function wordsIn(line: HTMLElement): HTMLButtonElement[] {
    return [...line.querySelectorAll<HTMLButtonElement>(".phrase__word")];
  }

  function close(): void {
    requestSeq += 1;
    controller?.abort();
    controller = null;
    popup.hidden = true;
    script.querySelectorAll(".phrase__word.is-picked").forEach((word) => {
      word.classList.remove("is-picked");
    });
    script.querySelectorAll(".phrase__en.is-glossing").forEach((line) => {
      line.classList.remove("is-glossing");
    });
  }

  function paint(line: HTMLElement, from: number, to: number): void {
    const low = Math.min(from, to);
    const high = Math.max(from, to);
    script.querySelectorAll<HTMLElement>(".phrase__en").forEach((other) => {
      if (other !== line) other.classList.remove("is-glossing");
    });
    script.querySelectorAll<HTMLButtonElement>(".phrase__word").forEach((word) => {
      if (!line.contains(word)) word.classList.remove("is-picked");
    });
    wordsIn(line).forEach((word, index) => {
      word.classList.toggle("is-picked", index >= low && index <= high);
    });
  }

  function place(): void {
    const picked = [...script.querySelectorAll<HTMLElement>(".phrase__word.is-picked")];
    if (picked.length === 0) {
      popup.hidden = true;
      return;
    }
    const scriptBox = script.getBoundingClientRect();
    const first = picked[0].getBoundingClientRect();
    const last = picked[picked.length - 1].getBoundingClientRect();
    const visible = first.bottom > scriptBox.top + 4 && last.top < scriptBox.bottom - 4;
    if (!visible) {
      popup.hidden = true;
      return;
    }

    popup.hidden = false;
    const margin = 8;
    const navHeight = root.querySelector(".watch-nav")?.getBoundingClientRect().height ?? 0;
    const limitBottom = window.innerHeight - navHeight - margin;
    const popH = popup.offsetHeight;
    const popW = popup.offsetWidth;
    const above = first.top - popH - margin;
    const below = last.bottom + margin;
    const aboveFits = above >= Math.max(margin, scriptBox.top);
    let top = aboveFits ? above : below;
    if (top + popH > limitBottom) top = Math.max(margin, limitBottom - popH);
    let left = first.left;
    if (left + popW > window.innerWidth - margin) left = window.innerWidth - margin - popW;
    if (left < margin) left = margin;
    popup.style.left = `${Math.round(left)}px`;
    popup.style.top = `${Math.round(top)}px`;
  }

  async function lookup(line: HTMLElement, from: number, to: number): Promise<void> {
    paint(line, from, to);
    const text = wordsIn(line)
      .slice(Math.min(from, to), Math.max(from, to) + 1)
      .map((word) => word.textContent ?? "")
      .join(" ");
    term.textContent = text;
    const key = text.toLocaleLowerCase();
    const known = cache.get(key);
    meaning.textContent = known ?? "調べています…";
    place();
    if (known) return;

    const seq = ++requestSeq;
    controller?.abort();
    controller = new AbortController();
    try {
      const translated = await translateToJapanese(text, controller.signal);
      cache.set(key, translated);
      if (seq !== requestSeq) return;
      meaning.textContent = translated;
      place();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (seq !== requestSeq) return;
      meaning.textContent = "意味を取得できませんでした";
      place();
    }
  }

  function wordFromPoint(x: number, y: number, line: HTMLElement): HTMLButtonElement | null {
    const hit = document.elementFromPoint(x, y);
    const word = hit instanceof Element ? hit.closest<HTMLButtonElement>(".phrase__word") : null;
    if (!word || !line.contains(word)) return null;
    return word;
  }

  script.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const word = event.target instanceof Element ? event.target.closest<HTMLButtonElement>(".phrase__word") : null;
    const line = word?.closest<HTMLElement>(".phrase__en");
    if (!word || !line) return;
    const index = wordsIn(line).indexOf(word);
    if (index < 0) return;
    glossClick = true;
    window.setTimeout(() => {
      glossClick = false;
    }, 500);
    gesture = { pointerId: event.pointerId, line, start: index, end: index, x: event.clientX, y: event.clientY, mode: "pending" };
  });

  script.addEventListener(
    "pointermove",
    (event) => {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      const dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;
      if (gesture.mode === "pending") {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          gesture.mode = "scroll";
          return;
        }
        gesture.mode = "drag";
        gesture.line.classList.add("is-glossing");
        popup.hidden = true;
        script.setPointerCapture(event.pointerId);
      }
      if (gesture.mode !== "drag") return;
      event.preventDefault();
      const hit = wordFromPoint(event.clientX, event.clientY, gesture.line);
      if (!hit) return;
      const index = wordsIn(gesture.line).indexOf(hit);
      if (index < 0 || index === gesture.end) return;
      gesture.end = index;
      paint(gesture.line, gesture.start, gesture.end);
    },
    { passive: false },
  );

  script.addEventListener("pointerup", (event) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const current = gesture;
    gesture = null;
    current.line.classList.remove("is-glossing");
    if (current.mode === "scroll") return;
    let start = current.start;
    let end = current.end;
    if (event.shiftKey) {
      const picked = wordsIn(current.line).flatMap((word, index) => (word.classList.contains("is-picked") ? [index] : []));
      if (picked.length > 0) {
        start = Math.min(...picked, end);
        end = Math.max(...picked, end);
      }
    }
    void lookup(current.line, start, end);
  });

  script.addEventListener("pointercancel", () => {
    gesture = null;
    script.querySelectorAll(".phrase__en.is-glossing").forEach((line) => line.classList.remove("is-glossing"));
  });

  script.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      const onWord = target instanceof Element && Boolean(target.closest(".phrase__word"));
      if (!glossClick && !onWord) return;
      event.stopPropagation();
      glossClick = false;
      if (event.detail !== 0 || !(target instanceof Element)) return;
      const word = target.closest<HTMLButtonElement>(".phrase__word");
      const line = word?.closest<HTMLElement>(".phrase__en");
      if (!word || !line) return;
      const index = wordsIn(line).indexOf(word);
      if (index >= 0) void lookup(line, index, index);
    },
    true,
  );

  document.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest(".phrase__word, [data-gloss]")) return;
    close();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });

  script.addEventListener("scroll", () => place(), { passive: true });
  window.addEventListener("resize", () => place());
}

function renderWords(line: HTMLElement): void {
  if (line.querySelector(".phrase__word")) return;
  const text = line.textContent ?? "";
  const fragment = document.createDocumentFragment();
  let cursor = 0;
  for (const match of text.matchAll(WORD)) {
    const index = match.index ?? 0;
    if (index > cursor) fragment.append(text.slice(cursor, index));
    const button = document.createElement("button");
    button.type = "button";
    button.className = "phrase__word";
    button.textContent = match[0];
    fragment.append(button);
    cursor = index + match[0].length;
  }
  if (cursor < text.length) fragment.append(text.slice(cursor));
  line.replaceChildren(fragment);
}
