import { MarkdownView, Menu, Notice, TFile, WorkspaceLeaf } from "obsidian";
import { Compartment } from "@codemirror/state";
import { EditorView, ViewUpdate } from "@codemirror/view";
import { getChunks, getOriginalDoc, unifiedMergeView } from "@codemirror/merge";
import type ObsidianReviewPlugin from "./main";
import { DIFF_VIEW_TYPE } from "./diffView";
import { PANEL_VIEW_TYPE, ReviewPanelView } from "./panel";

export interface PushPayload {
	files: { path: string; baseline: string; deleted: boolean }[];
}

export class ReviewManager {
	/** путь → базлайн (старое содержимое). Только память, только текущая сессия. */
	private pending = new Map<string, string>();
	private compartment = new Compartment();
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
		await this.openPanel();
		this.attachToOpenViews();
		// рендеринг вкладок в Obsidian асинхронный — страхуемся повторными проходами
		window.setTimeout(() => this.attachToOpenViews(), 200);
		window.setTimeout(() => this.attachToOpenViews(), 1000);
		this.updateStatus();
	}

	pendingEntries(): { path: string; created: boolean }[] {
		return [...this.pending.entries()].map(([path, baseline]) => ({
			path,
			created: baseline === "",
		}));
	}

	/** Открыть файл ревью (из панели): переиспользуем вкладку, если уже открыт. */
	async revealFile(path: string) {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;
		const existing = this.findMarkdownLeaf(path);
		const leaf = existing ?? this.app.workspace.getLeaf("tab");
		if (!existing) await leaf.openFile(file);
		this.app.workspace.revealLeaf(leaf);
		this.app.workspace.setActiveLeaf(leaf, { focus: true });
		this.attachToOpenViews();
	}

	async openPanel() {
		let leaf = this.app.workspace.getLeavesOfType(PANEL_VIEW_TYPE)[0];
		if (!leaf) {
			const right = this.app.workspace.getRightLeaf(false);
			if (!right) return;
			await right.setViewState({ type: PANEL_VIEW_TYPE, active: false });
			leaf = right;
		}
		this.app.workspace.revealLeaf(leaf);
	}

	private refreshPanel() {
		for (const leaf of this.app.workspace.getLeavesOfType(PANEL_VIEW_TYPE)) {
			if (leaf.view instanceof ReviewPanelView) leaf.view.render();
		}
	}

	/** Живое состояние для отладки (GET /status). */
	debugStatus() {
		const views = this.app.workspace.getLeavesOfType("markdown").map((leaf) => {
			const view = leaf.view;
			if (!(view instanceof MarkdownView)) {
				return { deferred: true };
			}
			const cm = (view.editor as unknown as { cm?: EditorView })?.cm;
			const chunks = cm ? getChunks(cm.state) : null;
			return {
				path: view.file?.path ?? null,
				mode: view.getMode(),
				hasEditor: Boolean(cm),
				hasMerge: chunks !== null,
				chunks: chunks?.chunks.length ?? null,
				// декорации в DOM: если счётчики > 0, а глазами пусто — проблема в CSS
				domChanged: cm?.dom.querySelectorAll(".cm-changedLine, .cm-changedText").length ?? null,
				domDeleted: cm?.dom.querySelectorAll(".cm-deletedChunk").length ?? null,
				domGutter: cm?.dom.querySelectorAll(".cm-changeGutter").length ?? null,
			};
		});
		return { pending: [...this.pending.keys()], views };
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
			if (leaf.view instanceof MarkdownView && leaf.view.file?.path === path) return leaf;
		}
		return null;
	}

	// ---- подключение unified merge view к открытым редакторам ----

	/**
	 * Подключённость определяем по САМОМУ состоянию редактора (есть ли в нём
	 * merge-поле), а не по флажку на инстансе: Obsidian переиспользует один
	 * EditorView для разных файлов и пересоздаёт состояние при переключениях —
	 * любой внешний флажок немедленно врёт.
	 */
	attachToOpenViews() {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			// фоновые вкладки Obsidian ≥1.7 — deferred-заглушки, не MarkdownView
			if (!(view instanceof MarkdownView)) continue;
			const path = view.file?.path;
			const cm = (view.editor as unknown as { cm?: EditorView })?.cm;
			if (!cm) continue;
			const hasMerge = getChunks(cm.state) !== null;
			if (path && this.pending.has(path)) {
				if (!hasMerge) this.attach(view, cm, path);
				else this.addActions(view, path);
			} else {
				if (hasMerge) cm.dispatch({ effects: this.compartment.reconfigure([]) });
				this.removeActions(view);
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
		const n = getChunks(cm.state)?.chunks.length;
		console.log(`obsidian-review: attach ${path}, chunks=${n ?? "НЕТ ПОЛЯ"}`);
		this.addActions(view, path);
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
		// метим классом: WeakMap-учёт теряется при пересоздании вью, класс — нет
		els.forEach((el) => el.addClass("obsreview-action"));
		this.actionEls.set(view, els);
	}

	private removeActions(view: MarkdownView) {
		this.actionEls.get(view)?.forEach((el) => el.remove());
		this.actionEls.delete(view);
		view.containerEl.querySelectorAll(".obsreview-action").forEach((el) => el.remove());
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
		this.refreshPanel();
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
