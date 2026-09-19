# Tutorial 2 — Player export buttons

Goal: add in-browser FCPXML / Premiere / OTIO downloads to `@remotion/player`.

1. Copy the pattern from `example/player-usage.tsx`:

```tsx
const renderCustomControls = React.useCallback(
  () => <ReTimeExportButtons clips={clips} fps={30} compositionId="demo" />,
  [],
);
```

2. Pass it to `Player` with `controls` enabled:

```tsx
<Player controls renderCustomControls={renderCustomControls} {...rest} />
```

3. Click each button. The browser downloads `demo.fcpxml`, `demo.xml`, `demo.otio` (see `extensionFor` in `src/export.ts:31`).

4. Keep render and export in sync: define `clips` once and pass the same array to both `<ReTimeTrack clips={clips} />` and `<ReTimeExportButtons clips={clips} />`.

Pitfall: without the `controls` prop the slot never renders and the buttons are invisible.
