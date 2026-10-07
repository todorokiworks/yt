const CLIENTS = ["gtx", "dict-chrome-ex"];
let skipGtx = false;

export async function translateToJapanese(text, signal) {
  let lastStatus = 0;
  const clients = skipGtx ? CLIENTS.filter((client) => client !== "gtx") : CLIENTS;
  for (const client of clients) {
    const url = new URL("https://translate.googleapis.com/translate_a/single");
    url.searchParams.set("client", client);
    url.searchParams.set("sl", "en");
    url.searchParams.set("tl", "ja");
    url.searchParams.set("dt", "t");
    url.searchParams.set("q", text);
    const response = await fetch(url, signal ? { signal } : undefined);
    if (response.status === 429) {
      lastStatus = 429;
      if (client === "gtx") skipGtx = true;
      continue;
    }
    if (!response.ok) throw new Error(`翻訳に失敗しました: ${response.status}`);
    const payload = await response.json();
    const translated = payload?.[0]?.map((part) => part[0]).join("").trim();
    if (!translated) throw new Error("翻訳結果が空です");
    return translated;
  }
  throw new Error(`翻訳に失敗しました: ${lastStatus || 429}`);
}
