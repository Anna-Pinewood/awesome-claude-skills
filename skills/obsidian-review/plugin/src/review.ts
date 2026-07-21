import { MarkdownView, Menu, Notice, TFile, WorkspaceLeaf } from "obsidian";
import { ChangeSet, Compartment, RangeSetBuilder, Text } from "@codemirror/state";
import {
	Decoration,
	DecorationSet,
	EditorView,
	ViewPlugin,
	ViewUpdate,
	WidgetType,
} from "@codemirror/view";
import {
	Chunk,
	getChunks,
	getOriginalDoc,
	originalDocChangeEffect,
	unifiedMergeView,
} from "@codemirror/merge";
import type ObsidianReviewPlugin from "./main";
import { DIFF_VIEW_TYPE } from "./diffView";
import { PANEL_VIEW_TYPE, ReviewPanelView } from "./panel";
import { acceptDelete, acceptInsert, rejectDelete, rejectInsert } from "./chunkOps";

export interface PushPayload {
	files: { path: string; baseline: string; deleted: boolean }[];
}

export class ReviewManager {
	/** путь → базлайн (старое содержимое). Только память, только текущая сессия. */
	private pending = new Map<string, string>();
	private compartment = new Compartment();
	private actionEls = new WeakMap<MarkdownView, HTMLElement[]>();
	private statusEl: HTMLElement | null = null;
	lastError: string | null = null;

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
			const file = this.app.vault.getAbstractFileByPath(f.path);
			if (!(file instanceof TFile)) continue;
			// именно read, не cachedRead: push приходит сразу после внешней записи,
			// кэш Obsidian может ещё не видеть изменение
			const current = await this.app.vault.read(file);
			// файл уже в ревью → за основу берём СТАРЫЙ базлайн: дифф накапливается
			const baseline = normalizeFrontmatter(this.pending.get(f.path) ?? f.baseline, current);
			if (baseline === current) {
				// весь дифф свёлся к frontmatter (например, плагин дат) — не показываем
				this.pending.delete(f.path);
				continue;
			}
			this.pending.set(f.path, baseline);
			toOpen.push(f.path);
		}
		if (toOpen.length === 0 && deleted.length === 0) {
			this.updateStatus();
			return;
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
				visible: cm ? cm.dom.offsetParent !== null : null,
				viewport: cm ? { from: cm.viewport.from, to: cm.viewport.to, docLen: cm.state.doc.length } : null,
				hasEditor: Boolean(cm),
				hasMerge: chunks !== null,
				chunks: chunks?.chunks.length ?? null,
				// декорации в DOM: если счётчики > 0, а глазами пусто — проблема в CSS
				domChanged: cm?.dom.querySelectorAll(".cm-changedLine, .cm-changedText").length ?? null,
				domDeleted: cm?.dom.querySelectorAll(".cm-deletedChunk").length ?? null,
				domGutter: cm?.dom.querySelectorAll(".cm-changeGutter").length ?? null,
				changedBg: (() => {
					const el = cm?.dom.querySelector(".cm-changedLine");
					return el ? getComputedStyle(el).backgroundColor : null;
				})(),
				cmClasses: (() => {
					if (!cm) return null;
					const all = new Set<string>();
					cm.dom.querySelectorAll('[class*="cm-"]').forEach((el) => {
						for (const c of Array.from(el.classList)) all.add(c);
					});
					return [...all].filter((c) =>
						/changed|inserted|deleted|merge|chunk|spacer/i.test(c),
					);
				})(),
				deletedChunk: (() => {
					const el = cm?.dom.querySelector(".cm-deletedChunk") as HTMLElement | null;
					if (!el) return null;
					return {
						height: el.offsetHeight,
						display: getComputedStyle(el).display,
						html: el.outerHTML.slice(0, 700),
					};
				})(),
				origHead: chunks && cm ? getOriginalDoc(cm.state).toString().slice(0, 130) : null,
				docHead: cm ? cm.state.doc.sliceString(0, 130) : null,
				origTail: chunks && cm ? JSON.stringify(getOriginalDoc(cm.state).toString().slice(-80)) : null,
				docTail: cm ? JSON.stringify(cm.state.doc.toString().slice(-80)) : null,
				lens: chunks && cm ? { orig: getOriginalDoc(cm.state).length, doc: cm.state.doc.length } : null,
				chunkCoords: chunks?.chunks.map((c) => ({ fromA: c.fromA, toA: c.toA, fromB: c.fromB, toB: c.toB })) ?? null,
				btnDel: (() => {
					const el = cm?.dom.querySelector(".cm-deletedChunk .obsreview-btn") as HTMLElement | null;
					if (!el) return null;
					const s = getComputedStyle(el);
					return { fontSize: s.fontSize, color: s.color, w: el.offsetWidth, h: el.offsetHeight, overflow: s.overflow, indent: s.textIndent };
				})(),
				btnIns: (() => {
					const el = cm?.dom.querySelector(".obsreview-btns-ins .obsreview-btn") as HTMLElement | null;
					if (!el) return null;
					const s = getComputedStyle(el);
					return { fontSize: s.fontSize, color: s.color, w: el.offsetWidth, h: el.offsetHeight, overflow: s.overflow, indent: s.textIndent };
				})(),
			};
		});
		const greenVar = getComputedStyle(document.body)
			.getPropertyValue("--color-green-rgb")
			.trim();
		return { pending: [...this.pending.keys()], lastError: this.lastError, opLog: this.opLog, greenVar, views };
	}

	private async openForReview(path: string) {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;
		let leaf = this.findMarkdownLeaf(path);
		if (!leaf) {
			leaf = this.app.workspace.getLeaf("tab");
			await leaf.openFile(file, { active: false });
		}
		// подсветка живёт в редакторе — переводим вкладку в Live Preview
		// (mode: source + source: false = LP; source: true был бы raw-режимом)
		const state = leaf.getViewState();
		if (state.type === "markdown" && (state.state?.mode !== "source" || state.state?.source !== false)) {
			state.state = { ...state.state, mode: "source", source: false };
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
		cm.dispatch({ effects: this.compartment.reconfigure(this.mergeExtensions(path, baseline)) });
		this.addActions(view, path);
	}

	private mergeExtensions(path: string, baseline: string) {
		return [
			unifiedMergeView({
				original: baseline,
				// свои раздельные кнопки на удаление/добавление вместо встроенных
				mergeControls: false,
				// КРИТИЧНО: подсветка синтаксиса в удалённых блоках гоняет
				// кастомный маркдаун-парсер Obsidian вне редактора — тот падает
				// на null-viewport и рушит рендеринг всех декораций
				syntaxHighlightDeletions: false,
			}),
			EditorView.updateListener.of((u) => this.onEditorUpdate(u, path)),
			this.controlsPlugin(path),
		];
	}

	// ---- раздельные кнопки: удаление и добавление — независимые блоки ----

	/**
	 * Ханк-замена в диффе — это «удалено старое + добавлено новое». Разделяем:
	 * зелёная часть получает свои ✓/✗ (inline-виджет на первой добавленной
	 * строке), красная — свои (кнопки инжектятся в блок удалённого текста,
	 * который рисует @codemirror/merge).
	 */
	private controlsPlugin(path: string) {
		const manager = this;
		return ViewPlugin.fromClass(
			class {
				decorations: DecorationSet;
				constructor(view: EditorView) {
					this.decorations = manager.buildInsertControls(view, path);
					requestAnimationFrame(() => manager.injectDeleteControls(view, path));
				}
				update(u: ViewUpdate) {
					this.decorations = manager.buildInsertControls(u.view, path);
					requestAnimationFrame(() => manager.injectDeleteControls(u.view, path));
				}
			},
			{ decorations: (p) => p.decorations },
		);
	}

	private buildInsertControls(view: EditorView, path: string): DecorationSet {
		const builder = new RangeSetBuilder<Decoration>();
		const info = getChunks(view.state);
		if (!info) return builder.finish();
		for (const chunk of info.chunks) {
			if (chunk.fromB >= chunk.toB) continue; // ничего не добавлено
			const pos = Math.min(chunk.fromB, view.state.doc.length);
			builder.add(
				pos,
				pos,
				Decoration.widget({ widget: new InsertControlsWidget(this, path, pos), side: -1 }),
			);
		}
		return builder.finish();
	}

	private injectDeleteControls(view: EditorView, path: string) {
		view.dom.querySelectorAll(".cm-deletedChunk:not(.obsreview-hasctl)").forEach((chunkEl) => {
			chunkEl.classList.add("obsreview-hasctl");
			const ctl = createSpan({ cls: "obsreview-btns obsreview-btns-del" });
			ctl.appendChild(makeBtn("accept", "Принять удаление", () => {
				this.chunkOp(path, view, view.posAtDOM(chunkEl), "del", "accept");
			}));
			ctl.appendChild(makeBtn("reject", "Отклонить удаление (вернуть текст)", () => {
				this.chunkOp(path, view, view.posAtDOM(chunkEl), "del", "reject");
			}));
			// в начало первой красной строки — симметрично кнопкам добавления
			(chunkEl.querySelector(".cm-deletedLine") ?? chunkEl).prepend(ctl);
		});
	}

	opLog: string[] = [];

	chunkOp(path: string, view: EditorView, pos: number, part: "ins" | "del", action: "accept" | "reject") {
		try {
			this.chunkOpInner(path, view, pos, part, action);
			this.opLog.push(`${part}/${action} pos=${pos} ok`);
		} catch (e) {
			this.opLog.push(`${part}/${action} pos=${pos} FAIL: ${e instanceof Error ? e.stack : e}`);
		}
		if (this.opLog.length > 10) this.opLog.shift();
	}

	private chunkOpInner(path: string, view: EditorView, pos: number, part: "ins" | "del", action: "accept" | "reject") {
		const info = getChunks(view.state);
		if (!info) return;
		const chunk =
			info.chunks.find((c) => pos >= c.fromB && pos <= c.toB) ??
			info.chunks.reduce((best: Chunk | null, c) =>
				!best || Math.abs(c.fromB - pos) < Math.abs(best.fromB - pos) ? c : best, null);
		if (!chunk) return;

		const baseline = getOriginalDoc(view.state).toString();
		const doc = view.state.doc.toString();

		// original редактируется ТОЛЬКО через originalDocChangeEffect: reconfigure
		// бесполезен — CodeMirror сохраняет значения полей между реконфигурациями.
		// Математика регионов — в chunkOps (покрыта юнит-тестами, включая EOF).
		if (action === "accept") {
			const spec =
				part === "del" ? acceptDelete(chunk, baseline, doc) : acceptInsert(chunk, baseline, doc);
			if (!spec) return;
			const changes = ChangeSet.of(spec, baseline.length);
			view.dispatch({ effects: originalDocChangeEffect(view.state, changes), userEvent: "accept" });
		} else {
			const spec =
				part === "del" ? rejectDelete(chunk, baseline, doc) : rejectInsert(chunk, baseline, doc);
			if (!spec) return;
			view.dispatch({ changes: spec, userEvent: "revert" });
		}
	}

	/** Прогон операции без клика — для автономного тестирования через POST /op. */
	testOp(path: string, chunkIndex: number, part: "ins" | "del", action: "accept" | "reject") {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (!(view instanceof MarkdownView) || view.file?.path !== path) continue;
			const cm = (view.editor as unknown as { cm?: EditorView })?.cm;
			const info = cm ? getChunks(cm.state) : null;
			if (!cm || !info) continue;
			const chunk = info.chunks[chunkIndex];
			if (!chunk) return { ok: false, error: `нет ханка ${chunkIndex}, всего ${info.chunks.length}` };
			this.chunkOp(path, cm, Math.min(chunk.fromB, cm.state.doc.length), part, action);
			return {
				ok: true,
				log: this.opLog[this.opLog.length - 1],
				chunksAfter: getChunks(cm.state)?.chunks.length ?? null,
				docHead: cm.state.doc.sliceString(0, 250),
				origHead: getOriginalDoc(cm.state).toString().slice(0, 250),
			};
		}
		return { ok: false, error: "открытый редактор файла не найден" };
	}

	/**
	 * Следим за покнопочным принятием/отклонением внутри unified merge view:
	 * синхронизируем базлайн в мапе и закрываем ревью файла, когда ханков не осталось.
	 */
	private onEditorUpdate(u: ViewUpdate, path: string) {
		if (!this.pending.has(path)) return;
		const chunks = getChunks(u.state);
		if (!chunks) return;
		const orig = getOriginalDoc(u.state).toString();
		// плагины дат бампают frontmatter при каждом сохранении — не показываем это
		const normalized = normalizeFrontmatter(orig, u.state.doc.toString());
		if (normalized !== orig) {
			// dispatch внутри update-листенера запрещён — откладываем
			const view = u.view;
			window.setTimeout(() => this.applyFmNormalization(view, path), 0);
			return;
		}
		this.pending.set(path, orig);
		if (chunks.chunks.length === 0) {
			this.pending.delete(path);
			window.setTimeout(() => {
				this.attachToOpenViews();
				this.updateStatus();
			}, 0);
		} else {
			this.updateStatus();
		}
	}

	/** Подменить frontmatter в original на текущий — через штатный эффект. */
	private applyFmNormalization(view: EditorView, path: string) {
		if (!this.pending.has(path)) return;
		const state = view.state;
		if (getChunks(state) === null) return;
		const orig = getOriginalDoc(state).toString();
		const cur = state.doc.toString();
		if (normalizeFrontmatter(orig, cur) === orig) return;
		const origFmLen = orig.match(FM_RE)?.[0].length ?? 0;
		const curFm = cur.match(FM_RE)?.[0] ?? "";
		const changes = ChangeSet.of({ from: 0, to: origFmLen, insert: curFm }, orig.length);
		view.dispatch({ effects: originalDocChangeEffect(state, changes) });
	}

	// ---- статистика для панели: +добавлено −удалено (в строках) ----

	async diffStats(path: string): Promise<{ added: number; removed: number } | null> {
		const baseline = this.pending.get(path);
		if (baseline === undefined) return null;
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (!(view instanceof MarkdownView) || view.file?.path !== path) continue;
			const cm = (view.editor as unknown as { cm?: EditorView })?.cm;
			const info = cm ? getChunks(cm.state) : null;
			if (!cm || !info) continue;
			return statsFromChunks(info.chunks, getOriginalDoc(cm.state).toString(), cm.state.doc.toString());
		}
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return null;
		const current = await this.app.vault.cachedRead(file);
		const chunks = Chunk.build(Text.of(baseline.split("\n")), Text.of(current.split("\n")));
		return statsFromChunks(chunks, baseline, current);
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

// ---- хелперы ----

const FM_RE = /^---\r?\n[\s\S]*?\r?\n---(\r?\n|$)/;

/**
 * Подменяет frontmatter базлайна на текущий: свойства (created/last_modified
 * и прочие) исключаются из визуального диффа. Для новых файлов не трогаем.
 */
function normalizeFrontmatter(baseline: string, current: string): string {
	if (!baseline) return baseline;
	const cur = current.match(FM_RE)?.[0];
	if (!cur) return baseline;
	if (FM_RE.test(baseline)) return baseline.replace(FM_RE, cur);
	return cur + baseline;
}


function countLines(s: string): number {
	if (!s) return 0;
	return s.split("\n").length - (s.endsWith("\n") ? 1 : 0);
}

function statsFromChunks(
	chunks: readonly Chunk[],
	baseline: string,
	current: string,
): { added: number; removed: number } {
	let added = 0;
	let removed = 0;
	for (const c of chunks) {
		added += countLines(current.slice(Math.min(c.fromB, current.length), Math.min(c.toB, current.length)));
		removed += countLines(baseline.slice(Math.min(c.fromA, baseline.length), Math.min(c.toA, baseline.length)));
	}
	return { added, removed };
}

function makeBtn(kind: "accept" | "reject", title: string, onClick: () => void): HTMLButtonElement {
	const b = document.createElement("button");
	b.className = `obsreview-btn obsreview-btn-${kind}`;
	b.textContent = kind === "accept" ? "✓" : "✕";
	b.title = title;
	b.onclick = (e) => {
		e.preventDefault();
		e.stopPropagation();
		onClick();
	};
	return b;
}

class InsertControlsWidget extends WidgetType {
	constructor(
		private manager: ReviewManager,
		private path: string,
		private pos: number,
	) {
		super();
	}

	eq(other: InsertControlsWidget) {
		return other.pos === this.pos && other.path === this.path;
	}

	toDOM(view: EditorView) {
		const wrap = createSpan({ cls: "obsreview-btns obsreview-btns-ins" });
		wrap.appendChild(
			makeBtn("accept", "Принять добавление", () =>
				this.manager.chunkOp(this.path, view, this.pos, "ins", "accept"),
			),
		);
		wrap.appendChild(
			makeBtn("reject", "Отклонить добавление (убрать текст)", () =>
				this.manager.chunkOp(this.path, view, this.pos, "ins", "reject"),
			),
		);
		return wrap;
	}
}
