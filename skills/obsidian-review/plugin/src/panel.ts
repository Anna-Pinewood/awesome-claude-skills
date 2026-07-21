import { ItemView, WorkspaceLeaf } from "obsidian";
import type ObsidianReviewPlugin from "./main";

export const PANEL_VIEW_TYPE = "obsidian-review-panel";

/**
 * Боковая панель: список всех файлов текущего ревью с навигацией и
 * действиями принять/отклонить на каждом файле и на всех разом.
 */
export class ReviewPanelView extends ItemView {
	constructor(
		leaf: WorkspaceLeaf,
		private plugin: ObsidianReviewPlugin,
	) {
		super(leaf);
	}

	getViewType() {
		return PANEL_VIEW_TYPE;
	}

	getDisplayText() {
		return "Ревью правок";
	}

	getIcon() {
		return "list-checks";
	}

	async onOpen() {
		this.render();
	}

	render() {
		const el = this.contentEl;
		el.empty();
		el.addClass("obsreview-panel");

		const files = this.plugin.review.pendingEntries();
		if (files.length === 0) {
			el.createEl("p", { text: "Нет правок на ревью.", cls: "obsreview-panel-empty" });
			return;
		}

		const header = el.createDiv({ cls: "obsreview-panel-header" });
		const acceptAll = header.createEl("button", {
			text: `✓ Принять все (${files.length})`,
			cls: "mod-cta",
		});
		acceptAll.onclick = () => this.plugin.review.acceptAll();
		const rejectAll = header.createEl("button", { text: "✗ Отклонить все" });
		rejectAll.onclick = () => void this.plugin.review.rejectAll();

		const list = el.createDiv();
		for (const f of files) {
			const row = list.createDiv({ cls: "obsreview-panel-row" });
			row.onclick = () => void this.plugin.review.revealFile(f.path);

			const name = row.createDiv({ cls: "obsreview-panel-name" });
			const title = name.createDiv({ cls: "obsreview-panel-title" });
			title.createSpan({ text: f.path.split("/").pop()?.replace(/\.md$/, "") ?? f.path });
			title.createSpan({
				text: f.created ? "новый" : "изменён",
				cls: `obsreview-badge ${f.created ? "is-created" : "is-modified"}`,
			});
			const stats = title.createSpan({ cls: "obsreview-stats" });
			void this.plugin.review.diffStats(f.path).then((s) => {
				if (!s) return;
				stats.createSpan({ text: `+${s.added}`, cls: "obsreview-plus" });
				stats.createSpan({ text: `−${s.removed}`, cls: "obsreview-minus" });
			});
			const dir = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "";
			if (dir) name.createDiv({ text: dir, cls: "obsreview-panel-dir" });

			const btns = row.createDiv({ cls: "obsreview-panel-btns" });
			const acc = btns.createEl("button", { text: "✓", attr: { title: "Принять файл" } });
			acc.onclick = (e) => {
				e.stopPropagation();
				this.plugin.review.acceptFile(f.path);
			};
			const rej = btns.createEl("button", { text: "✗", attr: { title: "Отклонить файл" } });
			rej.onclick = (e) => {
				e.stopPropagation();
				void this.plugin.review.rejectFile(f.path);
			};
		}
	}
}
