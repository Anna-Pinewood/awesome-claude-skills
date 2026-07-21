import esbuild from "esbuild";
import process from "node:process";

const watch = process.argv.includes("--watch");

// @codemirror/state, view и прочие базовые модули CM предоставляет сам Obsidian —
// бандлить их нельзя, иначе получится второй экземпляр state и extension'ы
// перестанут стыковаться. @codemirror/merge Obsidian НЕ предоставляет — бандлим его.
const ctx = await esbuild.context({
	entryPoints: ["src/main.ts"],
	outfile: "main.js",
	bundle: true,
	format: "cjs",
	target: "es2020",
	platform: "node",
	sourcemap: watch ? "inline" : false,
	logLevel: "info",
	external: [
		"obsidian",
		"electron",
		"@codemirror/autocomplete",
		"@codemirror/collab",
		"@codemirror/commands",
		"@codemirror/language",
		"@codemirror/lint",
		"@codemirror/search",
		"@codemirror/state",
		"@codemirror/view",
		"@lezer/common",
		"@lezer/highlight",
		"@lezer/lr",
	],
});

if (watch) {
	await ctx.watch();
} else {
	await ctx.rebuild();
	await ctx.dispose();
}
