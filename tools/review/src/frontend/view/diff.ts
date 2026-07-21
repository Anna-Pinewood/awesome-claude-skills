import { h } from "snabbdom";
import type { VNode } from "snabbdom";
import type {
	ContextExpansion,
	DiffLine,
	FileDiff,
	Hunk,
	Model,
	Msg,
	StoredComment,
} from "../../types.ts";
import { commentBoxView, savedCommentView } from "./comment.ts";
import { createKeyedMemo, createMemo } from "./memo.ts";
import {
	CHUNK_SIZE,
	ROW_HEIGHT_PX,
	bumpEpoch,
	getRenderEpoch,
	resetVirtualization,
	virtualized,
} from "./virtualize.ts";

// --- Gutter Drag-Select ---

// Global listener state — installed once, dispatches endDrag on mouseup anywhere.
let globalListenerInstalled = false;
let dispatchRef: ((msg: Msg) => void) | null = null;

// Auto-scroll state for drag selection
let dragAnimationId: number | null = null;
let lastMouseX = 0;
let lastMouseY = 0;
let dragMouseMoveHandler: ((e: MouseEvent) => void) | null = null;
let activeDragFile: string | null = null;

const SCROLL_EDGE = 60;
const MAX_SCROLL_SPEED = 20;

const stopAutoScroll = (): void => {
	if (dragMouseMoveHandler) {
		window.removeEventListener("mousemove", dragMouseMoveHandler);
		dragMouseMoveHandler = null;
	}
	if (dragAnimationId !== null) {
		cancelAnimationFrame(dragAnimationId);
		dragAnimationId = null;
	}
	activeDragFile = null;
};

const startAutoScroll = (
	dispatch: (msg: Msg) => void,
	filePath: string,
	initialX: number,
	initialY: number,
): void => {
	stopAutoScroll();
	activeDragFile = filePath;
	lastMouseX = initialX;
	lastMouseY = initialY;

	dragMouseMoveHandler = (e: MouseEvent) => {
		lastMouseX = e.clientX;
		lastMouseY = e.clientY;
	};
	window.addEventListener("mousemove", dragMouseMoveHandler);

	const tick = (): void => {
		const scrollContainer = document.querySelector(".diff-area") as HTMLElement | null;
		if (!scrollContainer) {
			dragAnimationId = requestAnimationFrame(tick);
			return;
		}

		const rect = scrollContainer.getBoundingClientRect();
		let speed = 0;

		if (lastMouseY < rect.top) {
			speed = -MAX_SCROLL_SPEED;
		} else if (lastMouseY < rect.top + SCROLL_EDGE) {
			speed = -MAX_SCROLL_SPEED * ((rect.top + SCROLL_EDGE - lastMouseY) / SCROLL_EDGE);
		} else if (lastMouseY > rect.bottom) {
			speed = MAX_SCROLL_SPEED;
		} else if (lastMouseY > rect.bottom - SCROLL_EDGE) {
			speed = MAX_SCROLL_SPEED * ((lastMouseY - (rect.bottom - SCROLL_EDGE)) / SCROLL_EDGE);
		}

		if (speed !== 0) {
			scrollContainer.scrollBy(0, speed);
			const probeY = Math.max(rect.top + 10, Math.min(rect.bottom - 10, lastMouseY));
			const el = document.elementFromPoint(lastMouseX, probeY);
			if (el) {
				const row = el.closest("tr[data-line]") as HTMLElement | null;
				if (row && row.dataset.file === activeDragFile) {
					const num = Number.parseInt(row.dataset.line!, 10);
					if (!Number.isNaN(num)) {
						dispatch({ type: "updateDrag", endRow: num });
					}
				}
			}
		}

		dragAnimationId = requestAnimationFrame(tick);
	};

	dragAnimationId = requestAnimationFrame(tick);
};

const installGlobalListener = (dispatch: (msg: Msg) => void): void => {
	dispatchRef = dispatch;
	if (globalListenerInstalled) return;
	globalListenerInstalled = true;
	window.addEventListener("mouseup", () => {
		stopAutoScroll();
		if (dispatchRef) dispatchRef({ type: "endDrag" });
	});
};

// --- Helpers ---

const fileChangeStats = (file: FileDiff): { added: number; deleted: number } => {
	let added = 0;
	let deleted = 0;
	for (const hunk of file.hunks) {
		for (const line of hunk.lines) {
			if (line.type === "add") added++;
			if (line.type === "delete") deleted++;
		}
	}
	return { added, deleted };
};

// Cache highlighted results — diff data never changes during a session
const highlightCache = new Map<string, readonly string[]>();
const highlightInFlight = new Set<string>();

type HighlightResponse = {
	readonly type: "highlighted";
	readonly cacheKey: string;
	readonly lines: readonly string[];
};

let worker: Worker | null = null;

const getWorker = (dispatch: (msg: Msg) => void): Worker => {
	if (worker) return worker;
	worker = new Worker("/worker.js");
	worker.onmessage = (e: MessageEvent<HighlightResponse>) => {
		const { cacheKey, lines } = e.data;
		highlightCache.set(cacheKey, lines);
		highlightInFlight.delete(cacheKey);
		// Invalidate memos so the next render actually uses the freshly-cached lines.
		bumpEpoch();
		dispatch({ type: "filesHighlighted" });
	};
	return worker;
};

const plaintextLines = (source: string): readonly string[] =>
	source.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").split("\n");

const getHighlightedLines = (
	file: FileDiff,
	viewKey: string,
	dispatch: (msg: Msg) => void,
): readonly string[] => {
	const cacheKey = `${viewKey}:${file.path}`;
	const cached = highlightCache.get(cacheKey);
	if (cached) return cached;

	const allContent = file.hunks.flatMap((hunk) => hunk.lines.map((l) => l.content));
	const joined = allContent.join("\n");

	if (!highlightInFlight.has(cacheKey)) {
		highlightInFlight.add(cacheKey);
		const w = getWorker(dispatch);
		w.postMessage({
			type: "highlight",
			cacheKey,
			language: file.language,
			content: joined,
		});
	}

	return plaintextLines(joined);
};

// Compute visible segments for a hunk — folds long context gaps between change clusters
type Segment = { readonly start: number; readonly end: number };

const DEFAULT_CONTEXT = 3;
const GAP_THRESHOLD = 2 * DEFAULT_CONTEXT + 1;

const computeVisibleSegments = (
	lines: readonly DiffLine[],
	hunkKey: string,
	expansions: Readonly<Record<string, ContextExpansion>>,
): readonly Segment[] => {
	const changes: number[] = [];
	for (let i = 0; i < lines.length; i++) {
		if (lines[i]!.type !== "context") changes.push(i);
	}

	if (changes.length === 0) {
		return [{ start: 0, end: lines.length }];
	}

	// Group changes into clusters (merge if gap between them is small)
	const clusters: { first: number; last: number }[] = [];
	let cFirst = changes[0]!;
	let cLast = changes[0]!;

	for (let i = 1; i < changes.length; i++) {
		if (changes[i]! - cLast > GAP_THRESHOLD) {
			clusters.push({ first: cFirst, last: cLast });
			cFirst = changes[i]!;
		}
		cLast = changes[i]!;
	}
	clusters.push({ first: cFirst, last: cLast });

	const outer = expansions[hunkKey] ?? { above: DEFAULT_CONTEXT, below: DEFAULT_CONTEXT };

	return clusters.map((cluster, i) => {
		const start =
			i === 0
				? Math.max(0, cluster.first - outer.above)
				: Math.max(
						0,
						cluster.first - DEFAULT_CONTEXT - (expansions[`${hunkKey}-gap-${i - 1}`]?.above ?? 0),
					);

		const end =
			i === clusters.length - 1
				? Math.min(lines.length, cluster.last + 1 + outer.below)
				: Math.min(
						lines.length,
						cluster.last + 1 + DEFAULT_CONTEXT + (expansions[`${hunkKey}-gap-${i}`]?.above ?? 0),
					);

		return { start, end };
	});
};

// Check if a line-row is within the finalized comment draft range
const isRowSelected = (rowId: number, model: Model, filePath: string): boolean => {
	const draft = model.commentDraft;
	if (!draft || draft.file !== filePath) return false;
	const lo = Math.min(draft.startRow, draft.endRow);
	const hi = Math.max(draft.startRow, draft.endRow);
	return rowId >= lo && rowId <= hi;
};

// Check if a line-row is within the active drag range (visual feedback only)
const isRowDragging = (rowId: number, model: Model, filePath: string): boolean => {
	const drag = model.dragSelection;
	if (!drag || drag.file !== filePath) return false;
	const lo = Math.min(drag.startRow, drag.endRow);
	const hi = Math.max(drag.startRow, drag.endRow);
	return rowId >= lo && rowId <= hi;
};

// --- Line View ---

const lineContentCell = (highlighted: string): VNode =>
	h("td.line-content", {
		hook: {
			insert: (vnode) => {
				const el = vnode.elm as HTMLElement & { __hl?: string };
				el.__hl = highlighted;
				el.innerHTML = highlighted;
			},
			// Re-set innerHTML when worker-returned HTML arrives after the initial mount.
			// Guarded so unrelated re-renders (drag/selection) don't thrash innerHTML.
			update: (_old, vnode) => {
				const el = vnode.elm as HTMLElement & { __hl?: string };
				if (el.__hl === highlighted) return;
				el.__hl = highlighted;
				el.innerHTML = highlighted;
			},
		},
	});

const lineView = (
	line: DiffLine,
	rowId: number,
	highlighted: string,
	file: FileDiff,
	fileIdx: number,
	model: Model,
	dispatch: (msg: Msg) => void,
): VNode => {
	const lineClass =
		line.type === "add" ? "line-add" : line.type === "delete" ? "line-del" : "line-context";

	const selected = isRowSelected(rowId, model, file.path);
	const dragging = isRowDragging(rowId, model, file.path);

	const rowHandlers: Record<string, (e: Event) => void> = {
		mouseenter: () => {
			const drag = model.dragSelection;
			if (drag && drag.file === file.path) {
				dispatch({ type: "updateDrag", endRow: rowId });
			}
		},
	};

	const gutterHandlers: Record<string, (e: Event) => void> = {
		mousedown: (e: Event) => {
			e.preventDefault();
			const me = e as MouseEvent;
			startAutoScroll(dispatch, file.path, me.clientX, me.clientY);
			dispatch({ type: "startDrag", file: file.path, startRow: rowId });
		},
	};

	// Label shows the line's own number (new-side if available, else old-side for deletes).
	const labelNum = line.newNum ?? line.oldNum;

	return h(
		`tr.${lineClass}`,
		{
			key: `${file.path}:${line.oldNum}:${line.newNum}`,
			class: {
				"line-selected": selected,
				"line-selecting": dragging,
			},
			attrs: { "data-file": file.path, "data-line": String(rowId) },
			on: rowHandlers,
		},
		[
			h(
				"td.gutter",
				{
					class: { "gutter-del": line.type === "delete" },
					attrs: {
						role: "button",
						tabindex: "0",
						"aria-label": "Select line for comment",
					},
					on: gutterHandlers,
				},
				labelNum != null ? String(labelNum) : "",
			),
			lineContentCell(highlighted),
		],
	);
};

// --- Expand Arrows ---

const expandArrow = (
	key: string,
	direction: "above" | "below",
	dispatch: (msg: Msg) => void,
): VNode =>
	h(
		"tr.expand-row",
		{
			key: `expand-${key}-${direction}`,
			attrs: {
				role: "button",
				tabindex: "0",
				"aria-label":
					direction === "above" ? "Show 20 more lines above" : "Show 20 more lines below",
			},
			on: {
				click: () => dispatch({ type: "expandContext", key, direction }),
				keydown: (e: KeyboardEvent) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						dispatch({ type: "expandContext", key, direction });
					}
				},
			},
		},
		[
			h(
				"td",
				{ attrs: { colspan: 2 } },
				direction === "above" ? "\u25B2 Show more" : "\u25BC Show more",
			),
		],
	);

const foldArrow = (key: string, hiddenCount: number, dispatch: (msg: Msg) => void): VNode =>
	h(
		"tr.fold-row",
		{
			key: `fold-${key}`,
			attrs: {
				role: "button",
				tabindex: "0",
				"aria-label": `Show ${hiddenCount} hidden lines`,
			},
			on: {
				click: () => dispatch({ type: "expandContext", key, direction: "above" }),
				keydown: (e: KeyboardEvent) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						dispatch({ type: "expandContext", key, direction: "above" });
					}
				},
			},
		},
		[h("td", { attrs: { colspan: 2 } }, `\u22EF ${hiddenCount} lines \u22EF`)],
	);

// --- Hunk View ---

// Build the full list of row vnodes for a hunk and return both the rows and a parallel
// array of "line counts" — approximate weight for chunking. Rows like expand/fold arrows
// weigh 1; regular lines weigh 1 each; comment/saved-comment rows are piggy-backed onto
// the preceding line and don't get their own weight slot.
//
// Returning an array of VNodes lets the caller slice it into chunks. We don't collapse
// into a single table here — that's the caller's job, so large hunks can be split.
const buildHunkRows = (
	hunk: Hunk,
	highlightedLines: readonly string[],
	lineOffset: number,
	file: FileDiff,
	fileIdx: number,
	hunkIdx: number,
	fileComments: readonly StoredComment[],
	model: Model,
	dispatch: (msg: Msg) => void,
): VNode[] => {
	const hunkKey = `${fileIdx}-${hunkIdx}`;
	const segments = computeVisibleSegments(hunk.lines, hunkKey, model.contextExpansion);

	const rows: VNode[] = [];

	// Outer expand above
	if (segments[0]!.start > 0) {
		rows.push(expandArrow(hunkKey, "above", dispatch));
	}

	const draft = model.commentDraft;
	const draftEndRow = draft ? Math.max(draft.startRow, draft.endRow) : -1;
	let commentBoxInserted = false;

	let prevEnd = segments[0]!.start;

	for (let segIdx = 0; segIdx < segments.length; segIdx++) {
		const seg = segments[segIdx]!;
		const actualStart = Math.max(seg.start, prevEnd);

		if (actualStart >= seg.end) continue;

		// Fold arrow between segments when there's a gap
		if (segIdx > 0 && actualStart > prevEnd) {
			const gapKey = `${hunkKey}-gap-${segIdx - 1}`;
			rows.push(foldArrow(gapKey, actualStart - prevEnd, dispatch));
		}

		for (let i = actualStart; i < seg.end; i++) {
			const line = hunk.lines[i]!;
			const rowId = lineOffset + i;
			const hl = highlightedLines[rowId] ?? "";
			rows.push(lineView(line, rowId, hl, file, fileIdx, model, dispatch));

			// Saved comments anchor on rowEnd so pure-deletion selections render
			// inline instead of bouncing to the first surviving line below.
			for (const comment of fileComments) {
				if (comment.rowEnd === rowId) {
					rows.push(savedCommentView(comment, dispatch));
				}
			}

			// Draft box attaches at the draft's end row — works uniformly for normal,
			// mixed, or pure-deletion selections.
			if (!commentBoxInserted && draft && draft.file === file.path && rowId === draftEndRow) {
				const box = commentBoxView(model, dispatch);
				if (box) {
					rows.push(box);
					commentBoxInserted = true;
				}
			}
		}

		prevEnd = Math.max(prevEnd, seg.end);
	}

	// Outer expand below
	if (prevEnd < hunk.lines.length) {
		rows.push(expandArrow(hunkKey, "below", dispatch));
	}

	return rows;
};

// Wrap a block of <tr> rows in a diff-table. This is the unit of virtualization —
// either an entire small-hunk chunk, or a slice of a large-hunk chunk.
const chunkTable = (rows: readonly VNode[], keyPrefix: string): VNode =>
	h("table.diff-table", { key: `chunk-${keyPrefix}` }, [
		h("colgroup", [h("col", { style: { width: "55px" } }), h("col")]),
		h("tbody", rows as VNode[]),
	]);

// Stub placeholder for a not-yet-rendered chunk. Height approximated from row count ×
// ROW_HEIGHT_PX so the scrollbar doesn't jump when content swaps in.
const chunkStub = (key: string, rowCount: number): VNode => {
	const heightPx = Math.max(rowCount * ROW_HEIGHT_PX, ROW_HEIGHT_PX);
	return h("div.chunk-stub", {
		key: `stub-${key}`,
		style: { minHeight: `${heightPx}px` },
		attrs: { "data-chunk-key": key },
	});
};

// --- File View ---

const fileHeaderView = (file: FileDiff, fileIdx: number): VNode => {
	const stats = fileChangeStats(file);
	const pathParts: VNode[] = [];

	if (file.oldPath && file.oldPath !== file.path) {
		pathParts.push(h("span.file-path-old", file.oldPath));
		pathParts.push(h("span.file-rename-arrow", " \u2192 "));
	}
	pathParts.push(h("span.file-path", file.path));

	const statsNodes: VNode[] = [];
	if (stats.added > 0) statsNodes.push(h("span.file-stats-add", `+${stats.added}`));
	if (stats.added > 0 && stats.deleted > 0) statsNodes.push(h("span", " "));
	if (stats.deleted > 0) statsNodes.push(h("span.file-stats-del", `-${stats.deleted}`));

	return h(
		"div.file-header",
		{
			attrs: { "data-file-idx": String(fileIdx) },
		},
		[h("div", pathParts), h("span.file-change-stats", statsNodes)],
	);
};

// Estimate the total visible-line count for a file, post-segmentation. Used to decide
// whether to chunk within-file or render as one block, and to size the file-body stub.
const estimateFileVisibleLines = (file: FileDiff, fileIdx: number, model: Model): number => {
	let total = 0;
	for (let hunkIdx = 0; hunkIdx < file.hunks.length; hunkIdx++) {
		const hunk = file.hunks[hunkIdx]!;
		const hunkKey = `${fileIdx}-${hunkIdx}`;
		const segments = computeVisibleSegments(hunk.lines, hunkKey, model.contextExpansion);
		for (const seg of segments) {
			total += seg.end - seg.start;
		}
		// Expand/fold arrows add a row each — rough but good enough for sizing
		total += segments.length + (segments[0]!.start > 0 ? 1 : 0);
	}
	return total;
};

// Render the body of one hunk as one-or-more chunks. If the hunk's rendered row count
// exceeds CHUNK_SIZE, split into consecutive slices; each slice becomes its own
// virtualizable table. Small hunks render as a single table regardless.
const renderHunkChunks = (
	hunk: Hunk,
	highlightedLines: readonly string[],
	lineOffset: number,
	file: FileDiff,
	fileIdx: number,
	hunkIdx: number,
	fileComments: readonly StoredComment[],
	model: Model,
	dispatch: (msg: Msg) => void,
): VNode[] => {
	const rows = buildHunkRows(
		hunk,
		highlightedLines,
		lineOffset,
		file,
		fileIdx,
		hunkIdx,
		fileComments,
		model,
		dispatch,
	);

	if (rows.length <= CHUNK_SIZE) {
		// Single chunk — still virtualize so large but under-threshold hunks don't pay
		// DOM cost until scrolled into view.
		const key = `${model.activeView}:${file.path}:h${hunkIdx}`;
		return [
			virtualized(
				key,
				() => chunkStub(key, rows.length),
				() => chunkTable(rows, `${fileIdx}-${hunkIdx}`),
				dispatch,
			),
		];
	}

	// Split into ~CHUNK_SIZE-sized consecutive slices
	const chunks: VNode[] = [];
	for (let start = 0; start < rows.length; start += CHUNK_SIZE) {
		const end = Math.min(start + CHUNK_SIZE, rows.length);
		const slice = rows.slice(start, end);
		const chunkIdx = Math.floor(start / CHUNK_SIZE);
		const key = `${model.activeView}:${file.path}:h${hunkIdx}:c${chunkIdx}`;
		chunks.push(
			virtualized(
				key,
				() => chunkStub(key, slice.length),
				() => chunkTable(slice, `${fileIdx}-${hunkIdx}-${chunkIdx}`),
				dispatch,
			),
		);
	}
	return chunks;
};

// Render the body of a file (everything below the sticky header).
const fileBodyView = (
	file: FileDiff,
	fileIdx: number,
	fileComments: readonly StoredComment[],
	model: Model,
	dispatch: (msg: Msg) => void,
): VNode => {
	if (file.binary) {
		return h("div.binary-notice", "Binary file not shown.");
	}

	// Highlight all lines in the file at once (keyed by view to avoid stale cache across commits)
	const highlightedLines = getHighlightedLines(file, model.activeView, dispatch);

	const chunks: VNode[] = [];
	let lineOffset = 0;

	for (let hunkIdx = 0; hunkIdx < file.hunks.length; hunkIdx++) {
		if (hunkIdx > 0) {
			chunks.push(h("div.hunk-separator-block", { key: `sep-${fileIdx}-${hunkIdx}` }));
		}
		const hunk = file.hunks[hunkIdx]!;
		chunks.push(
			...renderHunkChunks(
				hunk,
				highlightedLines,
				lineOffset,
				file,
				fileIdx,
				hunkIdx,
				fileComments,
				model,
				dispatch,
			),
		);
		lineOffset += hunk.lines.length;
	}

	return h("div.file-body", chunks);
};

const buildFileView = (
	file: FileDiff,
	fileIdx: number,
	fileComments: readonly StoredComment[],
	model: Model,
	dispatch: (msg: Msg) => void,
): VNode => {
	const header = fileHeaderView(file, fileIdx);

	// Binary files are tiny — skip virtualization.
	if (file.binary) {
		return h("div.file-section", { key: `${model.activeView}:${file.path}` }, [
			header,
			h("div.binary-notice", "Binary file not shown."),
		]);
	}

	// File-level virtualization: body is a stub until scrolled near. Header is always
	// rendered so scroll-to-file, sidebar clicks, file-search, and j/k navigation all
	// keep working (they rely on .file-header[data-file-idx]).
	const fileKey = `${model.activeView}:${file.path}`;
	const body = virtualized(
		fileKey,
		() => {
			const visibleLines = estimateFileVisibleLines(file, fileIdx, model);
			const heightPx = Math.max(visibleLines * ROW_HEIGHT_PX, ROW_HEIGHT_PX);
			return h("div.file-body-stub", {
				style: { minHeight: `${heightPx}px` },
				attrs: { "data-file-key": fileKey },
			});
		},
		() => fileBodyView(file, fileIdx, fileComments, model, dispatch),
		dispatch,
	);

	return h("div.file-section", { key: fileKey }, [header, body]);
};

// Per-file memo. Key deps: the file reference, its comments (stable when
// model.comments unchanged — see commentsByFileMemo), active view,
// context expansions, and the current comment draft. Not keyed on
// `fileIdx` because index is stable when `model.data` + activeView are
// stable, and `dispatch` is a module-level singleton.
const fileViewMemo = createKeyedMemo<
	string,
	[FileDiff, number, readonly StoredComment[], Model, (msg: Msg) => void],
	VNode
>(
	(file, _fileIdx, fileComments, model, _dispatch) => [
		file,
		fileComments,
		model.activeView,
		model.contextExpansion,
		model.commentDraft,
		// Only include drag state when it targets THIS file — other files keep their cached vnode.
		model.dragSelection?.file === file.path ? model.dragSelection : null,
		getRenderEpoch(),
	],
	buildFileView,
);

const fileView = (
	file: FileDiff,
	fileIdx: number,
	fileComments: readonly StoredComment[],
	model: Model,
	dispatch: (msg: Msg) => void,
): VNode => fileViewMemo.get(file.path, file, fileIdx, fileComments, model, dispatch);

// --- Diff Area ---

// Group comments by file path. Memoized on `model.comments` so unchanged runs
// return the same Map reference — which in turn means each file's
// `fileComments` array passes reference equality into the per-file memo.
const groupCommentsByFile = createMemo(
	(comments: readonly StoredComment[]) => [comments],
	(comments: readonly StoredComment[]): ReadonlyMap<string, readonly StoredComment[]> => {
		const byFile = new Map<string, StoredComment[]>();
		for (const comment of comments) {
			const bucket = byFile.get(comment.file);
			if (bucket) bucket.push(comment);
			else byFile.set(comment.file, [comment]);
		}
		return byFile;
	},
);

// Stable empty-comments array so files without comments still hit a cached
// fileComments reference on subsequent renders.
const EMPTY_COMMENTS: readonly StoredComment[] = [];

// Track the active view currently rendered so we can prune per-file memo
// entries when the view changes. Otherwise unmounted files' vnodes live
// forever in `fileViewMemo`'s slot Map.
let lastActiveView: string | null = null;

const buildDiffAreaView = (model: Model, dispatch: (msg: Msg) => void): VNode => {
	const data = model.data!;
	const diffData = data.diffs[model.activeView];
	const files = diffData?.files ?? [];

	if (files.length === 0) {
		return h("div.diff-area", [h("div.empty-state", "No files to display.")]);
	}

	if (lastActiveView !== model.activeView) {
		fileViewMemo.clear();
		lastActiveView = model.activeView;
	}

	installGlobalListener(dispatch);

	const commentsByFile = groupCommentsByFile(model.comments);

	return h(
		"div.diff-area",
		{
			hook: {
				destroy: () => {
					// The cached IntersectionObserver's root becomes a detached node
					// when .diff-area is removed. Nuke it so the next mount creates a
					// fresh one scoped to the new .diff-area.
					resetVirtualization();
				},
			},
		},
		files.map((file, idx) =>
			fileView(file, idx, commentsByFile.get(file.path) ?? EMPTY_COMMENTS, model, dispatch),
		),
	);
};

// Memoize the top-level diff area on the model slices that actually drive its
// content. Unrelated changes (summary, sidebarOpen, fileSearch*, pastReviews,
// viewingPastReview, sidebarWidth, collapsedDirs, error, submitted) reuse the
// cached vnode — so a summary keystroke no longer rebuilds every hunk chunk.
export const diffAreaView = createMemo(
	(model: Model, _dispatch: (msg: Msg) => void) => [
		model.data,
		model.activeView,
		model.contextExpansion,
		model.comments,
		model.commentDraft,
		model.dragSelection,
		getRenderEpoch(),
	],
	buildDiffAreaView,
);
