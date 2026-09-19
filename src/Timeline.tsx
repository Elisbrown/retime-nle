import * as React from "react";
import { Sequence } from "remotion";
import type { Clip } from "./types";

export type ReTimeTrackProps = {
  clips: Clip[];
  renderClip?: (clip: Clip, index: number) => React.ReactNode;
};

/**
 * Declarative timeline. The same `clips` array is passed to
 * exportTimeline() / ReTimeExportButtons, so render output and
 * exported NLE XML can never drift apart. No AST parsing needed.
 */
export const ReTimeTrack: React.FC<ReTimeTrackProps> = ({
  clips,
  renderClip,
}) => {
  return (
    <>
      {clips.map((clip, i) => (
        <Sequence
          key={`${clip.src}-${clip.from}-${i}`}
          from={clip.from}
          durationInFrames={clip.durationInFrames}
        >
          {renderClip ? (
            renderClip(clip, i)
          ) : (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video src={clip.src} />
          )}
        </Sequence>
      ))}
    </>
  );
};
