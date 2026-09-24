import type { CaptionElement, MarkerElement, TitleElement, TransitionElement } from "./elements";
import { packLanes } from "./layout";
import type { PreparedCaption, PreparedEffect, PreparedTitle, PreparedTransition } from "./model";

/**
 * Final Cut's stock text generator. Titles reference it by uid, so the text
 * lands as an editable title rather than a missing effect. Override it with
 * `titleEffectUid` if your Final Cut install reports a different path — export
 * any project containing a title and read the `<effect>` resource.
 */
export const DEFAULT_TITLE_EFFECT_UID =
  ".../Titles.localized/Bumper:Opener.localized/Basic Title.localized/Basic Title.moti";

export const DEFAULT_TRANSITION_EFFECT_UID = "FFTransition_CrossDissolve";

export type ElementInput = {
  titles?: TitleElement[];
  captions?: CaptionElement[];
  markers?: MarkerElement[];
  transitions?: TransitionElement[];
};

export type ElementOptions = {
  titleEffectUid?: string;
  /** BCP-47 tag for captions that do not carry their own. Defaults to "en". */
  captionLanguage?: string;
};

export type PreparedElements = {
  titles: PreparedTitle[];
  captions: PreparedCaption[];
  markers: MarkerElement[];
  transitions: PreparedTransition[];
  effects: PreparedEffect[];
  titleEffectId?: string;
  transitionEffectId?: string;
};

const firstLine = (text: string): string => {
  const line = text.split("\n").find((l) => l.trim().length > 0)?.trim() ?? "Title";
  return line.length > 40 ? `${line.slice(0, 37)}…` : line;
};

/**
 * Lay titles and captions into lanes above the video, and allocate the
 * generator resources they reference.
 *
 * `nextId` hands out resource ids from the same sequence the media uses, so
 * every reference in the document stays unique.
 */
export const prepareElements = (
  input: ElementInput,
  opts: ElementOptions,
  topVideoLane: number,
  nextId: () => string,
): PreparedElements => {
  const effects: PreparedEffect[] = [];
  let titleEffectId: string | undefined;
  let transitionEffectId: string | undefined;

  const rawTitles = input.titles ?? [];
  const rawCaptions = input.captions ?? [];
  const rawTransitions = input.transitions ?? [];

  if (rawTitles.length > 0) {
    titleEffectId = nextId();
    effects.push({
      id: titleEffectId,
      name: "Basic Title",
      uid: opts.titleEffectUid ?? DEFAULT_TITLE_EFFECT_UID,
    });
  }
  if (rawTransitions.length > 0) {
    transitionEffectId = nextId();
    effects.push({
      id: transitionEffectId,
      name: "Cross Dissolve",
      uid: DEFAULT_TRANSITION_EFFECT_UID,
    });
  }

  const titleLanes = packLanes(rawTitles, 1, topVideoLane + 1);
  const titles: PreparedTitle[] = rawTitles.map((t, i) => ({
    ...t,
    id: `title-${i + 1}`,
    name: t.name ?? firstLine(t.text),
    styleId: `ts${i + 1}`,
    lane: t.lane ?? titleLanes[i],
  }));

  const captionLane = (titles.length > 0 ? Math.max(...titles.map((t) => t.lane)) : topVideoLane) + 1;
  const captions: PreparedCaption[] = rawCaptions
    .slice()
    .sort((a, b) => a.from - b.from)
    .map((c, i) => ({
      ...c,
      id: `caption-${i + 1}`,
      styleId: `cs${i + 1}`,
      language: c.language ?? opts.captionLanguage ?? "en",
      lane: captionLane,
    }));

  const transitions: PreparedTransition[] = rawTransitions
    .slice()
    .sort((a, b) => a.from - b.from)
    .map((t, i) => ({ ...t, id: `transition-${i + 1}` }));

  return {
    titles,
    captions,
    markers: input.markers ?? [],
    transitions,
    effects,
    titleEffectId,
    transitionEffectId,
  };
};
