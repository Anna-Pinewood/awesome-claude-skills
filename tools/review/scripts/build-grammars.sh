#!/usr/bin/env bash
# Build grammar WASMs for languages not shipped by tree-sitter-wasms (haskell, sql).
# Output lands in vendor/wasm/ and is checked in so the server doesn't need a build step.
#
# Requires: brew install emscripten binaryen. The brew emscripten bottle doesn't wire up
# PYTHON/LLVM/BINARYEN correctly on first run — these env vars fix that without touching
# the managed config file.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR="$ROOT/vendor/wasm"
mkdir -p "$VENDOR"

EMSDK_PYTHON="${EMSDK_PYTHON:-/opt/homebrew/Cellar/python@3.14/3.14.3_1/bin/python3.14}"
EM_LLVM_ROOT="${EM_LLVM_ROOT:-/opt/homebrew/Cellar/emscripten/5.0.5/libexec/llvm/bin}"
EM_BINARYEN_ROOT="${EM_BINARYEN_ROOT:-/opt/homebrew/opt/binaryen}"
export EMSDK_PYTHON EM_LLVM_ROOT EM_BINARYEN_ROOT

# tree-sitter-cli 0.20.8 produces ABI-13 wasms (no dylink section), which is what
# web-tree-sitter 0.22 accepts. Newer CLIs emit dylink and only load on 0.23+.
CLI="tree-sitter-cli@0.20.8"

build() {
  local name="$1" src="$2"
  echo "[build] $name -> $VENDOR/tree-sitter-$name.wasm"
  (cd "$src" && bunx "$CLI" build-wasm .)
  cp "$src/tree-sitter-$name.wasm" "$VENDOR/"
}

build haskell "$ROOT/node_modules/tree-sitter-haskell"
build sql "$ROOT/node_modules/@derekstride/tree-sitter-sql"
build markdown "$ROOT/node_modules/@tree-sitter-grammars/tree-sitter-markdown/tree-sitter-markdown"
build dockerfile "$ROOT/node_modules/tree-sitter-dockerfile"

echo "done"
