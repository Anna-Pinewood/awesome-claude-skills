import { describe, expect, test } from "bun:test";
import { Text } from "@codemirror/state";
import { Chunk } from "@codemirror/merge";
import { acceptDelete, acceptInsert, rejectDelete, rejectInsert, type ChangeSpec } from "./chunkOps";

function chunksOf(orig: string, doc: string): readonly Chunk[] {
	return Chunk.build(Text.of(orig.split("\n")), Text.of(doc.split("\n")));
}

function apply(s: string, spec: ChangeSpec | null): string {
	if (!spec) return s;
	return s.slice(0, spec.from) + spec.insert + s.slice(spec.to);
}

/** После операции пересчитанные ханки не должны содержать «фантомов». */
function remaining(orig: string, doc: string): number {
	return chunksOf(orig, doc).length;
}

describe("ханк-замена в середине файла", () => {
	const orig = "один\nстарая А\nстарая Б\nконец\n";
	const doc = "один\nновая\nконец\n";
	const chunk = chunksOf(orig, doc)[0];

	test("acceptDelete: старое исчезает из original, остаётся insert-only", () => {
		const orig2 = apply(orig, acceptDelete(chunk, orig, doc));
		expect(orig2).toBe("один\nконец\n");
		expect(remaining(orig2, doc)).toBe(1); // осталась только «новая»
	});

	test("acceptInsert: новое входит в original после старого, остаётся delete-only", () => {
		const orig2 = apply(orig, acceptInsert(chunk, orig, doc));
		expect(orig2).toBe("один\nстарая А\nстарая Б\nновая\nконец\n");
		expect(remaining(orig2, doc)).toBe(1); // остались «старая А/Б»
	});

	test("rejectDelete: старое возвращается в документ перед новым", () => {
		const doc2 = apply(doc, rejectDelete(chunk, orig, doc));
		expect(doc2).toBe("один\nстарая А\nстарая Б\nновая\nконец\n");
		expect(remaining(orig, doc2)).toBe(1); // остался только insert «новая»
	});

	test("rejectInsert: новое убирается из документа", () => {
		const doc2 = apply(doc, rejectInsert(chunk, orig, doc));
		expect(doc2).toBe("один\nконец\n");
		expect(remaining(orig, doc2)).toBe(1); // остался только delete
	});

	test("accept обеих частей = полное принятие, ханков ноль", () => {
		let o = apply(orig, acceptInsert(chunk, orig, doc));
		const chunk2 = chunksOf(o, doc)[0];
		o = apply(o, acceptDelete(chunk2, o, doc));
		expect(remaining(o, doc)).toBe(0);
	});

	test("reject обеих частей = полный откат, ханков ноль", () => {
		let d = apply(doc, rejectInsert(chunk, orig, doc));
		const chunk2 = chunksOf(orig, d)[0];
		d = apply(d, rejectDelete(chunk2, orig, d));
		expect(d).toBe(orig);
		expect(remaining(orig, d)).toBe(0);
	});
});

describe("удаление последней строки (файл с завершающим \\n)", () => {
	const orig = "один\nдва\nхвост\n";
	const doc = "один\nдва\n";
	const chunk = chunksOf(orig, doc)[0];

	test("acceptDelete: ханков ноль", () => {
		const orig2 = apply(orig, acceptDelete(chunk, orig, doc));
		expect(orig2).toBe(doc);
		expect(remaining(orig2, doc)).toBe(0);
	});

	test("rejectDelete: строка возвращается", () => {
		const doc2 = apply(doc, rejectDelete(chunk, orig, doc));
		expect(doc2).toBe(orig);
		expect(remaining(orig, doc2)).toBe(0);
	});
});

describe("удаление последней строки (файл БЕЗ завершающего \\n)", () => {
	const orig = "один\nдва\nхвост";
	const doc = "один\nдва";
	const chunk = chunksOf(orig, doc)[0];

	test("acceptDelete: ханков ноль, без висячих переводов строк", () => {
		const orig2 = apply(orig, acceptDelete(chunk, orig, doc));
		expect(orig2).toBe(doc);
		expect(remaining(orig2, doc)).toBe(0);
	});

	test("rejectDelete: строка возвращается в конец", () => {
		const doc2 = apply(doc, rejectDelete(chunk, orig, doc));
		expect(doc2).toBe(orig);
		expect(remaining(orig, doc2)).toBe(0);
	});
});

describe("добавление строки в конец (файл с завершающим \\n)", () => {
	const orig = "один\nдва\n";
	const doc = "один\nдва\nновая\n";
	const chunk = chunksOf(orig, doc)[0];

	test("acceptInsert: ханков ноль", () => {
		const orig2 = apply(orig, acceptInsert(chunk, orig, doc));
		expect(orig2).toBe(doc);
		expect(remaining(orig2, doc)).toBe(0);
	});

	test("rejectInsert: строка убирается", () => {
		const doc2 = apply(doc, rejectInsert(chunk, orig, doc));
		expect(doc2).toBe(orig);
		expect(remaining(orig, doc2)).toBe(0);
	});
});

describe("добавление строки в конец (файл БЕЗ завершающего \\n)", () => {
	const orig = "один\nдва";
	const doc = "один\nдва\nновая";
	const chunk = chunksOf(orig, doc)[0];

	test("acceptInsert: ханков ноль", () => {
		const orig2 = apply(orig, acceptInsert(chunk, orig, doc));
		expect(orig2).toBe(doc);
		expect(remaining(orig2, doc)).toBe(0);
	});

	test("rejectInsert: ханков ноль, без висячего \\n", () => {
		const doc2 = apply(doc, rejectInsert(chunk, orig, doc));
		expect(doc2).toBe(orig);
		expect(remaining(orig, doc2)).toBe(0);
	});
});

describe("вырожденные случаи", () => {
	test("del-операции на insert-only ханке — null", () => {
		const orig = "один\n";
		const doc = "один\nдва\n";
		const chunk = chunksOf(orig, doc)[0];
		expect(acceptDelete(chunk, orig, doc)).toBeNull();
		expect(rejectDelete(chunk, orig, doc)).toBeNull();
	});

	test("ins-операции на delete-only ханке — null", () => {
		const orig = "один\nдва\n";
		const doc = "один\n";
		const chunk = chunksOf(orig, doc)[0];
		expect(acceptInsert(chunk, orig, doc)).toBeNull();
		expect(rejectInsert(chunk, orig, doc)).toBeNull();
	});

	test("замена первой строки файла", () => {
		const orig = "старая\nдва\n";
		const doc = "новая\nдва\n";
		const chunk = chunksOf(orig, doc)[0];
		let o = apply(orig, acceptInsert(chunk, orig, doc));
		expect(o).toBe("старая\nновая\nдва\n");
		const chunk2 = chunksOf(o, doc)[0];
		o = apply(o, acceptDelete(chunk2, o, doc));
		expect(remaining(o, doc)).toBe(0);
	});
});
