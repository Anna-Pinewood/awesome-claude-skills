// === Git & Diff Types ===

export type DiffLineType = "context" | "add" | "delete";

export type DiffLine = {
	readonly type: DiffLineType;
	readonly oldNum: number | null;
	readonly newNum: number | null;
	readonly content: string;
};

export type Hunk = {
	readonly oldStart: number;
	readonly newStart: number;
	readonly lines: readonly DiffLine[];
};

export type FileDiff = {
	readonly path: string;
	readonly oldPath?: string; // present for renames
	readonly language: string;
	readonly binary: boolean;
	readonly hunks: readonly Hunk[];
};

export type DiffData = {
	readonly files: readonly FileDiff[];
};

export type Commit = {
	readonly hash: string;
	readonly message: string;
	readonly date: string;
};

// === Mode Types ===

export type AppMode = "review" | "annotate";

// === API Types ===

export type ApiData = {
	readonly mode: AppMode;
	readonly commits: readonly Commit[];
	readonly diffs: Readonly<Record<string, DiffData>>; // "combined" | commit hash
	readonly message: string | null;
	readonly repo: string;
	readonly project: string | null;
};

// === Review Types ===

export type ReviewVerdict = "approved" | "changes-requested";
export type AnnotateAction = "save";
export type SubmitAction = ReviewVerdict | AnnotateAction;

export type ReviewComment = {
	readonly file: string;
	readonly startLine: number;
	readonly endLine: number;
	readonly text: string;
	readonly code: string;
	readonly selectedText?: string;
};

export type ReviewSubmission = {
	readonly verdict: SubmitAction;
	readonly summary: string;
	readonly comments: readonly ReviewComment[];
};

export type PastReviewMeta = {
	readonly filename: string;
};

// === Frontend State Types ===

export type CommentDraft = {
	readonly file: string;
	// Unique row IDs (flat index across the file's hunks) — drive visual highlighting
	// and let a range of deleted lines be selected distinctly from each other.
	readonly startRow: number;
	readonly endRow: number;
	// newNum-space range — used for code extraction, storage on save, and display.
	// For pure-deletion ranges, falls back to the nearest surviving newNum.
	readonly startLine: number;
	readonly endLine: number;
	readonly initialText?: string;
	readonly selectedText?: string;
	// Present when this draft was opened by editing a saved comment. On cancel we
	// put this comment back so Esc doesn't silently delete the user's work.
	readonly originalComment?: StoredComment;
};

export type DragSelection = {
	readonly file: string;
	readonly startRow: number;
	readonly endRow: number;
};

export type ContextExpansion = {
	readonly above: number;
	readonly below: number;
};

export type StoredComment = ReviewComment & {
	readonly id: string;
	// Row-space anchor for rendering. Pure-deletion ranges have no newNum, so
	// matching the saved-comment position by endLine (newNum-space) lands the
	// banner at the surviving line below the deleted block. rowEnd is the
	// end-row rowId of the selection and always points to a rendered line.
	readonly rowEnd: number;
};

export type CommentSnapshot = {
	readonly comments: readonly StoredComment[];
	readonly commentDraft: CommentDraft | null;
};

export type Model = {
	readonly data: ApiData | null;
	readonly activeView: string; // "combined" | commit hash
	readonly contextExpansion: Readonly<Record<string, ContextExpansion>>; // key: `${fileIdx}-${hunkIdx}`
	readonly comments: readonly StoredComment[];
	readonly summary: string;
	readonly sidebarOpen: boolean;
	readonly commentDraft: CommentDraft | null;
	readonly dragSelection: DragSelection | null;
	readonly submitted: boolean;
	readonly error: string | null;
	readonly pastReviews: readonly PastReviewMeta[];
	readonly viewingPastReview: string | null;
	readonly fileSearchOpen: boolean;
	readonly fileSearchQuery: string;
	readonly fileSearchSelectedIdx: number;
	readonly collapsedDirs: ReadonlySet<string>;
	readonly sidebarWidth: number;
};

// === Frontend Message Types ===

export type Msg =
	| { readonly type: "dataLoaded"; readonly data: ApiData }
	| { readonly type: "dataError"; readonly error: string }
	| { readonly type: "setActiveView"; readonly view: string }
	| { readonly type: "expandContext"; readonly key: string; readonly direction: "above" | "below" }
	| { readonly type: "startComment"; readonly draft: CommentDraft }
	| { readonly type: "cancelComment" }
	| {
			readonly type: "saveComment";
			readonly text: string;
			readonly code: string;
	  }
	| { readonly type: "editComment"; readonly id: string }
	| { readonly type: "deleteComment"; readonly id: string }
	| { readonly type: "setSummary"; readonly summary: string }
	| { readonly type: "toggleSidebar" }
	| { readonly type: "submit"; readonly verdict: SubmitAction }
	| { readonly type: "submitted" }
	| { readonly type: "pastReviewsLoaded"; readonly reviews: readonly PastReviewMeta[] }
	| { readonly type: "fetchPastReview"; readonly filename: string }
	| { readonly type: "viewPastReview"; readonly content: string }
	| { readonly type: "closePastReview" }
	| { readonly type: "deletePastReview"; readonly filename: string }
	| { readonly type: "reviewDeleted"; readonly filename: string }
	| { readonly type: "startDrag"; readonly file: string; readonly startRow: number }
	| { readonly type: "updateDrag"; readonly endRow: number }
	| { readonly type: "endDrag" }
	| { readonly type: "openFileSearch" }
	| { readonly type: "closeFileSearch" }
	| { readonly type: "setFileSearchQuery"; readonly query: string }
	| { readonly type: "fileSearchNavigate"; readonly direction: 1 | -1 }
	| { readonly type: "toggleDir"; readonly path: string }
	| { readonly type: "setSidebarWidth"; readonly width: number }
	| { readonly type: "filesHighlighted" };
