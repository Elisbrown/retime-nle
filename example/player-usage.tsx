import * as React from "react";
import { Player } from "@remotion/player";
import { ReTimeExportButtons, ReTimeTrack } from "retime-nle/react";
import type { Clip } from "retime-nle";

const clips: Clip[] = [
  { src: "static/intro.mp4", from: 0, durationInFrames: 90 },
  { src: "static/main.mp4", from: 90, durationInFrames: 150 },
];

const MyComp: React.FC = () => <ReTimeTrack clips={clips} />;

export const ReTimePlayer: React.FC = () => {
  const renderCustomControls = React.useCallback(
    () => (
      <ReTimeExportButtons clips={clips} fps={30} compositionId="demo" />
    ),
    [],
  );
  return (
    <Player
      component={MyComp}
      durationInFrames={240}
      compositionWidth={1920}
      compositionHeight={1080}
      fps={30}
      controls
      renderCustomControls={renderCustomControls}
    />
  );
};
