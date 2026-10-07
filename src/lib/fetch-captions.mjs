import { videoIdFromUrl } from "./phrases.mjs";

const ANDROID_KEY = "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w";
const ANDROID_VERSION = "20.10.38";
const ANDROID_AGENT = `com.google.android.youtube/${ANDROID_VERSION} (Linux; U; Android 11) gzip`;

export async function fetchCaptions(input) {
  const id = videoIdFromUrl(input);
  const player = await request(`https://www.youtube.com/youtubei/v1/player?prettyPrint=false&key=${ANDROID_KEY}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": ANDROID_AGENT,
      "X-YouTube-Client-Name": "3",
      "X-YouTube-Client-Version": ANDROID_VERSION,
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: "ANDROID",
          clientVersion: ANDROID_VERSION,
          androidSdkVersion: 30,
          hl: "en",
          gl: "US",
        },
      },
      videoId: id,
    }),
  });
  if (!player.ok) throw new Error("動画情報を取得できませんでした");
  const data = await player.json();
  const title = data.videoDetails?.title?.trim();
  if (!title) throw new Error("動画情報を取得できませんでした");
  const tracks = data.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  const track = pickTrack(tracks);
  if (!track?.baseUrl) throw new Error("英語の自動字幕がありません");
  const captionUrl = new URL(track.baseUrl);
  captionUrl.searchParams.set("fmt", "vtt");
  const captions = await request(captionUrl, { headers: { "User-Agent": ANDROID_AGENT } });
  const vtt = await captions.text();
  if (!captions.ok || !vtt.includes("-->")) throw new Error("英語の自動字幕がありません");
  return { id, title, vtt };
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
