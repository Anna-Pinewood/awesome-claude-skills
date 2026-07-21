import { extname } from "node:path";
import { format } from "prettier";

const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);

export const isMarkdownFile = (filePath: string): boolean =>
	MARKDOWN_EXTENSIONS.has(extname(filePath).toLowerCase());

export const formatMarkdownForReview = async (content: string): Promise<string> =>
	await format(content, {
		parser: "markdown",
		printWidth: 80,
		proseWrap: "always",
	});

export const formatFileForReview = async (content: string, filePath: string): Promise<string> =>
	isMarkdownFile(filePath) ? await formatMarkdownForReview(content) : content;
