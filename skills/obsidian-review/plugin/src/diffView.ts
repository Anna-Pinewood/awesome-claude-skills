import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import { MergeView } from "@codemirror/merge";
import { EditorState, RangeSetBuilder } from "@codemirror/state";
import {
	Decoration,
	DecorationSet,
	EditorView,
	ViewPlugin,
	ViewUpdate,
	WidgetType,
	lineNumbers,
} from "@codemirror/view";
import type ObsidianReviewPlugin from "./main";

export const DIFF_VIEW_TYPE = "obsidian-review-diff";

/**
 * Side-by-side дифф: слева базлайн (read-only), справа текущий текст файла.
 * У каждого ханка кнопки ✓ (принять: базлайн подтягивается к текущему) и
 * ✗ (отклонить: старый текст записывается в правую панель и в файл).
 */
export class SideBySideDiffView extends ItemView {
	filePath = "";
	private mergeView: MergeView | null = null;
	private file: TFile | null = null;
	private writeTimer: number | null = null;
	private writingToDisk = false;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: ObsidianReviewPlugin,
	) {
		super(leaf);
	}

	getViewType() {
		return DIFF_VIEW_TYPE;
	}

	getDisplayText() {
		return this.filePath ? `Дифф: ${this.filePath.split("/").pop()}` : "Дифф";
	}

	getIcon() {
		return "columns-2";
	}

	getState(): Record<string, unknown> {
		return { file: this.filePath };
	}

	async setState(state: { file?: string }, result: unknown) {
		this.filePath = state.file ?? "";
		await super.setState(state, result as never);
		await this.render();
	}

	async onClose() {
		await this.flushWrite();
		this.mergeView?.destroy();
		this.mergeView = null;
	}

	private async render() {
		const container = this.contentEl;
		container.empty();
		container.addClass("obsreview-diff-container");
		this.mergeView?.destroy();
		this.mergeView = null;

		const baseline = this.plugin.review.getBaseline(this.filePath);
		const af = this.app.vault.getAbstractFileByPath(this.filePath);
		if (baseline === undefined || !(af instanceof TFile)) {
			container.createEl("p", { text: "Для этого файла нет активного ревью." });
			return;
		}
		this.file = af;
		const current = await this.app.vault.read(af);

		const toolbar = container.createDiv({ cls: "obsreview-diff-toolbar" });
		toolbar.createEl("button", { text: "← К заметке" }).onclick = () =>
			this.plugin.review.closeDiffView(this.leaf, this.filePath);
		toolbar.createDiv({ cls: "obsreview-diff-title", text: this.filePath });
		toolbar.createEl("button", { text: "✗ Отклонить файл" }).onclick = () =>
			void this.plugin.review.rejectFile(this.filePath);
		toolbar.createEl("button", { text: "✓ Принять файл", cls: "mod-cta" }).onclick = () =>
			this.plugin.review.acceptFile(this.filePath);

		const host = container.createDiv({ cls: "obsreview-diff-panes" });
		this.mergeView = new MergeView({
			parent: host,
			gutter: true,
			highlightChanges: true,
			a: {
				doc: baseline,
				extensions: [
					lineNumbers(),
					EditorView.lineWrapping,
					EditorView.editable.of(false),
					EditorState.readOnly.of(true),
				],
			},
			b: {
				doc: current,
				extensions: [
					lineNumbers(),
					EditorView.lineWrapping,
					EditorView.updateListener.of((u) => this.onCurrentChanged(u)),
					this.chunkButtonsExtension(),
				],
			},
		});

		// файл поменяли снаружи (например, в соседней вкладке-заметке) — обновляем правую панель
		this.registerEvent(
			this.app.vault.on("modify", (f) => {
				if (f.path === this.filePath && !this.writingToDisk) void this.syncFromDisk();
			}),
		);
	}

	// ---- принятие/отклонение ханков ----

	private acceptChunk(index: number) {
		const mv = this.mergeView;
		if (!mv) return;
		const chunk = mv.chunks[index];
		if (!chunk) return;
		const bText = mv.b.state.sliceDoc(chunk.fromB, Math.min(chunk.toB, mv.b.state.doc.length));
		mv.a.dispatch({
			changes: {
				from: chunk.fromA,
				to: Math.min(chunk.toA, mv.a.state.doc.length),
				insert: bText,
			},
		});
		// «принять» = базлайн подтянулся к текущему состоянию в этом месте
		this.plugin.review.setBaseline(this.filePath, mv.a.state.doc.toString());
		this.refreshAfterChunkOp();
	}

	private rejectChunk(index: number) {
		const mv = this.mergeView;
		if (!mv) return;
		const chunk = mv.chunks[index];
		if (!chunk) return;
		const aText = mv.a.state.sliceDoc(chunk.fromA, Math.min(chunk.toA, mv.a.state.doc.length));
		mv.b.dispatch({
			changes: {
				from: chunk.fromB,
				to: Math.min(chunk.toB, mv.b.state.doc.length),
				insert: aText,
			},
		});
		// запись в файл сделает onCurrentChanged
	}

	private refreshAfterChunkOp() {
		const mv = this.mergeView;
		if (!mv) return;
		// декорации кнопок живут в b-редакторе: пните его пустой транзакцией,
		// чтобы пересчитались позиции после изменения a-стороны
		mv.b.dispatch({});
		if (mv.chunks.length === 0) {
			void this.flushWrite().then(() => this.plugin.review.completeFromDiffView(this.filePath));
		}
	}

	// ---- синхронизация правой панели с файлом ----

	private onCurrentChanged(u: ViewUpdate) {
		if (u.docChanged) {
			if (this.writeTimer !== null) window.clearTimeout(this.writeTimer);
			this.writeTimer = window.setTimeout(() => void this.flushWrite(), 300);
		}
		const mv = this.mergeView;
		if (mv && mv.chunks.length === 0 && this.plugin.review.hasPending(this.filePath)) {
			void this.flushWrite().then(() => this.plugin.review.completeFromDiffView(this.filePath));
		}
	}

	private async flushWrite() {
		if (this.writeTimer !== null) {
			window.clearTimeout(this.writeTimer);
			this.writeTimer = null;
		}
		const mv = this.mergeView;
		if (!mv || !this.file) return;
		const text = mv.b.state.doc.toString();
		const onDisk = await this.app.vault.read(this.file);
		if (onDisk === text) return;
		this.writingToDisk = true;
		try {
			await this.app.vault.modify(this.file, text);
		} finally {
			this.writingToDisk = false;
		}
	}

	private async syncFromDisk() {
		const mv = this.mergeView;
		if (!mv || !this.file) return;
		const onDisk = await this.app.vault.read(this.file);
		if (onDisk === mv.b.state.doc.toString()) return;
		mv.b.dispatch({
			changes: { from: 0, to: mv.b.state.doc.length, insert: onDisk },
		});
	}

	// ---- кнопки ✓/✗ на ханках ----

	private chunkButtonsExtension() {
		const owner = this;
		return ViewPlugin.fromClass(
			class {
				decorations: DecorationSet;
				constructor(view: EditorView) {
					this.decorations = owner.buildChunkDecorations(view);
				}
				update(u: ViewUpdate) {
					this.decorations = owner.buildChunkDecorations(u.view);
				}
			},
			{ decorations: (p) => p.decorations },
		);
	}

	private buildChunkDecorations(view: EditorView): DecorationSet {
		const mv = this.mergeView;
		const builder = new RangeSetBuilder<Decoration>();
		if (!mv) return builder.finish();
		mv.chunks.forEach((chunk, i) => {
			const pos = Math.min(chunk.fromB, view.state.doc.length);
			builder.add(
				pos,
				pos,
				Decoration.widget({ widget: new ChunkButtonsWidget(this, i), side: -1 }),
			);
		});
		return builder.finish();
	}

	chunkAction(index: number, kind: "accept" | "reject") {
		if (kind === "accept") this.acceptChunk(index);
		else this.rejectChunk(index);
	}
}

class ChunkButtonsWidget extends WidgetType {
	constructor(
		private owner: SideBySideDiffView,
		private index: number,
	) {
		super();
	}

	eq(other: ChunkButtonsWidget) {
		return other.index === this.index;
	}

	toDOM() {
		const wrap = document.createElement("span");
		wrap.className = "obsreview-chunk-btns";
		const accept = wrap.appendChild(document.createElement("button"));
		accept.textContent = "✓";
		accept.title = "Принять это изменение";
		accept.onclick = () => this.owner.chunkAction(this.index, "accept");
		const reject = wrap.appendChild(document.createElement("button"));
		reject.textContent = "✗";
		reject.title = "Отклонить это изменение";
		reject.onclick = () => this.owner.chunkAction(this.index, "reject");
		return wrap;
	}
}
