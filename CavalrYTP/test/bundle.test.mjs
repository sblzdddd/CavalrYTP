// Run with: pnpm test
//
// Cavalry has no module loader, so a surviving `import`/`export`, an `api.load()` of a sibling
// file or a leftover type annotation would only show up as a broken script. The entry point is
// TypeScript, so this also covers the type stripping esbuild does on the way to the bundle.

import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));

// The same options @scenery/bundler passes to esbuild for a release build.
async function bundle() {
    const outdir = await mkdtemp(join(tmpdir(), "cavarytp-bundle-"));
    const outfile = join(outdir, "CavalrYTP.js");

    await build({
        entryPoints: [join(SRC, "CavalrYTP.ts")],
        outfile,
        bundle: true,
        target: ["es2020"],
        platform: "neutral",
        mainFields: ["main", "module", "browser"],
        minifyWhitespace: true,
        minifyIdentifiers: true,
    });

    const source = await readFile(outfile, "utf8");
    await rm(outdir, { recursive: true, force: true });
    return source;
}

const source = await bundle();

test("the bundle is a single flat script", () => {
    const moduleSyntax = source
        .split(/\r?\n/)
        .map((line, index) => ({ line: line.trim(), index: index + 1 }))
        .filter((entry) => /^(import|export)\s/.test(entry.line));

    assert.deepEqual(moduleSyntax, [], "no import/export may survive bundling");
    assert.equal(source.includes("import.meta"), false);
    assert.equal(source.includes("require("), false);
});

test("the bundle carries the whole core instead of loading it", () => {
    assert.equal(source.includes("api.load"), false, "modules are bundled, not api.load()ed");
    assert.equal(source.includes("./modules/"), false);
    assert.equal(source.includes("CavarYtpCore"), false);
});

test("the bundle parses the MIDI in-process instead of shelling out", () => {
    // CMC.exe and the JSON hand-off are gone: the parser is bundled in, the file arrives as
    // base64 and nothing is spawned, so no sibling binary or platform branch is left.
    assert.equal(source.includes("runProcess"), false, "no process is spawned");
    assert.equal(source.includes("getPlatform"), false, "no platform branch is left");
    assert.equal(source.includes("scriptLocation"), false, "no sibling folder is resolved");
    assert.equal(source.includes("CavalrYTP_assets"), false);
    assert.ok(source.includes("encodeBinary"), "binary files are read through the api");
    assert.ok(source.includes("Bad MIDI file"), "the midi-file parser is inlined");
});
