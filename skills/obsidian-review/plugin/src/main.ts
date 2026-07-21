import { App, MarkdownView, Plugin, PluginSettingTab, Setting } from "obsidian";
import { ReviewManager } from "./review";
import { ReviewServer } from "./server";
import { DIFF_VIEW_TYPE, SideBySideDiffView } from "./diffView";
import { PANEL_VIEW_TYPE, ReviewPanelView } from "./panel";

interface ReviewSettings {
	port: number;
	token: string;
}

const DEFAULT_SETTINGS: ReviewSettings = { port: 3002, token: "" };

function generateToken(): string {
	const bytes = new Uint8Array(24);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export default class ObsidianReviewPlugin extends Plugin {
	settings!: ReviewSettings;
	review!: ReviewManager;
	server!: ReviewServer;

	async onload() {
		await this.loadSettings();
		this.review = new ReviewManager(this);
		this.server = new ReviewServer(this);

		this.registerEditorExtension(this.review.editorExtension());
		this.registerView(DIFF_VIEW_TYPE, (leaf) => new SideBySideDiffView(leaf, this));
		this.registerView(PANEL_VIEW_TYPE, (leaf) => new ReviewPanelView(leaf, this));

		this.addCommand({
			id: "open-panel",
			name: "Открыть панель ревью",
			callback: () => void this.review.openPanel(),
		});

		this.addCommand({
			id: "accept-all",
			name: "Принять все правки",
			callback: () => this.review.acceptAll(),
		});
		this.addCommand({
			id: "reject-all",
			name: "Отклонить все правки",
			callback: () => void this.review.rejectAll(),
		});
		this.addCommand({
			id: "accept-file",
			name: "Принять правки в текущем файле",
			checkCallback: (checking) => this.currentFileCommand(checking, (p) => this.review.acceptFile(p)),
		});
		this.addCommand({
			id: "reject-file",
			name: "Отклонить правки в текущем файле",
			checkCallback: (checking) => this.currentFileCommand(checking, (p) => void this.review.rejectFile(p)),
		});
		this.addCommand({
			id: "toggle-diff",
			name: "Переключить side-by-side дифф",
			checkCallback: (checking) => {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				const path = view?.file?.path;
				if (!path || !this.review.hasPending(path)) return false;
				if (!checking) this.review.openDiffView(view.leaf, path);
				return true;
			},
		});

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => this.review.attachToOpenViews()),
		);
		this.registerEvent(this.app.workspace.on("file-open", () => this.review.attachToOpenViews()));
		this.registerEvent(this.app.workspace.on("layout-change", () => this.review.attachToOpenViews()));

		this.review.initStatusBar(this.addStatusBarItem());
		this.addSettingTab(new ReviewSettingTab(this.app, this));
		this.server.start();
	}

	onunload() {
		this.server.stop();
	}

	private currentFileCommand(checking: boolean, action: (path: string) => void): boolean {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		const diffView = this.app.workspace.getActiveViewOfType(SideBySideDiffView);
		const path = view?.file?.path ?? diffView?.filePath;
		if (!path || !this.review.hasPending(path)) return false;
		if (!checking) action(path);
		return true;
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		if (!this.settings.token) {
			this.settings.token = generateToken();
			await this.saveSettings();
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class ReviewSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: ObsidianReviewPlugin,
	) {
		super(app, plugin);
	}

	display() {
		this.containerEl.empty();

		new Setting(this.containerEl)
			.setName("Порт")
			.setDesc("Localhost-порт, на который push-review.sh шлёт диффы. Должен совпадать с OBSREVIEW_PORT в конфиге скриптов (по умолчанию 3002).")
			.addText((t) =>
				t.setValue(String(this.plugin.settings.port)).onChange(async (v) => {
					const port = Number(v);
					if (!Number.isInteger(port) || port < 1024 || port > 65535) return;
					this.plugin.settings.port = port;
					await this.plugin.saveSettings();
					this.plugin.server.restart();
				}),
			);

		new Setting(this.containerEl)
			.setName("Токен")
			.setDesc("Скрипты читают его из data.json автоматически — руками копировать не нужно.")
			.addText((t) => {
				t.setValue(this.plugin.settings.token);
				t.inputEl.readOnly = true;
			})
			.addButton((b) =>
				b.setButtonText("Перегенерировать").onClick(async () => {
					this.plugin.settings.token = generateToken();
					await this.plugin.saveSettings();
					this.display();
				}),
			);
	}
}
