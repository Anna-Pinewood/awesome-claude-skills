import * as http from "http";
import { Notice } from "obsidian";
import type ObsidianReviewPlugin from "./main";
import type { PushPayload } from "./review";

const MAX_BODY = 100 * 1024 * 1024;

export class ReviewServer {
	private server: http.Server | null = null;

	constructor(private plugin: ObsidianReviewPlugin) {}

	start() {
		this.server = http.createServer((req, res) => this.handle(req, res));
		this.server.on("error", (e: NodeJS.ErrnoException) => {
			new Notice(`obsidian-review: HTTP-сервер не поднялся (${e.code}). Порт занят? Смени порт в настройках.`, 0);
		});
		this.server.listen(this.plugin.settings.port, "127.0.0.1");
	}

	stop() {
		this.server?.close();
		this.server = null;
	}

	restart() {
		this.stop();
		this.start();
	}

	private handle(req: http.IncomingMessage, res: http.ServerResponse) {
		try {
			this.handleInner(req, res);
		} catch (e) {
			// зависший запрос хуже ошибки: любое исключение -> честный 500
			console.error("obsidian-review: ошибка обработчика", e);
			if (!res.headersSent) res.writeHead(500);
			res.end(String(e));
		}
	}

	private handleInner(req: http.IncomingMessage, res: http.ServerResponse) {
		if (req.headers.authorization !== `Bearer ${this.plugin.settings.token}`) {
			res.writeHead(401);
			res.end();
			return;
		}
		if (req.method === "GET" && req.url === "/status") {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify(this.plugin.review.debugStatus()));
			return;
		}
		if (req.method !== "POST" || req.url !== "/review") {
			res.writeHead(404);
			res.end();
			return;
		}
		const chunks: Buffer[] = [];
		let size = 0;
		req.on("data", (c: Buffer) => {
			size += c.length;
			if (size > MAX_BODY) {
				res.writeHead(413);
				res.end();
				req.destroy();
				return;
			}
			chunks.push(c);
		});
		req.on("end", async () => {
			try {
				const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as PushPayload;
				await this.plugin.review.receivePush(payload);
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end('{"ok":true}');
			} catch (e) {
				console.error("obsidian-review: не смог обработать пакет", e);
				res.writeHead(400);
				res.end(String(e));
			}
		});
	}
}
