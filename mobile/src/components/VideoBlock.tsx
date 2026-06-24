import VideoPlayer from "./funcionais/VideoPlayer";

export function VideoBlock({ payload }: { payload: { url: string } }) {
  return <VideoPlayer url={payload.url} />;
}
