// Coarse, reference-equality memoization for view functions.
//
// `createMemo` wraps a build function with a one-slot cache. On each call, the
// supplied `keyFn` returns a tuple of referentially-compared deps; if they all
// match the previous call's deps, the cached vnode is returned without
// rebuilding. This works because the Elm-style reducer returns the same object
// reference for model slices that didn't change between dispatches.
//
// The cache holds exactly one value. For per-item memoization (e.g. per file),
// use `createKeyedMemo` which maintains a Map of one-slot caches keyed by a
// stable identity.

export const createMemo = <Args extends readonly unknown[], T>(
	keyFn: (...args: Args) => readonly unknown[],
	build: (...args: Args) => T,
): ((...args: Args) => T) => {
	let lastKey: readonly unknown[] | null = null;
	let lastValue: T | null = null;
	return (...args: Args): T => {
		const key = keyFn(...args);
		if (lastKey !== null && lastKey.length === key.length) {
			let same = true;
			for (let i = 0; i < key.length; i++) {
				if (lastKey[i] !== key[i]) {
					same = false;
					break;
				}
			}
			if (same) return lastValue as T;
		}
		lastKey = key;
		lastValue = build(...args);
		return lastValue;
	};
};

// Keyed variant: one memo slot per `id`. Callers are responsible for pruning
// (`clear`, `delete`) when an id will no longer appear — otherwise entries
// accumulate for the lifetime of the process.
export type KeyedMemo<Id, Args extends readonly unknown[], T> = {
	readonly get: (id: Id, ...args: Args) => T;
	readonly clear: () => void;
	readonly delete: (id: Id) => void;
};

export const createKeyedMemo = <Id, Args extends readonly unknown[], T>(
	keyFn: (...args: Args) => readonly unknown[],
	build: (...args: Args) => T,
): KeyedMemo<Id, Args, T> => {
	const slots = new Map<Id, (...args: Args) => T>();
	return {
		get: (id: Id, ...args: Args): T => {
			let slot = slots.get(id);
			if (!slot) {
				slot = createMemo(keyFn, build);
				slots.set(id, slot);
			}
			return slot(...args);
		},
		clear: (): void => {
			slots.clear();
		},
		delete: (id: Id): void => {
			slots.delete(id);
		},
	};
};
