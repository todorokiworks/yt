import { videoIdFromUrl } from "./phrases.mjs";

const PLAYER_ENDPOINTS = [
  "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
  "https://youtubei.googleapis.com/youtubei/v1/player?prettyPrint=false",
];

const CLIENTS = [
  {
    name: "ANDROID",
    version: "21.26.364",
    id: "3",
    agent: "com.google.android.youtube/21.26.364 (Linux; U; Android 11) gzip",
    client: {
      androidSdkVersion: 30,
      osName: "Android",
      osVersion: "11",
    },
  },
  {
    name: "IOS",
    version: "21.26.4",
    id: "5",
    agent: "com.google.ios.youtube/21.26.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)",
    client: {
      deviceMake: "Apple",
      deviceModel: "iPhone16,2",
      osName: "iPhone",
      osVersion: "18.3.2.22D82",
    },
  },
];

export async function fetchCaptions(input) {
  const id = videoIdFromUrl(input);
  const session = await loadSession();
  let sawTitle = false;

  for (const client of CLIENTS) {
    const result = await readPlayer(client, id, session);
    if (!result) continue;
    sawTitle = true;
    if (result.vtt) return { id, title: result.title, vtt: result.vtt };
  }

  if (session) {
    for (const client of CLIENTS) {
      const result = await readPlayer(client, id, null);
      if (!result) continue;
      sawTitle = true;
      if (result.vtt) return { id, title: result.title, vtt: result.vtt };
    }
  }

  throw new Error(sawTitle ? "英語の自動字幕がありません" : "動画情報を取得できませんでした");
}

async function loadSession() {
  try {
    const response = await fetch("https://www.youtube.com/sw.js_data", {
      headers: { "User-Agent": CLIENTS[0].agent },
    });
    if (!response.ok) return null;
    const raw = await response.text();
    const visitor = visitorFrom(raw);
    const cookies = cookieHeader(response);
    if (!visitor && !cookies) return null;
    return { visitor, cookies };
  } catch {
    return null;
  }
}

function visitorFrom(raw) {
  const text = raw.replace(/^\)\]\}'\s*/, "");
  try {
    const json = JSON.parse(text);
    const found = [];
    const walk = (value) => {
      if (typeof value === "string" && value.startsWith("Cgt") && value.length > 80) found.push(value);
      else if (Array.isArray(value)) value.forEach(walk);
    };
    walk(json);
    if (found[0]) return found[0];
  } catch {
    // Fall through to a text search when the payload is not JSON.
  }
  return text.match(/Cgt[A-Za-z0-9+/=_-]{80,}/)?.[0] ?? "";
}

function cookieHeader(response) {
  const list = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  if (list.length > 0) return list.map((cookie) => cookie.split(";")[0]).join("; ");
  return response.headers.get("set-cookie") ?? "";
}

async function readPlayer(client, id, session) {
  const headers = {
    "Content-Type": "application/json",
    "User-Agent": client.agent,
    "X-YouTube-Client-Name": client.id,
    "X-YouTube-Client-Version": client.version,
  };
  if (session?.visitor) headers["X-Goog-Visitor-Id"] = session.visitor;
  if (session?.cookies) headers.Cookie = session.cookies;

  const body = JSON.stringify({
    context: {
      client: {
        clientName: client.name,
        clientVersion: client.version,
        userAgent: client.agent,
        hl: "en",
        gl: "US",
        ...client.client,
        ...(session?.visitor ? { visitorData: session.visitor } : {}),
      },
    },
    videoId: id,
    contentCheckOk: true,
    racyCheckOk: true,
  });
  let titled = null;
  for (const endpoint of PLAYER_ENDPOINTS) {
    const result = await readEndpoint(endpoint, headers, body, client, session);
    if (!result) continue;
    if (result.vtt) return result;
    titled = result;
  }
  return titled;
}

async function readEndpoint(endpoint, headers, body, client, session) {
  const response = await request(endpoint, { method: "POST", headers, body });
  if (!response.ok) return null;
  const data = await response.json().catch(() => null);
  const title = data?.videoDetails?.title?.trim();
  if (!title) return null;
  const track = pickTrack(data.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []);
  if (!track?.baseUrl) return { title, vtt: "" };

  const captionUrl = new URL(track.baseUrl);
  captionUrl.searchParams.set("fmt", "vtt");
  const captions = await request(captionUrl, {
    headers: {
      "User-Agent": client.agent,
      ...(session?.cookies ? { Cookie: session.cookies } : {}),
    },
  });
  const vtt = await captions.text();
  if (!captions.ok || !vtt.includes("-->")) return { title, vtt: "" };
  return { title, vtt };
}

async function request(url, options) {
  try {
    return await fetch(url, options);
  } catch {
    throw new Error("字幕を取得できませんでした");
  }
}

function pickTrack(tracks) {
  const english = tracks.filter((track) => track.languageCode === "en" || track.languageCode === "en-orig" || String(track.vssId ?? "").includes(".en"));
  return (
    english.find((track) => track.vssId === "a.en-orig" || track.languageCode === "en-orig") ||
    english.find((track) => track.kind === "asr" || String(track.vssId ?? "").startsWith("a.")) ||
    english[0] ||
    null
  );
}
