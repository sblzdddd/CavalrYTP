# CavalrYTP

Generates Cavalry Value layers from the notes and controllers of a MIDI file.

## Install

`pnpm build` writes the script to `CavalrYTP/dist/CavalrYTP.js`, and the `build` job of
`.github/workflows/ci.yml` uploads that folder as an artifact. Copy it into your Cavalry
scripts folder (`Scripts > Show Scripts Folder`):

```
Scripts/
└── CavalrYTP/
    └── CavalrYTP.js
```

Restart Cavalry, then run it from `Scripts > CavalrYTP`.

> [!IMPORTANT]
> `CavalrYTP.js` is self-contained: the MIDI parser is bundled into it, so nothing has
> to sit next to the script and the same build runs everywhere. It ships as plain
> JavaScript, because Cavalry runs `.js` scripts directly.

Copy the whole folder rather than only the script when `dist/` also holds
`CavalrYTP_assets/`, which is where everything in `static/_assets` ends up.

## Usage

1. Pick a `.mid` file.
2. Select the tracks to import (Ctrl/Shift to select more than one).
3. Tick the layers to generate.
4. Press Generate. One Value layer per ticked output is created inside a
   `<file>.mid Controllers` group. Select a composition reference first to also write
   note-driven time remapping onto it.

## Development

The project sits in `CavalrYTP/`, laid out like the
[create-script](https://github.com/scenery-io/create-script) template.

```
.
├── .github/workflows/ci.yml   typecheck + tests, then the build
├── README.md
└── CavalrYTP/
    ├── build.mjs              the build: esbuild and the assets copy
    ├── package.json           name/displayName drive the script name
    ├── pnpm-workspace.yaml    pnpm settings: approves esbuild's build script
    ├── pnpm-lock.yaml         locked dependency versions
    ├── tsconfig.json          strict tsc over src/
    ├── src/
    │   ├── CavalrYTP.ts       entry point, builds the UI
    │   └── modules/           the core, one module per concern (all .ts)
    ├── static/
    │   └── _assets/           copied next to the script when it exists
    ├── test/                  node:test suites
    └── dist/                  built script, git-ignored
```

```sh
cd CavalrYTP
pnpm install
pnpm dev       # rebuild dist/ on change and link it into Cavalry's scripts folder
pnpm build     # one-shot build of dist/CavalrYTP.js
pnpm test      # unit tests
pnpm typecheck # tsc over src
```

`pnpm dev` links `dist/` into `Scripts/CavalrYTP`, so Cavalry picks up every rebuild
straight away, and a broken watch build writes its errors into the script so Cavalry's
log window says what went wrong. The bundle stays plain JavaScript throughout: nothing is
encrypted, nothing is zipped and no other program has to be running for a build to finish.

The sources are TypeScript, checked in strict mode by `pnpm typecheck`. They stay inside
what Node and esbuild can strip without a compiler: no enums, no namespaces, no parameter
properties (`erasableSyntaxOnly`), and every type-only import is marked (`verbatimModuleSyntax`).
That is what lets the test suite import `src/**/*.ts` directly — Node 24 strips the
annotations on the way in — and keeps esbuild to dropping types rather than transpiling.

Dependencies go through [pnpm](https://pnpm.io) with the versions locked in
`CavalrYTP/pnpm-lock.yaml`; the `packageManager` field pins the pnpm release, so
`corepack enable` picks the same one up, and `.github/workflows/ci.yml` reads the same two
fields, so CI resolves what a local checkout does. pnpm settings live in
`CavalrYTP/pnpm-workspace.yaml`, which approves esbuild's build script (pnpm 11 refuses to
run dependency build scripts that nobody has reviewed). `engines` keeps the toolchain on
Node 24.3+. `midi-file` is the one runtime dependency; esbuild inlines it into the bundle,
so it never ships as a separate file and the script ends up with no dependencies of its own.

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

## Build

```sh
cd CavalrYTP
pnpm install
pnpm build
```

This bundles and minifies `src/` into a single `dist/CavalrYTP.js` (the same file `pnpm dev`
watches) and copies `static/_assets` next to it as `CavalrYTP_assets/` when that folder
exists. Nothing is packed around the bundle: it is the script, so it ships as esbuild wrote
it.

The script ships as plain JavaScript: Cavalry runs `.js` scripts, so there is no encryption
step and no Stallion or Cavalry session needed for a build to finish.

Everything the script needs from `src/` and `node_modules` is bundled, so a watched build and
a release behave identically, apart from minification.

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and on every pull request, as two
independent jobs that both start in `CavalrYTP/`:

- `test` — `pnpm install --frozen-lockfile`, `pnpm typecheck`, then `pnpm test`.
- `build` — `pnpm install --frozen-lockfile`, `pnpm build`, then `CavalrYTP/dist` is uploaded
  as the `CavalrYTP` artifact, which is the folder to install.

## MIDI parsing

The file is parsed inside Cavalry. `api.readFromFile` only reads text, so the `.mid` arrives
through `api.encodeBinary` as base64; `modules/CavarYtpBase64.ts` decodes it into a
`Uint8Array` and [`midi-file`](https://github.com/carter-thaxton/midi-file) turns the bytes
into events. esbuild inlines the parser into the bundle, so the script needs nothing but
itself.

Timing follows the rules the retired CMC converter implemented: one tempo map shared by
every track, 120 BPM until the first `Set Tempo`, and SMPTE divisions derived from their
frame rate instead of the tempo. Only the three messages the UI reads survive (`noteon`,
`noteoff` and `controlchange`, with a velocity-0 note on normalised to `noteoff`) and tracks
without notes are dropped.
