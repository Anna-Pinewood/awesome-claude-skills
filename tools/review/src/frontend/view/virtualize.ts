import type { VNode } from "snabbdom";
import type { Msg } from "../../types.ts";

// Approximate height of one diff row in pixels.
// diff-table: font-size 14px (--font-sm), line-height 1.5 → ~21px per row.
// Used to size stubs so scrollbar positions match real content before it loads.
export const ROW_HEIGHT_PX = 21;

// Files and chunks below this many visible lines don't bother with chunking.
// Chunks above this render as one block (no internal virtualization).
export const CHUNK_SIZE = 400;

// IntersectionObserver rootMargin — load a couple viewports above/below the scroll position
// so content is ready before the user reaches it.
const ROOT_MARGIN = "1000px 0px 1000px 0px";

// Module state: once an element has been observed to intersect, its key is recorded here.
// Subsequent vdom renders check this set and emit the real content instead of a stub.
const renderedKeys = new Set<string>();

// Monotonic counter bumped on every markRendered / reset. Exposed so upstream memoized
// vdom functions can include it in their key tuples — otherwise they'd return cached
// stub vnodes even after a chunk has intersected, and real content would never mount.
let epoch = 0;

export const getRenderEpoch = (): number => epoch;

export const isRendered = (key: string): boolean => renderedKeys.has(key);

export const markRendered = (key: string): void => {
	if (!renderedKeys.has(key)) {
		renderedKeys.add(key);
		epoch++;
	}
};

// Bumping without marking a key — for external events that should invalidate memos
// (e.g. syntax-highlight worker returning new line HTML).
export const bumpEpoch = (): void => {
	epoch++;
};

// Called when the diff-area element is destroyed (e.g., switching to past-review view).
// The cached observer's root would be the now-detached element and would never fire on
// the next .diff-area instance — nuke both the observer and the loaded-state set so the
// next mount starts clean.
export const resetVirtualization = (): void => {
	if (observer) {
		observer.disconnect();
		observer = null;
	}
	renderedKeys.clear();
	epoch++;
};

// Callbacks keyed by the observed element — lets us dispatch the right file/chunk on
// intersection without creating N observers.
const elementCallbacks = new WeakMap<Element, () => void>();

let observer: IntersectionObserver | null = null;

const getObserver = (): IntersectionObserver | null => {
	if (observer) return observer;

	const root = document.querySelector(".diff-area");
	// .diff-area doesn't exist on first render (the observer would be created before
	// the vdom is mounted). Returning null here means the first round of .observe()
	// calls are no-ops. But hook.insert fires AFTER the element is in the DOM, so
	// by then .diff-area exists too. So in practice this branch rarely triggers.
	if (!root) return null;

	observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				const cb = elementCallbacks.get(entry.target);
				if (cb) cb();
			}
		},
		{ root, rootMargin: ROOT_MARGIN, threshold: 0 },
	);
	return observer;
};

// Batch re-render dispatches. Multiple chunks intersecting simultaneously (fast scroll,
// initial viewport with many small files) would each trigger a separate re-render —
// collapse them into one animation-frame-scheduled dispatch.
let pendingDispatch: ((msg: Msg) => void) | null = null;
let pendingFrame = 0;

const scheduleReRender = (dispatch: (msg: Msg) => void): void => {
	pendingDispatch = dispatch;
	if (pendingFrame) return;
	pendingFrame = requestAnimationFrame(() => {
		pendingFrame = 0;
		const d = pendingDispatch;
		pendingDispatch = null;
		if (d) d({ type: "filesHighlighted" });
	});
};

// Produce a snabbdom vnode that:
//   - If `isRendered(key)` is already true, returns the fully-rendered vnode from `render()`.
//   - Otherwise returns a stub vnode with a min-height placeholder that registers an
//     IntersectionObserver on insert. When the stub intersects the viewport (plus
//     rootMargin), we mark the key as rendered and dispatch a re-render. The next
//     patch produces the full vnode, snabbdom swaps it in, and the user sees content.
//
// Why dispatch instead of appending imperatively? Because subsequent snabbdom patches
// (e.g., from comment events, view changes) re-diff the children. If we'd appended
// real content outside snabbdom's view, it would get wiped. By making "rendered" state
// part of the vdom-producing function's input (via `isRendered`), re-renders stay
// consistent.
export const virtualized = (
	key: string,
	stub: () => VNode,
	real: () => VNode,
	dispatch: (msg: Msg) => void,
): VNode => {
	if (isRendered(key)) return real();

	const vnode = stub();

	const existingHook = vnode.data?.hook ?? {};
	const existingInsert = existingHook.insert;
	const existingDestroy = existingHook.destroy;

	const insert = (n: VNode): void => {
		if (existingInsert) existingInsert(n);
		const el = n.elm as Element | undefined;
		if (!el) return;
		const obs = getObserver();
		if (!obs) {
			// Fall back: no observer available, mark as rendered immediately so next
			// re-render emits full content. Only fires if .diff-area isn't mounted yet,
			// which shouldn't happen in practice (insert runs after mount).
			markRendered(key);
			scheduleReRender(dispatch);
			return;
		}
		const callback = (): void => {
			markRendered(key);
			obs.unobserve(el);
			elementCallbacks.delete(el);
			scheduleReRender(dispatch);
		};
		elementCallbacks.set(el, callback);
		obs.observe(el);
	};

	const destroy = (n: VNode): void => {
		if (existingDestroy) existingDestroy(n);
		const el = n.elm as Element | undefined;
		if (!el) return;
		const obs = observer;
		if (obs) obs.unobserve(el);
		elementCallbacks.delete(el);
	};

	vnode.data = {
		...vnode.data,
		hook: { ...existingHook, insert, destroy },
	};

	return vnode;
};
