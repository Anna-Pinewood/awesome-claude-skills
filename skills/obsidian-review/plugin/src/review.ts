import { MarkdownView, Menu, Notice, TFile, WorkspaceLeaf } from "obsidian";
import { Compartment } from "@codemirror/state";
import { EditorView, ViewUpdate } from "@codemirror/view";
import { getChunks, getOriginalDoc, unifiedMergeView } from "@codemirror/merge";
import type ObsidianReviewPlugin from "./main";
import { DIFF_VIEW_TYPE } from "./diffView";

export interface PushPayload {
	files: { path: string; baseline: string; deleted: boolean }[];
}

export class ReviewManager {
	/** путь → базлайн (старое содержимое). Только память, только текущая сессия. */
	private pending = new Map<string, string>();
	private compartment = new Compartment();
	private attached = new WeakSet<EditorView>();
	private actionEls = new WeakMap<MarkdownView, HTMLElement[]>();
	private statusEl: HTMLElement | null = null;

	constructor(private plugin: ObsidianReviewPlugin) {}

	private get app() {
		return this.plugin.app;
	}

	editorExtension() {
		return this.compartment.of([]);
	}

	hasPending(path: string): boolean {
		return this.pending.has(path);
	}

	getBaseline(path: string): string | undefined {
		return this.pending.get(path);
	}

	setBaseline(path: string, baseline: string) {
		if (this.pending.has(path)) this.pending.set(path, baseline);
	}

	// ---- приём пакета от push-review.sh ----

	async receivePush(payload: PushPayload) {
		const deleted: string[] = [];
		const toOpen: string[] = [];
		for (const f of payload.files) {
			if (f.deleted) {
				this.pending.delete(f.path);
				deleted.push(f.path);
				continue;
			}
			// файл уже в ревью → оставляем СТАРЫЙ базлайн: дифф накапливается
			if (!this.pending.has(f.path)) this.pending.set(f.path, f.baseline);
			toOpen.push(f.path);
		}
		let msg = `Claude изменил файлов: ${toOpen.length}`;
		if (deleted.length) msg += `\nУдалено: ${deleted.join(", ")} (восстановление — из git-архива)`;
		new Notice(msg, 8000);

		for (const path of toOpen) await this.openForReview(path);
		this.attachToOpenViews();
		this.updateStatus();
	}

	private async openForReview(path: string) {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;
		let leaf = this.findMarkdownLeaf(path);
		if (!leaf) {
			leaf = this.app.workspace.getLeaf("tab");
			await leaf.openFile(file, { active: false });
		}
		// подсветка живёт в редакторе — переводим вкладку в Live Preview/source
		const state = leaf.getViewState();
		if (state.type === "markdown" && state.state?.mode !== "source") {
			state.state = { ...state.state, mode: "source" };
			await leaf.setViewState(state);
		}
	}

	private findMarkdownLeaf(path: string): WorkspaceLeaf | null {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			if ((leaf.view as MarkdownView).file?.path === path) return leaf;
		}
		return null;
	}

	// ---- подключение unified merge view к открытым редакторам ----

	attachToOpenViews() {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view as MarkdownView;
			const path = view.file?.path;
			const cm = (view.editor as unknown as { cm?: EditorView })?.cm;
			if (!cm) continue;
			if (path && this.pending.has(path)) {
				if (!this.attached.has(cm)) this.attach(view, cm, path);
			} else if (this.attached.has(cm)) {
				this.detach(view, cm);
			}
		}
	}

	private attach(view: MarkdownView, cm: EditorView, path: string) {
		const baseline = this.pending.get(path);
		if (baseline === undefined) return;
		cm.dispatch({
			effects: this.compartment.reconfigure([
				unifiedMergeView({ original: baseline, mergeControls: true }),
				EditorView.updateListener.of((u) => this.onEditorUpdate(u, path)),
			]),
		});
		this.attached.add(cm);
		this.addActions(view, path);
	}

	private detach(view: MarkdownView, cm: EditorView) {
		cm.dispatch({ effects: this.compartment.reconfigure([]) });
		this.attached.delete(cm);
		this.removeActions(view);
	}

	/**
	 * Следим за покнопочным принятием/отклонением внутри unified merge view:
	 * синхронизируем базлайн в мапе и закрываем ревью файла, когда ханков не осталось.
	 */
	private onEditorUpdate(u: ViewUpdate, path: string) {
		if (!this.pending.has(path)) return;
		const chunks = getChunks(u.state);
		if (!chunks) return;
		this.pending.set(path, getOriginalDoc(u.state).toString());
		if (chunks.chunks.length === 0) {
			this.pending.delete(path);
			// dispatch внутри update-листенера запрещён — откладываем
			window.setTimeout(() => {
				this.attachToOpenViews();
				this.updateStatus();
			}, 0);
		} else {
			this.updateStatus();
		}
	}

	// ---- операции уровня файла и «всё» ----

	acceptFile(path: string) {
		if (!this.pending.delete(path)) return;
		this.afterFileResolved(path);
	}

	async rejectFile(path: string) {
		const baseline = this.pending.get(path);
		if (baseline === undefined) return;
		this.pending.delete(path);
		this.afterFileResolved(path);
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			if (baseline === "") {
				// файл создан агентом — откат означает удаление (в корзину Obsidian)
				await this.app.fileManager.trashFile(file);
			} else {
				await this.app.vault.modify(file, baseline);
			}
		}
	}

	acceptAll() {
		for (const path of [...this.pending.keys()]) this.acceptFile(path);
		new Notice("Все правки приняты");
	}

	async rejectAll() {
		for (const path of [...this.pending.keys()]) await this.rejectFile(path);
		new Notice("Все правки отклонены");
	}

	/** Вызывается side-by-side вью, когда в файле не осталось ханков. */
	completeFromDiffView(path: string) {
		this.pending.delete(path);
		this.afterFileResolved(path);
	}

	private afterFileResolved(path: string) {
		this.attachToOpenViews();
		this.closeDiffViews(path);
		this.updateStatus();
	}

	// ---- side-by-side ----

	openDiffView(leaf: WorkspaceLeaf, path: string) {
		void leaf.setViewState({ type: DIFF_VIEW_TYPE, state: { file: path }, active: true });
	}

	closeDiffView(leaf: WorkspaceLeaf, path: string) {
		void leaf.setViewState({
			type: "markdown",
			state: { file: path, mode: "source" },
			active: true,
		});
	}

	private closeDiffViews(path: string) {
		for (const leaf of this.app.workspace.getLeavesOfType(DIFF_VIEW_TYPE)) {
			const state = leaf.getViewState();
			if (state.state?.file === path) this.closeDiffView(leaf, path);
		}
	}

	// ---- кнопки в шапке вкладки ----

	private addActions(view: MarkdownView, path: string) {
		this.removeActions(view);
		const els = [
			view.addAction("columns-2", "Side-by-side дифф", () => this.openDiffView(view.leaf, path)),
			view.addAction("x", "Отклонить правки в файле", () => void this.rejectFile(path)),
			view.addAction("check", "Принять правки в файле", () => this.acceptFile(path)),
		];
		this.actionEls.set(view, els);
	}

	private removeActions(view: MarkdownView) {
		this.actionEls.get(view)?.forEach((el) => el.remove());
		this.actionEls.delete(view);
	}

	// ---- статус-бар ----

	initStatusBar(el: HTMLElement) {
		this.statusEl = el;
		el.addClass("mod-clickable");
		el.addEventListener("click", (evt) => {
			const menu = new Menu();
			menu.addItem((i) => i.setTitle("Принять все правки").setIcon("check").onClick(() => this.acceptAll()));
			menu.addItem((i) => i.setTitle("Отклонить все правки").setIcon("x").onClick(() => void this.rejectAll()));
			menu.showAtMouseEvent(evt);
		});
		this.updateStatus();
	}

	private updateStatus() {
		if (!this.statusEl) return;
		const n = this.pending.size;
		if (n === 0) {
			this.statusEl.hide();
		} else {
			this.statusEl.show();
			this.statusEl.setText(`Ревью: ${n}`);
		}
	}
}
