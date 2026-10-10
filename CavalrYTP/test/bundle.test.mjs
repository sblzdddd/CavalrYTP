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
import { esbuildOptions } from "../build.mjs";

const BUILD_SCRIPT = fileURLToPath(new URL("../build.mjs", import.meta.url));
const PACKAGE_JSON = fileURLToPath(new URL("../package.json", import.meta.url));

// build.mjs is free to explain what used to be there, so its comments are stripped before
// asserting on what is left of it.
function stripComments(source) {
    return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

// The build script exports the options it ships with, so this cannot drift from the release.
async function bundle() {
    const outdir = await mkdtemp(join(tmpdir(), "cavarytp-bundle-"));
    const outfile = join(outdir, "CavalrYTP.js");

    await build({ ...esbuildOptions(), outfile });

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

test("the build ships the plain bundle instead of sealed output", async () => {
    // The Stallion step is gone for good: it needed Cavalry open with the Stallion script
    // running, and it aborted the whole build when it was not.
    const code = stripComments(await readFile(BUILD_SCRIPT, "utf8"));

    assert.equal(code.includes("@scenery/bundler"), false, "the bundler is not imported");
    assert.equal(code.includes("encrypt"), false, "nothing seals the bundle");
    assert.equal(code.includes("8080"), false, "nothing talks to the Stallion port");
    assert.equal(code.includes("fetch("), false, "no request leaves the build");

    const pkg = JSON.parse(await readFile(PACKAGE_JSON, "utf8"));
    const scripts = Object.values(pkg.scripts).join(" ");
    assert.equal(scripts.includes("bundler"), false, "the bundler's release path is unwired");
    assert.ok(scripts.includes("build.mjs"), "the build runs build.mjs");
    assert.equal(pkg.devDependencies["@scenery/bundler"], undefined);
});

test("the build leaves the script in dist/ instead of packing it", async () => {
    // Nothing is zipped: the bundle is the deliverable, so it goes straight to dist/ and the
    // archiver is no longer a dependency.
    const code = stripComments(await readFile(BUILD_SCRIPT, "utf8"));

    assert.ok(code.includes('"dist"'), "the script is written to dist/");
    assert.equal(code.includes("AdmZip"), false, "no archiver is imported");
    assert.equal(code.includes("writeZip"), false, "no archive is written");
    assert.equal(code.includes(".zip"), false, "no archive is named");

    const pkg = JSON.parse(await readFile(PACKAGE_JSON, "utf8"));
    assert.equal(pkg.devDependencies["adm-zip"], undefined);
    assert.equal(pkg.dependencies["adm-zip"], undefined);
});
