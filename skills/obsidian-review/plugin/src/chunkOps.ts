import type { Chunk } from "@codemirror/merge";

/**
 * Чистая математика раздельных операций над ханком.
 *
 * Конвенции @codemirror/merge: toA/toB указывают на позицию ЗА переводом
 * строки последней строки ханка и могут выходить за длину документа на 1
 * (когда ханк упирается в конец файла без завершающего \n). В этом же случае
 * ханк может втягивать последнюю ОБЩУЮ строку обеих сторон — поэтому стороны
 * нельзя считать «чисто удалённым» и «чисто добавленным»: внутри ханка строки
 * делятся построчным LCS на общие, только-старые и только-новые.
 *
 * Семантика операций:
 * - acceptDelete:  регион original := общие строки  (старые забыты, новые — дифф)
 * - rejectDelete:  регион документа := merged       (старые вернулись перед новыми)
 * - acceptInsert:  регион original := merged        (новые узаконены, старые — дифф)
 * - rejectInsert:  регион документа := общие строки (новые убраны)
 *
 * Функции возвращают {from, to, insert} для соответствующего документа
 * (original — accept-операции, текущий — reject) либо null, если у ханка нет
 * соответствующей части.
 */

export interface ChangeSpec {
	from: number;
	to: number;
	insert: string;
}

function toLines(s: string): string[] {
	if (s === "") return [];
	const parts = s.split("\n");
	if (parts[parts.length - 1] === "") parts.pop();
	return parts;
}

/** Построчный LCS: общие строки + «сплетение» (удалённые перед добавленными). */
function lcsWeave(a: string[], b: string[]): { common: string[]; merged: string[] } {
	const n = a.length;
	const m = b.length;
	const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
		}
	}
	const common: string[] = [];
	const merged: string[] = [];
	const dels: string[] = [];
	const adds: string[] = [];
	const flush = () => {
		merged.push(...dels, ...adds);
		dels.length = 0;
		adds.length = 0;
	};
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (a[i] === b[j] && dp[i][j] === dp[i + 1][j + 1] + 1) {
			flush();
			common.push(a[i]);
			merged.push(a[i]);
			i++;
			j++;
		} else if (dp[i + 1][j] >= dp[i][j + 1]) {
			dels.push(a[i++]);
		} else {
			adds.push(b[j++]);
		}
	}
	while (i < n) dels.push(a[i++]);
	while (j < m) adds.push(b[j++]);
	flush();
	return { common, merged };
}

function parts(chunk: Chunk, orig: string, doc: string) {
	const a = orig.slice(chunk.fromA, Math.min(chunk.toA, orig.length));
	const b = doc.slice(chunk.fromB, Math.min(chunk.toB, doc.length));
	return lcsWeave(toLines(a), toLines(b));
}

/** Замена региона [from, to) документа target на набор строк. */
function regionSpec(target: string, from: number, to: number, lines: string[]): ChangeSpec {
	const clampedTo = Math.min(to, target.length);
	const text = lines.join("\n");
	if (to > target.length) {
		// регион упирается в EOF без завершающего \n
		if (lines.length === 0) return { from: Math.max(0, from - 1), to: clampedTo, insert: "" };
		return { from, to: clampedTo, insert: text };
	}
	return { from, to: clampedTo, insert: lines.length === 0 ? "" : `${text}\n` };
}

export function acceptDelete(chunk: Chunk, orig: string, doc: string): ChangeSpec | null {
	if (chunk.fromA === chunk.toA) return null;
	return regionSpec(orig, chunk.fromA, chunk.toA, parts(chunk, orig, doc).common);
}

export function rejectDelete(chunk: Chunk, orig: string, doc: string): ChangeSpec | null {
	if (chunk.fromA === chunk.toA) return null;
	return regionSpec(doc, chunk.fromB, chunk.toB, parts(chunk, orig, doc).merged);
}

export function acceptInsert(chunk: Chunk, orig: string, doc: string): ChangeSpec | null {
	if (chunk.fromB === chunk.toB) return null;
	return regionSpec(orig, chunk.fromA, chunk.toA, parts(chunk, orig, doc).merged);
}

export function rejectInsert(chunk: Chunk, orig: string, doc: string): ChangeSpec | null {
	if (chunk.fromB === chunk.toB) return null;
	return regionSpec(doc, chunk.fromB, chunk.toB, parts(chunk, orig, doc).common);
}
