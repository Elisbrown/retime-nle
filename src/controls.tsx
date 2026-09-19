import * as React from "react";
import { exportTimeline, extensionFor, mimeFor } from "./export";
import type { Clip, ExportFormat } from "./types";

export type ReTimeExportButtonsProps = {
  clips: Clip[];
  fps: number;
  compositionId?: string;
};

const download = (text: string, filename: string, mime: string): void => {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/**
 * Drop into @remotion/player `renderCustomControls` (docs/player/custom-controls).
 * Pure client-side download: no fork of Studio, no background server.
 */
export const ReTimeExportButtons: React.FC<ReTimeExportButtonsProps> = ({
  clips,
  fps,
  compositionId = "retime-timeline",
}) => {
  const [busy, setBusy] = React.useState<ExportFormat | null>(null);
  const onExport = (format: ExportFormat) => {
    setBusy(format);
    try {
      const text = exportTimeline(clips, fps, format, compositionId);
      download(
        text,
        `${compositionId}.${extensionFor(format)}`,
        mimeFor(format),
      );
    } finally {
      setBusy(null);
    }
  };
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {(["fcpxml", "premiere", "otio"] as const).map((f) => (
        <button key={f} type="button" disabled={busy !== null} onClick={() => onExport(f)}>
          {busy === f ? "Exporting…" : `Export ${f}`}
        </button>
      ))}
    </div>
  );
};
