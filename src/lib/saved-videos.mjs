const indexKey = "yt-saved-index";

export function listSaved() {
  return readIndex()
    .map((id) => readSaved(id))
    .filter(Boolean);
}

export function readSaved(id) {
  if (!id) return null;
  const raw = localStorage.getItem(storageKey(id));
  if (!raw) return null;
  try {
    const video = JSON.parse(raw);
    if (!video?.id || !Array.isArray(video.phrases)) return null;
    return video;
  } catch {
    return null;
  }
}

export function writeSaved(video) {
  localStorage.setItem(storageKey(video.id), JSON.stringify(video));
  const ids = readIndex().filter((id) => id !== video.id);
  localStorage.setItem(indexKey, JSON.stringify([video.id, ...ids]));
}

function storageKey(id) {
  return `yt-saved:${id}`;
}

function readIndex() {
  try {
    const ids = JSON.parse(localStorage.getItem(indexKey) || "[]");
    return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}
