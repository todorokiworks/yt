import type { APIRoute } from "astro";
import { listVideos, readSrt } from "../../lib/videos";

export function getStaticPaths() {
  return listVideos().map((video) => ({ params: { id: video.id } }));
}

export const GET: APIRoute = ({ params }) => {
  const id = params.id ?? "";
  return new Response(readSrt(id), {
    headers: {
      "Content-Type": "application/x-subrip; charset=utf-8",
      "Content-Disposition": `attachment; filename="${id}.srt"`,
    },
  });
};
