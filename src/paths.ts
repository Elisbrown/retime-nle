import * as fs from "node:fs";
import * as path from "node:path";

/** How a clip's `src` was resolved to something an NLE can open. */
export type SrcKind = "file" | "remote" | "unresolved";

export type ResolvedSrc = {
  /** The `src` exactly as it appeared in the manifest. */
  src: string;
  kind: SrcKind;
  /** Absolute path to write into the timeline (after `pathMap`). */
  absPath?: string;
  /** Absolute path on *this* machine, used for checks, probing and copying. */
  localPath?: string;
  /** Why resolution failed, for `unresolved`. */
  reason?: string;
  exists: boolean;
  bytes?: number;
};

export type ResolveOptions = {
  /** Directory relative srcs are resolved against. Defaults to cwd. */
  assetRoot?: string;
  /** Remotion `public/` directory, for `staticFile()` srcs. */
  publicDir?: string;
  /** Rewrite rules applied to resolved absolute paths, as [from, to] prefixes. */
  pathMap?: Array<[string, string]>;
};

const WINDOWS_ABS = /^[A-Za-z]:[\\/]/;

const isAbsolutePath = (p: string): boolean =>
  p.startsWith("/") || WINDOWS_ABS.test(p);

/** Percent-encode a filesystem path into a file:// URL. */
export const toFileUrl = (absPath: string): string => {
  let p = absPath;
  if (WINDOWS_ABS.test(p)) p = `/${p.replace(/\\/g, "/")}`;
  const encoded = p
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `file://${encoded}`;
};

/** Relative URL from the directory holding the exported timeline to a file. */
export const toRelativeUrl = (fromDir: string, absPath: string): string => {
  const rel = path.relative(fromDir, absPath).split(path.sep).join("/");
  const prefixed = rel.startsWith(".") ? rel : `./${rel}`;
  return prefixed
    .split("/")
    .map((seg) => (seg === "." || seg === ".." ? seg : encodeURIComponent(seg)))
    .join("/");
};

const applyPathMap = (p: string, pathMap?: Array<[string, string]>): string => {
  if (!pathMap) return p;
  for (const [from, to] of pathMap) {
    if (p === from || p.startsWith(from.endsWith("/") ? from : `${from}/`)) {
      return path.posix.join(to, p.slice(from.length).replace(/^\//, ""));
    }
  }
  return p;
};

const statOf = (p: string): { exists: boolean; bytes?: number } => {
  try {
    const st = fs.statSync(p);
    return { exists: st.isFile(), bytes: st.size };
  } catch {
    return { exists: false };
  }
};

/**
 * Turn a manifest `src` into a concrete local file where possible.
 *
 * Handles the shapes a Remotion project actually produces: `staticFile()`
 * output ("/my-video.mp4"), Studio/Player URLs
 * ("http://localhost:3000/static-abc123/my-video.mp4"), plain relative paths,
 * and already-absolute paths. Remote http(s) URLs are passed through — FCPXML
 * 1.9+ can download those. blob:/data: srcs cannot be linked and are reported.
 */
export const resolveSrc = (src: string, opts: ResolveOptions = {}): ResolvedSrc => {
  const assetRoot = opts.assetRoot ? path.resolve(opts.assetRoot) : process.cwd();
  const publicDir = opts.publicDir ? path.resolve(opts.publicDir) : undefined;

  if (/^(blob|data):/i.test(src)) {
    return {
      src,
      kind: "unresolved",
      exists: false,
      reason: `${src.slice(0, src.indexOf(":"))}: sources have no file an NLE can open`,
    };
  }

  let candidate = src;

  if (/^file:\/\//i.test(src)) {
    candidate = decodeURIComponent(src.replace(/^file:\/\//i, ""));
  } else if (/^https?:\/\//i.test(src)) {
    let url: URL;
    try {
      url = new URL(src);
    } catch {
      return { src, kind: "unresolved", exists: false, reason: "malformed URL" };
    }
    const local = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/i.test(url.hostname);
    if (!local) {
      return { src, kind: "remote", exists: true };
    }
    candidate = decodeURIComponent(url.pathname);
  } else {
    candidate = decodeURIComponent(src);
  }

  // Remotion Studio serves public/ under a hashed prefix: /static-<hash>/file.mp4
  candidate = candidate.replace(/^\/?static-[A-Za-z0-9_-]+\//, "/");

  const tried: string[] = [];
  const attempts: string[] = [];
  if (isAbsolutePath(candidate)) {
    attempts.push(candidate);
    // An absolute-looking staticFile() path is really relative to public/.
    if (publicDir) attempts.push(path.join(publicDir, candidate.replace(/^\//, "")));
  } else {
    attempts.push(path.resolve(assetRoot, candidate));
    if (publicDir) attempts.push(path.resolve(publicDir, candidate));
    attempts.push(path.resolve(process.cwd(), candidate));
  }

  for (const attempt of attempts) {
    const mapped = applyPathMap(attempt, opts.pathMap);
    const st = statOf(attempt);
    if (st.exists) {
      return {
        src,
        kind: "file",
        absPath: mapped,
        localPath: attempt,
        exists: true,
        bytes: st.bytes,
      };
    }
    tried.push(attempt);
  }

  // Nothing on disk. Still emit a usable absolute path so the editor can relink.
  const fallback = applyPathMap(attempts[0], opts.pathMap);
  return {
    src,
    kind: "file",
    absPath: fallback,
    localPath: attempts[0],
    exists: false,
    reason: `no file at ${tried.join(" or ")}`,
  };
};

export const uniqueTarget = (dir: string, filename: string, taken: Set<string>): string => {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  let name = filename;
  let i = 2;
  while (taken.has(name.toLowerCase()) || fs.existsSync(path.join(dir, name))) {
    name = `${base}-${i}${ext}`;
    i++;
  }
  taken.add(name.toLowerCase());
  return name;
};
