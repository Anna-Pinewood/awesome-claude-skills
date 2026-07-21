import Parser from "web-tree-sitter";

// --- Protocol ---

type HighlightRequest = {
	readonly type: "highlight";
	readonly cacheKey: string;
	readonly language: string;
	readonly content: string;
};

type HighlightResponse = {
	readonly type: "highlighted";
	readonly cacheKey: string;
	readonly lines: readonly string[];
};

// --- Language mapping ---

// file.language (from parser.ts detectLanguage) → grammar file in tree-sitter-wasms/out/
const GRAMMAR_MAP: Readonly<Record<string, string>> = {
	typescript: "typescript",
	tsx: "tsx",
	javascript: "javascript",
	python: "python",
	rust: "rust",
	go: "go",
	java: "java",
	ruby: "ruby",
	css: "css",
	html: "html",
	json: "json",
	yaml: "yaml",
	toml: "toml",
	bash: "bash",
	c: "c",
	cpp: "cpp",
	c_sharp: "c_sharp",
	swift: "swift",
	kotlin: "kotlin",
	scala: "scala",
	elixir: "elixir",
	zig: "zig",
	lua: "lua",
	dart: "dart",
	elisp: "elisp",
	elm: "elm",
	php: "php",
	ocaml: "ocaml",
	objc: "objc",
	vue: "vue",
	solidity: "solidity",
	ql: "ql",
	rescript: "rescript",
	haskell: "haskell",
	sql: "sql",
	markdown: "markdown",
	dockerfile: "dockerfile",
};

// --- Node type → hljs class ---

// Exact-match named node types. A match is "terminal" — we emit the entire node and stop recursing.
const NAMED_CLASS: Readonly<Record<string, string>> = {
	comment: "hljs-comment",
	line_comment: "hljs-comment",
	block_comment: "hljs-comment",
	shebang: "hljs-meta",

	string: "hljs-string",
	string_literal: "hljs-string",
	interpreted_string_literal: "hljs-string",
	raw_string_literal: "hljs-string",
	template_string: "hljs-string",
	char_literal: "hljs-string",
	character_literal: "hljs-string",
	quoted_attribute_value: "hljs-string",

	number: "hljs-number",
	integer: "hljs-number",
	float: "hljs-number",
	integer_literal: "hljs-number",
	float_literal: "hljs-number",
	numeric_literal: "hljs-number",
	decimal_integer_literal: "hljs-number",
	hex_integer_literal: "hljs-number",

	regex: "hljs-regexp",
	regex_pattern: "hljs-regexp",

	true: "hljs-literal",
	false: "hljs-literal",
	null: "hljs-literal",
	none: "hljs-literal",
	nil: "hljs-literal",
	undefined: "hljs-literal",
	null_literal: "hljs-literal",
	boolean_literal: "hljs-literal",

	type_identifier: "hljs-type",
	primitive_type: "hljs-type",
	predefined_type: "hljs-type",

	tag_name: "hljs-tag",
	attribute_name: "hljs-attr",
	property_identifier: "hljs-attr",

	// YAML — plain_scalar is ambiguous (key vs value), pair-key disambiguation
	// happens in the parent-aware classifier below; blanket as string here so
	// values still get colored even when the heuristic doesn't fire.
	plain_scalar: "hljs-string",
	single_quoted_scalar: "hljs-string",
	double_quoted_scalar: "hljs-string",
	block_scalar: "hljs-string",
	literal_scalar: "hljs-string",
	folded_scalar: "hljs-string",
	string_scalar: "hljs-string",
	boolean_scalar: "hljs-literal",
	null_scalar: "hljs-literal",
	integer_scalar: "hljs-number",
	float_scalar: "hljs-number",
	yaml_directive: "hljs-meta",
	tag_directive: "hljs-meta",
	anchor_name: "hljs-symbol",
	alias_name: "hljs-symbol",

	// Markdown (block grammar) — inline grammar isn't wired, so emphasis/links
	// inside paragraphs stay uncolored for now.
	atx_heading: "hljs-title",
	setext_heading: "hljs-title",
	atx_h1_marker: "hljs-title",
	atx_h2_marker: "hljs-title",
	atx_h3_marker: "hljs-title",
	atx_h4_marker: "hljs-title",
	atx_h5_marker: "hljs-title",
	atx_h6_marker: "hljs-title",
	fenced_code_block: "hljs-code",
	indented_code_block: "hljs-code",
	code_fence_content: "hljs-code",
	info_string: "hljs-meta",
	block_quote: "hljs-quote",
	link_reference_definition: "hljs-link",
	thematic_break: "hljs-meta",
	list_marker_plus: "hljs-bullet",
	list_marker_minus: "hljs-bullet",
	list_marker_star: "hljs-bullet",
	list_marker_dot: "hljs-bullet",
	list_marker_parenthesis: "hljs-bullet",

	// Haskell
	variable: "hljs-name",
	constructor: "hljs-type",
	qualified_variable: "hljs-name",
	qualified_constructor: "hljs-type",
	module: "hljs-title",
	operator: "hljs-operator",

	// SQL (DerekStride) — most keywords are anonymous and caught by the generic
	// alphabetic-keyword rule; cover the named exceptions.
	literal: "hljs-string",
	quoted_identifier: "hljs-attr",

	// Dockerfile — directives (FROM, RUN, CMD…) are anonymous keywords, already
	// handled by the generic rule. Named image/path tokens need explicit classes.
	image_name: "hljs-type",
	image_tag: "hljs-number",
	path: "hljs-string",
	expansion: "hljs-variable",
};

// Parent-type-dependent classification for common identifier nodes.
const IDENTIFIER_IN_CALL = new Set([
	"call_expression",
	"function_call",
	"function_declaration",
	"function_definition",
	"method_definition",
	"method_declaration",
	"function_item",
	"function_signature",
]);

const classify = (
	nodeType: string,
	nodeIsNamed: boolean,
	nodeText: string,
	parentType: string | null,
): string | null => {
	// Anonymous nodes whose text is an alphabetic word → keyword
	if (!nodeIsNamed) {
		if (/^[a-z_][a-z_0-9]*$/i.test(nodeType)) return "hljs-keyword";
		return null;
	}

	const direct = NAMED_CLASS[nodeType];
	if (direct) return direct;

	if (nodeType === "identifier" && parentType && IDENTIFIER_IN_CALL.has(parentType)) {
		return "hljs-title function_";
	}

	return null;
};

// --- Tree walk → flat token list ---

type Token = {
	readonly start: number;
	readonly end: number;
	readonly cls: string;
};

const collectTokens = (tree: { walk: () => Parser.TreeCursor }): Token[] => {
	const tokens: Token[] = [];
	const cursor = tree.walk();

	const visit = (parentType: string | null, isRoot: boolean): void => {
		const nodeType = cursor.nodeType;
		const nodeIsNamed = cursor.nodeIsNamed;
		const start = cursor.startIndex;
		const end = cursor.endIndex;

		const cls = classify(nodeType, nodeIsNamed, cursor.nodeText, parentType);

		// Terminal classification: emit and stop recursing. Applies to named matches only;
		// keyword anonymous nodes have no children anyway. Never terminal-match the tree's
		// root: some grammars name their compilation-unit node the same as another
		// grammar's leaf/container entry (e.g. Python's root is "module", same key used
		// for Haskell's module-declaration node) — matching there would swallow the whole file.
		if (cls && nodeIsNamed && NAMED_CLASS[nodeType] && !isRoot) {
			tokens.push({ start, end, cls });
			return;
		}

		if (cls && !nodeIsNamed) {
			tokens.push({ start, end, cls });
			return;
		}

		// Recurse
		if (cursor.gotoFirstChild()) {
			do {
				visit(nodeType, false);
			} while (cursor.gotoNextSibling());
			cursor.gotoParent();
		} else if (cls && !isRoot) {
			// Named leaf with a class but not in the terminal table (e.g. identifier-in-call)
			tokens.push({ start, end, cls });
		}
	};

	visit(null, true);
	return tokens;
};

// --- HTML emission ---

const escapeHtml = (s: string): string =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const emitLines = (source: string, tokens: readonly Token[]): string[] => {
	const lines: string[] = [];
	let line = "";

	const appendText = (text: string, cls: string | null): void => {
		const parts = text.split("\n");
		for (let i = 0; i < parts.length; i++) {
			if (i > 0) {
				lines.push(line);
				line = "";
			}
			const part = parts[i] ?? "";
			if (part.length === 0) continue;
			if (cls) {
				line += `<span class="${cls}">${escapeHtml(part)}</span>`;
			} else {
				line += escapeHtml(part);
			}
		}
	};

	let pos = 0;
	for (const token of tokens) {
		if (token.start < pos) continue; // overlapping — skip (shouldn't happen with our walk)
		if (token.start > pos) appendText(source.slice(pos, token.start), null);
		appendText(source.slice(token.start, token.end), token.cls);
		pos = token.end;
	}
	appendText(source.slice(pos), null);
	lines.push(line);

	return lines;
};

const plaintextLines = (source: string): string[] => source.split("\n").map(escapeHtml);

// --- Worker state ---

let initialized = false;
const parserCache = new Map<string, Parser>();

const init = async (): Promise<void> => {
	if (initialized) return;
	await Parser.init({
		locateFile: () => "/wasm/tree-sitter.wasm",
	});
	initialized = true;
};

const getParser = async (language: string): Promise<Parser | null> => {
	const grammar = GRAMMAR_MAP[language];
	if (!grammar) return null;

	const cached = parserCache.get(grammar);
	if (cached) return cached;

	try {
		const lang = await Parser.Language.load(`/wasm/tree-sitter-${grammar}.wasm`);
		const parser = new Parser();
		parser.setLanguage(lang);
		parserCache.set(grammar, parser);
		return parser;
	} catch {
		return null;
	}
};

const handle = async (req: HighlightRequest): Promise<HighlightResponse> => {
	try {
		await init();
		const parser = await getParser(req.language);
		if (!parser) {
			return { type: "highlighted", cacheKey: req.cacheKey, lines: plaintextLines(req.content) };
		}
		const tree = parser.parse(req.content);
		if (!tree) {
			return { type: "highlighted", cacheKey: req.cacheKey, lines: plaintextLines(req.content) };
		}
		const tokens = collectTokens(tree);
		const lines = emitLines(req.content, tokens);
		tree.delete();
		return { type: "highlighted", cacheKey: req.cacheKey, lines };
	} catch {
		return { type: "highlighted", cacheKey: req.cacheKey, lines: plaintextLines(req.content) };
	}
};

self.onmessage = (e: MessageEvent<HighlightRequest>) => {
	handle(e.data).then((response) => {
		(self as unknown as Worker).postMessage(response);
	});
};
