# Player integration

`ReTimeExportButtons` (`src/controls.tsx:27`) is a client-side download button set. No server call.

## Minimal wiring

Full file: `example/player-usage.tsx`.

```tsx
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
    () => <ReTimeExportButtons clips={clips} fps={30} compositionId="demo" />,
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
```

Notes:

- `controls` must be set on `Player`, otherwise the slot never renders (see Remotion docs for `renderCustomControls`).
- Wrap the callback in `useCallback` so the controls don't remount every frame.
- Filenames come from `extensionFor` (`src/export.ts:31`): `<compositionId>.fcpxml`, `<compositionId>.xml`, `<compositionId>.otio`.
- MIME types come from `mimeFor` (`src/export.ts:34`): XML for `fcpxml`/`premiere`, JSON for `otio`.

## ReTimeTrack

`ReTimeTrack` (`src/Timeline.tsx:15`) maps each `Clip` to a Remotion `Sequence` with the same `from`/`durationInFrames`. Pass `renderClip` to customize rendering; default is `<video src={clip.src} />`.
