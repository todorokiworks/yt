import { fetchCaptions } from "../../src/lib/fetch-captions.mjs";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  try {
    const { url } = JSON.parse(event.body || "{}");
    const data = await fetchCaptions(url);
    return json(200, data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "字幕を取得できませんでした";
    return json(400, { error: message });
  }
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
}
