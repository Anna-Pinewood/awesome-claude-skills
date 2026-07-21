import { describe, expect, test } from "bun:test";
import { formatFileForReview, isMarkdownFile } from "../src/markdown.ts";

describe("isMarkdownFile", () => {
	test("detects Markdown extensions only", () => {
		expect(isMarkdownFile("README.md")).toBe(true);
		expect(isMarkdownFile("notes.MARKDOWN")).toBe(true);
		expect(isMarkdownFile("notes.txt")).toBe(false);
		expect(isMarkdownFile("Makefile")).toBe(false);
	});
});

describe("formatFileForReview", () => {
	test("wraps Markdown prose around 80 columns before review display", async () => {
		const input =
			"# Title\n\n" +
			"This is a very long paragraph that should be wrapped by prettier before it is displayed in the review tool so prose is easier to review.";

		const formatted = await formatFileForReview(input, "README.md");

		expect(formatted).toContain(
			"This is a very long paragraph that should be wrapped by prettier before it is\n" +
				"displayed in the review tool so prose is easier to review.",
		);
	});

	test("preserves fenced code while formatting Markdown", async () => {
		const input =
			"Paragraph before the code fence that is intentionally long enough to wrap during markdown formatting.\n\n" +
			"```ts\n" +
			"const example = { alpha: 1, beta: 2, gamma: 3, delta: 4 };\n" +
			"```\n";

		const formatted = await formatFileForReview(input, "doc.markdown");

		expect(formatted).toContain(
			"```ts\nconst example = { alpha: 1, beta: 2, gamma: 3, delta: 4 };\n```",
		);
	});

	test("does not format non-Markdown files", async () => {
		const input = "one two three\n\nconst x={a:1,b:2};\n";

		await expect(formatFileForReview(input, "notes.txt")).resolves.toBe(input);
	});
});
