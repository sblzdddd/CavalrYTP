# CavalrYTP

Generates Cavalry Value layers from the notes and controllers of a MIDI file.

## Install

Grab `CavalrYTP_<version>.zip` from the releases page and unzip it inside your Cavalry
scripts folder (`Scripts > Show Scripts Folder`). You end up with:

```
Scripts/
└── CavalrYTP/
    ├── CavalrYTP.jsc
    └── CavalrYTP_assets/
        └── CMC.exe
```

Restart Cavalry, then run it from `Scripts > CavalrYTP`.

> [!IMPORTANT]
> `CavalrYTP.jsc` is not self-contained: `CMC.exe` has to sit next to it in
> `CavalrYTP_assets`. Installing the release zip keeps the two together.

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
├── CavalryMiDiConverter/    Go source of CMC
└── dev/
    ├── package.json         bundler config: displayName drives the script folder name
    ├── pnpm-workspace.yaml  pnpm settings: approves esbuild's build script
    ├── pnpm-lock.yaml       locked dependency versions
    ├── src/
    │   ├── CavalrYTP.ts     entry point, builds the UI
    │   └── modules/         the core, one module per concern (all .ts)
    ├── static/
    │   ├── _assets/         files copied to CavalrYTP_assets next to the script
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
`@scenery/bundler` declares.

The Cavalry API types come from
[@scenery/cavalry-types](https://github.com/scenery-io/cavalry-types), which every file
pulls in with `/// <reference types="@scenery/cavalry-types" />` (the `exports` map of that
package is what makes the bare name resolve) and which `tsconfig.json` preloads through
`types`, so the global `api` and `ui` are known everywhere.

Two spots in those declarations do not match what Cavalry does at runtime. Both are bridged
with a local, commented cast rather than by loosening the compiler settings:

- `ui.scriptLocation` is declared as `void`, but it holds the script's folder path;
  `modules/CavarYtpMidiFile.ts` asserts it to `string` before building the `CMC` path.
- `ui.List.onSelectionChanged` is declared as `() => void`, but Cavalry calls it with the
  selected row uuids; the entry script annotates the handler and casts it back.

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
`dist/CavalrYTP_<version>.zip` containing the script and its assets folder.

Everything the script needs from `dev/src` is bundled; `ui.scriptLocation` still resolves
the assets folder next to the script, so nothing changes between a watched build and the
release.

## The converter

`CMC.exe` is built from the Go source in `CavalryMiDiConverter/` and converts a `.mid`
file into a JSON event dump that the script reads back:

```sh
cd CavalryMiDiConverter
go build -o ../dev/static/_assets/CMC.exe .
```

It is only built for Windows today, so the script is Windows-only.
