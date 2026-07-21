import type { ContextExpansion, FileDiff, Model, Msg, StoredComment } from "../types.ts";

let commentIdCounter = 0;

const findFile = (model: Model, path: string): FileDiff | null => {
	const diffData = model.data?.diffs[model.activeView] ?? model.data?.diffs.combined;
	return diffData?.files.find((f) => f.path === path) ?? null;
};

// Flatten a file's hunks into a single line array; rowId is the index here.
const flattenLines = (file: FileDiff) => file.hunks.flatMap((h) => h.lines);

// Convert a row-ID range to a newNum range. Uses the min/max newNum of any
// line in the range; for pure-deletion ranges with no surviving line, falls
// back to the nearest surviving newNum after (then before) the range.
const rowRangeToLineRange = (
	file: FileDiff,
	startRow: number,
	endRow: number,
): { startLine: number; endLine: number } => {
	const lo = Math.min(startRow, endRow);
	const hi = Math.max(startRow, endRow);
	const lines = flattenLines(file);

	let firstNew: number | null = null;
	let lastNew: number | null = null;
	for (let i = lo; i <= hi && i < lines.length; i++) {
		const n = lines[i]!.newNum;
		if (n != null) {
			if (firstNew == null) firstNew = n;
			lastNew = n;
		}
	}
	if (firstNew != null && lastNew != null) return { startLine: firstNew, endLine: lastNew };

	for (let i = hi + 1; i < lines.length; i++) {
		const n = lines[i]!.newNum;
		if (n != null) return { startLine: n, endLine: n };
	}
	for (let i = lo - 1; i >= 0; i--) {
		const n = lines[i]!.newNum;
		if (n != null) return { startLine: n, endLine: n };
	}
	return { startLine: 1, endLine: 1 };
};

// Find row IDs that bracket a newNum range — first line with newNum >= startLine
// and last line with newNum <= endLine. Used when reopening a saved comment for edit.
const lineRangeToRowRange = (
	file: FileDiff,
	startLine: number,
	endLine: number,
): { startRow: number; endRow: number } => {
	const lines = flattenLines(file);
	let startRow = -1;
	let endRow = -1;
	for (let i = 0; i < lines.length; i++) {
		const n = lines[i]!.newNum;
		if (n == null) continue;
		if (startRow === -1 && n >= startLine) startRow = i;
		if (n <= endLine) endRow = i;
	}
	if (startRow === -1) startRow = 0;
	if (endRow === -1) endRow = startRow;
	return { startRow, endRow };
};

export const update = (model: Model, msg: Msg): Model => {
	switch (msg.type) {
		case "dataLoaded":
			return { ...model, data: msg.data, error: null };
		case "dataError":
			return { ...model, error: msg.error };
		case "setActiveView":
			return { ...model, activeView: msg.view, contextExpansion: {} };
		case "expandContext": {
			const isGap = msg.key.includes("-gap-");
			const current: ContextExpansion =
				model.contextExpansion[msg.key] ??
				(isGap ? { above: 0, below: 0 } : { above: 3, below: 3 });
			const updated: ContextExpansion =
				msg.direction === "above"
					? { ...current, above: current.above + 20 }
					: { ...current, below: current.below + 20 };
			return { ...model, contextExpansion: { ...model.contextExpansion, [msg.key]: updated } };
		}
		case "startComment":
			return { ...model, commentDraft: msg.draft };
		case "cancelComment": {
			const original = model.commentDraft?.originalComment;
			if (original) {
				return {
					...model,
					commentDraft: null,
					comments: [...model.comments, original],
				};
			}
			return { ...model, commentDraft: null };
		}
		case "startDrag":
			return {
				...model,
				dragSelection: { file: msg.file, startRow: msg.startRow, endRow: msg.startRow },
				commentDraft: null,
			};
		case "updateDrag": {
			if (!model.dragSelection) return model;
			if (model.dragSelection.endRow === msg.endRow) return model;
			return {
				...model,
				dragSelection: { ...model.dragSelection, endRow: msg.endRow },
			};
		}
		case "endDrag": {
			const drag = model.dragSelection;
			if (!drag) return model;
			const file = findFile(model, drag.file);
			if (!file) return { ...model, dragSelection: null };
			const startRow = Math.min(drag.startRow, drag.endRow);
			const endRow = Math.max(drag.startRow, drag.endRow);
			const { startLine, endLine } = rowRangeToLineRange(file, startRow, endRow);
			return {
				...model,
				dragSelection: null,
				commentDraft: { file: drag.file, startRow, endRow, startLine, endLine },
			};
		}
		case "saveComment": {
			if (!model.commentDraft) return model;
			const id = `comment-${++commentIdCounter}`;
			const newComment: StoredComment = {
				id,
				file: model.commentDraft.file,
				startLine: model.commentDraft.startLine,
				endLine: model.commentDraft.endLine,
				rowEnd: Math.max(model.commentDraft.startRow, model.commentDraft.endRow),
				text: msg.text,
				code: msg.code,
				...(model.commentDraft.selectedText
					? { selectedText: model.commentDraft.selectedText }
					: {}),
			};
			return {
				...model,
				comments: [...model.comments, newComment],
				commentDraft: null,
			};
		}
		case "editComment": {
			const comment = model.comments.find((c) => c.id === msg.id);
			if (!comment) return model;
			const file = findFile(model, comment.file);
			const rows = file
				? lineRangeToRowRange(file, comment.startLine, comment.endLine)
				: { startRow: 0, endRow: 0 };
			return {
				...model,
				commentDraft: {
					file: comment.file,
					startRow: rows.startRow,
					endRow: rows.endRow,
					startLine: comment.startLine,
					endLine: comment.endLine,
					initialText: comment.text,
					originalComment: comment,
					...(comment.selectedText ? { selectedText: comment.selectedText } : {}),
				},
				comments: model.comments.filter((c) => c.id !== msg.id),
			};
		}
		case "deleteComment":
			return { ...model, comments: model.comments.filter((c) => c.id !== msg.id) };
		case "setSummary":
			return { ...model, summary: msg.summary };
		case "toggleSidebar":
			return { ...model, sidebarOpen: !model.sidebarOpen };
		case "submit":
			return { ...model, submitted: true };
		case "submitted":
			return { ...model, submitted: true };
		case "pastReviewsLoaded":
			return { ...model, pastReviews: msg.reviews };
		case "fetchPastReview":
			return model;
		case "deletePastReview":
			return model;
		case "viewPastReview":
			return { ...model, viewingPastReview: msg.content };
		case "closePastReview":
			return { ...model, viewingPastReview: null };
		case "reviewDeleted":
			return {
				...model,
				pastReviews: model.pastReviews.filter((r) => r.filename !== msg.filename),
			};
		case "openFileSearch":
			return { ...model, fileSearchOpen: true, fileSearchQuery: "", fileSearchSelectedIdx: 0 };
		case "closeFileSearch":
			return { ...model, fileSearchOpen: false, fileSearchQuery: "", fileSearchSelectedIdx: 0 };
		case "setFileSearchQuery":
			return { ...model, fileSearchQuery: msg.query, fileSearchSelectedIdx: 0 };
		case "fileSearchNavigate": {
			const diffData = model.data?.diffs[model.activeView];
			const files = diffData?.files ?? [];
			const query = model.fileSearchQuery.toLowerCase();
			const matchCount = query
				? files.filter((f) => f.path.toLowerCase().includes(query)).length
				: files.length;
			if (matchCount === 0) return model;
			const next = model.fileSearchSelectedIdx + msg.direction;
			return {
				...model,
				fileSearchSelectedIdx: Math.max(0, Math.min(matchCount - 1, next)),
			};
		}
		case "toggleDir": {
			const dirs = new Set(model.collapsedDirs);
			if (dirs.has(msg.path)) {
				dirs.delete(msg.path);
			} else {
				dirs.add(msg.path);
			}
			return { ...model, collapsedDirs: dirs };
		}
		case "setSidebarWidth":
			return { ...model, sidebarWidth: msg.width };
		case "filesHighlighted":
			return model;
	}
};
