# CavalrYTP

Generates Cavalry Value layers from the notes and controllers of a MIDI file.

## Install

Grab `CavalrYTP_<version>.zip` from the releases page and unzip it inside your Cavalry
scripts folder (`Scripts > Show Scripts Folder`). You end up with:

```
Scripts/
└── CavalrYTP/
    └── CavalrYTP.jsc
```

Restart Cavalry, then run it from `Scripts > CavalrYTP`.

> [!IMPORTANT]
> `CavalrYTP.jsc` is self-contained: the MIDI parser is bundled into it, so nothing has
> to sit next to the script and the same build runs everywhere.

## Usage

1. Pick a `.mid` file.
2. Select the tracks to import (Ctrl/Shift to select more than one).
3. Tick the layers to generate.
4. Press Generate. One Value layer per ticked output is created inside a
   `<file>.mid Controllers` group. Select a composition reference first to also write
   note-driven time remapping onto it.

## Development

The source lives in `dev/`, the same layout as the
[create-script](https://github.com/scenery-io/create-script) template.

```
CavalrYTP/
├── CavalrYTP.jsc            built script (published release asset)
├── CavalryMiDiConverter/    retired Go source of CMC, kept for reference only
└── dev/
    ├── package.json         bundler config: displayName drives the script folder name
    ├── pnpm-workspace.yaml  pnpm settings: approves esbuild's build script
    ├── pnpm-lock.yaml       locked dependency versions
    ├── src/
    │   ├── CavalrYTP.ts     entry point, builds the UI
    │   └── modules/         the core, one module per concern (all .ts)
    ├── static/
    │   └── release/         files added to the root of the release zip
    └── test/                node:test suites
```

```sh
cd dev
pnpm install
pnpm dev       # watch, builds into dev/build and symlinks it into Cavalry's scripts folder
pnpm test      # unit tests
pnpm typecheck # tsc over src
```

`pnpm dev` symlinks `dev/build` into `Scripts/CavalrYTP`, so Cavalry picks up every
rebuild straight away. The bundle is deliberately unencrypted while developing.

The sources are TypeScript, checked in strict mode by `pnpm typecheck`. They stay inside
what Node and esbuild can strip without a compiler: no enums, no namespaces, no parameter
properties (`erasableSyntaxOnly`), and every type-only import is marked (`verbatimModuleSyntax`).
That is what lets the test suite import `src/**/*.ts` directly — Node 24 strips the
annotations on the way in — and keeps esbuild to dropping types rather than transpiling.

Dependencies go through [pnpm](https://pnpm.io) with the versions locked in
`dev/pnpm-lock.yaml`; the `packageManager` field pins the pnpm release, so
`corepack enable` picks the same one up. pnpm settings live in
`dev/pnpm-workspace.yaml`, which approves esbuild's build script (pnpm 11 refuses to
run dependency build scripts that nobody has reviewed). Node 24.3+ is required, as
`@scenery/bundler` declares. `midi-file` is the one runtime dependency; esbuild inlines it
into the bundle, so it never ships as a separate file.

The Cavalry API types come from
[@scenery/cavalry-types](https://github.com/scenery-io/cavalry-types), which every file
pulls in with `/// <reference types="@scenery/cavalry-types" />` (the `exports` map of that
package is what makes the bare name resolve) and which `tsconfig.json` preloads through
`types`, so the global `api` and `ui` are known everywhere.

One spot in those declarations does not match what Cavalry does at runtime. It is bridged
with a local, commented cast rather than by loosening the compiler settings:

- `ui.List.onSelectionChanged` is declared as `() => void`, but Cavalry calls it with the
  selected row uuids; the entry script annotates the handler and casts it back.

The runtime is a plain ECMAScript engine: no `require`, no `Buffer`, no `atob` and no
`Uint8Array.fromBase64`. `modules/CavarYtpBase64.ts` decodes the base64 string that
`api.encodeBinary` hands back without reaching for any of them.

`src/modules/appContext.ts` types the widgets the entry script creates (`uiHandles`) as
ready rather than as `null`, because every helper only touches them from a UI callback,
which cannot fire before the layout exists.

## Release

```sh
cd dev
pnpm install
pnpm release
```

This bundles and minifies `src/` into a single `build/CavalrYTP.js`, encrypts it to
`build/CavalrYTP.jsc` through [Stallion](https://github.com/scenery-io/stallion) (which
has to be running in Cavalry), copies the `.jsc` to the repo root, and writes
`dist/CavalrYTP_<version>.zip` containing the script.

Everything the script needs from `dev/src` and `node_modules` is bundled, so a watched build
and a release behave identically.

## MIDI parsing

The file is parsed inside Cavalry. `api.readFromFile` only reads text, so the `.mid` arrives
through `api.encodeBinary` as base64; `modules/CavarYtpBase64.ts` decodes it into a
`Uint8Array` and [`midi-file`](https://github.com/carter-thaxton/midi-file) turns the bytes
into events. esbuild inlines the parser into the bundle, so the script needs nothing but
itself.

Timing follows the rules `CavalryMiDiConverter/` implemented: one tempo map shared by every
track, 120 BPM until the first `Set Tempo`, and SMPTE divisions derived from their frame rate
instead of the tempo. Only the three messages the UI reads survive (`noteon`, `noteoff` and
`controlchange`, with a velocity-0 note on normalised to `noteoff`) and tracks without notes
are dropped.

`CavalryMiDiConverter/` is retired: it is neither built nor shipped any more, and its Go
source is kept only as a reference for that behaviour.
