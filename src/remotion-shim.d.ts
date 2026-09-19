declare module "remotion" {
  import type * as React from "react";
  export type SequenceProps = {
    from: number;
    durationInFrames: number;
    children: React.ReactNode;
  };
  export const Sequence: React.FC<SequenceProps>;
  export const staticFile: (path: string) => string;
}

declare module "@remotion/player" {
  import type * as React from "react";
  export type RenderCustomControls = () => React.ReactNode;
}
