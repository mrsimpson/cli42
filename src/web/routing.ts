import { slug } from "./slug.ts";

// ─── Routes ──────────────────────────────────────────────────────────────────
//
// One routing scheme for every *42 web view:
//
//   #<file>                                 a document
//   #<file>:el-<id>                         a document, element opened
//   #<file>:<anchor>                        a document, scrolled to a heading
//                                           (its slug) or another anchor
//   #changes                                the change summary (--diff)
//   #history[:<commit|worktree>[:message]]  the history, one pearl selected
//   #<view>                                 a view of the app's own (e.g. meta-model)
//   ?version=<commit>                       an earlier version (query, see version.ts)
//
// <file> is the document's path relative to the workspace (see DocumentRoutes),
// percent-encoded where needed. File names contain no colons, so the first
// colon separates the file from the anchor.

export type Route =
  | {
      view: "document";
      /** The document's route key; "" for the default document. */
      file: string;
      /** What follows the colon, if anything: `el-<id>`, a heading slug, another anchor. */
      anchor: string | null;
      /** The element to open (`el-<id>`), if the anchor names one. */
      element: string | null;
    }
  | { view: "changes" }
  | {
      view: "history";
      /** The selected pearl (commit id or "worktree"), or null for the newest. */
      key: string | null;
      /** Whether the pearl's commit message is open. */
      message: boolean;
    }
  | { view: "app"; name: string };

export interface RouteOptions {
  /** Names of the app's own views, routed as `#<name>` (e.g. "meta-model"). */
  views?: readonly string[];
}

function decode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text; // A stray "%" is part of the name.
  }
}

function encode(file: string): string {
  return file.split("/").map(encodeURIComponent).join("/");
}

/** The route a location hash (with or without its "#") names. */
export function parseRoute(hash: string, options: RouteOptions = {}): Route {
  const fragment = hash.replace(/^#/, "");
  if (fragment === "changes") return { view: "changes" };
  if (fragment === "history" || fragment.startsWith("history:")) {
    const rest = fragment.slice("history:".length);
    const message = rest.endsWith(":message");
    const key = message ? rest.slice(0, -":message".length) : rest;
    return { view: "history", key: key || null, message };
  }
  if (options.views?.includes(fragment)) return { view: "app", name: fragment };
  const colon = fragment.indexOf(":");
  const file = decode(colon < 0 ? fragment : fragment.slice(0, colon));
  const anchor = colon < 0 ? null : decode(fragment.slice(colon + 1)) || null;
  const element = anchor?.startsWith("el-") ? anchor.slice(3) || null : null;
  return { view: "document", file, anchor, element };
}

/** The location hash (with "#") of a route. */
export function formatRoute(route: Route): string {
  switch (route.view) {
    case "changes":
      return "#changes";
    case "history":
      return route.key === null
        ? "#history"
        : `#history:${route.key}${route.message ? ":message" : ""}`;
    case "app":
      return `#${route.name}`;
    case "document": {
      const anchor = route.element !== null ? `el-${route.element}` : route.anchor;
      return `#${encode(route.file)}${anchor ? `:${encodeURIComponent(anchor)}` : ""}`;
    }
  }
}

export const changesHref = "#changes";

/** The history, one pearl selected (null: the newest); with `message`, its commit message open. */
export function historyHref(key: string | null = null, message = false): string {
  return formatRoute({ view: "history", key, message });
}

function posix(path: string): string {
  return path.replace(/\\/g, "/");
}

function basename(path: string): string {
  return posix(path).split("/").pop() ?? path;
}

/**
 * The routes of a workspace's documents. A document's route key is its path
 * relative to the directory holding all documents — the file name in a flat
 * workspace, `2-design/d5-transactions.pdt42.md` in one with folders — so the
 * same document has the same link however the workspace was loaded (absolute
 * paths from a CLI, repository paths from a snapshot).
 */
export class DocumentRoutes {
  private readonly keys = new Map<string, string>();
  private readonly byKey = new Map<string, string>();
  private readonly byName = new Map<string, string[]>();

  constructor(paths: readonly string[]) {
    const dirs = paths.map((path) => posix(path).split("/").slice(0, -1));
    let common = dirs[0] ?? [];
    for (const dir of dirs) {
      let i = 0;
      while (i < common.length && i < dir.length && common[i] === dir[i]) i++;
      common = common.slice(0, i);
    }
    for (const path of paths) {
      const key = posix(path).split("/").slice(common.length).join("/");
      this.keys.set(path, key);
      this.byKey.set(key, path);
      const name = basename(path);
      this.byName.set(name, [...(this.byName.get(name) ?? []), path]);
    }
  }

  /** The route key of a document path (its path relative to the workspace). */
  keyOf(path: string): string {
    return this.keys.get(path) ?? this.keyOfUnknown(path);
  }

  private keyOfUnknown(path: string): string {
    // A path of the workspace in another form (e.g. relative instead of absolute).
    const resolved = this.resolve(path);
    return resolved ? this.keys.get(resolved)! : basename(path);
  }

  /**
   * The document path a route's file names: its key, the path itself, or —
   * for links from before documents had folders — the only document with
   * that file name. Undefined when none or several match.
   */
  resolve(file: string): string | undefined {
    const exact = this.byKey.get(file) ?? (this.keys.has(file) ? file : undefined);
    if (exact) return exact;
    const byName = this.byName.get(basename(file));
    if (byName?.length === 1) return byName[0];
    const suffix = [...this.keys.keys()].filter(
      (path) =>
        posix(path).endsWith(`/${posix(file)}`) || posix(file).endsWith(`/${this.keys.get(path)!}`),
    );
    return suffix.length === 1 ? suffix[0] : undefined;
  }

  /** The link to a document; with `anchor`, scrolled to it. */
  documentHref(path: string, anchor?: string | null): string {
    return formatRoute({
      view: "document",
      file: this.keyOf(path),
      anchor: anchor ?? null,
      element: null,
    });
  }

  /** The link to an element, opened in its document. */
  elementHref(path: string, id: string): string {
    return formatRoute({ view: "document", file: this.keyOf(path), anchor: null, element: id });
  }

  /** The link to a heading of a document. */
  headingHref(path: string, heading: string): string {
    return this.documentHref(path, slug(heading));
  }
}

/** Links to the elements of a workspace. */
export interface ElementLinks {
  /** Whether an element with this id exists (the ids `linkIds` links). */
  has(id: string): boolean;
  /** The link to an element, opened in its document; undefined for an unknown id. */
  elementHref(id: string): string | undefined;
}

/**
 * The links of one workspace: documents by their routes, elements by the
 * document that defines them. Also the id set `linkIds` needs (`has`).
 */
export class WorkspaceLinks implements ElementLinks {
  readonly routes: DocumentRoutes;
  private readonly files = new Map<string, string>();

  constructor(
    documents: readonly string[] | DocumentRoutes,
    elements: Iterable<{ id: string; loc: { file: string } }>,
  ) {
    this.routes = documents instanceof DocumentRoutes ? documents : new DocumentRoutes(documents);
    for (const element of elements) {
      if (!this.files.has(element.id)) this.files.set(element.id, element.loc.file);
    }
  }

  has(id: string): boolean {
    return this.files.has(id);
  }

  /** The document path of an element. */
  fileOf(id: string): string | undefined {
    return this.files.get(id);
  }

  elementHref(id: string): string | undefined {
    const file = this.files.get(id);
    return file === undefined ? undefined : this.routes.elementHref(file, id);
  }

  documentHref(path: string, anchor?: string | null): string {
    return this.routes.documentHref(path, anchor);
  }

  headingHref(path: string, heading: string): string {
    return this.routes.headingHref(path, heading);
  }
}
