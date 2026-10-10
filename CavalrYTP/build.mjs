// Builds the Cavalry script from src/.
//
// This replaces the release path of `@scenery/bundler`. That one always piped the bundle
// through Stallion (the Cavalry-side bridge) to encrypt it: the step needs Cavalry open with
// the Stallion script running, it aborts the whole build when it is not there, and the sealed
// file is bigger than the bundle it wraps. Cavalry runs plain `.js` scripts, so the bundle
// ships exactly as esbuild wrote it.
//
//   node build.mjs           clean build into dist/, the folder that ships
//   node build.mjs --watch   rebuild on change, the file Cavalry reads
//
// `esbuildOptions` is exported because test/bundle.test.mjs bundles with the same options, so
// the "single flat script" guard cannot drift away from what actually ships.
import { build, context } from "esbuild";
import { cp, lstat, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join, resolve } from "node:path";

const ROOT = import.meta.dirname;
const OUTDIR = join(ROOT, "dist");
const ENTRY = join(ROOT, "src", "CavalrYTP.ts");
const ASSETS = join(ROOT, "static", "_assets");

const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
const { name, displayName, version } = pkg;
const outfile = join(OUTDIR, `${displayName}.js`);

// Cavalry lists scripts from a per-user folder, and a directory link into dist/ is how a
// rebuild shows up in that menu without copying anything.
const appData = platform() === "darwin" ? "/Library/Application Support" : "/AppData/Roaming";
const scriptsDir = join(homedir(), appData, "Cavalry", "Scripts");
const scriptPath = join(scriptsDir, displayName);

export function esbuildOptions(devmode = false) {
    return {
        entryPoints: [ENTRY],
        bundle: true,
        platform: "neutral",
        target: ["es2020"],
        mainFields: ["main", "module", "browser"],
        // The runtime has no module loader, so nothing may stay external or be split off.
        minifyWhitespace: !devmode,
        minifyIdentifiers: !devmode,
        logLevel: devmode ? "info" : "warning",
        define: {
            DEVMODE: JSON.stringify(devmode),
            PRODUCT_NAME: JSON.stringify(name),
            PRODUCT_DISPLAY_NAME: JSON.stringify(displayName),
            PRODUCT_VERSION: JSON.stringify(version),
        },
    };
}

// Everything in static/_assets has to sit next to the script, as <displayName>_assets/.
function copyAssets() {
    return {
        name: "copy-assets",
        setup(build) {
            build.onEnd(async () => {
                const files = await readdir(ASSETS).catch(() => []);
                if (!files.length) return;
                await cp(ASSETS, join(OUTDIR, `${displayName}_assets`), {
                    recursive: true,
                    dereference: true,
                    force: true,
                    preserveTimestamps: true,
                });
            });
        },
    };
}

// A failed watch build writes the errors into the bundle, so Cavalry's log window says what
// broke instead of quietly running the previous script.
function reportErrors() {
    return {
        name: "report-errors",
        setup(build) {
            build.onEnd(async (result) => {
                if (!result.errors.length) return;
                const target = build.initialOptions.outfile;
                const lines = result.errors.map(
                    (error) => `console.error(${JSON.stringify(error.text)})`
                );
                const summary = `${lines.length} build errors in ${displayName}. Check the terminal.`;
                lines.push(`console.error(${JSON.stringify(summary)})`);
                await writeFile(target, lines.join("\n"), "utf8");
                console.log(`Errors written to ${target}`);
            });
        },
    };
}

// Cavalry runs whatever is in that folder. A leftover link is replaced, a foreign folder is
// reported instead of deleted. lstat rather than exists() so a stale link can be repaired
// instead of looking like the folder is free.
async function linkIntoCavalry() {
    try {
        // The link is a development shortcut so Cavalry reloads every rebuild; dist/ on its own
        // is the deliverable, so a machine without Cavalry (CI) simply skips it.
        if (!existsSync(scriptsDir)) {
            console.log(`No Cavalry at ${scriptsDir}, skipped linking ${scriptPath}`);
            return;
        }
        const existing = await lstat(scriptPath).catch(() => null);
        if (existing) {
            const linked = existing.isSymbolicLink();
            const empty = existing.isDirectory() && !readdirSync(scriptPath).length;
            if (!linked && !empty) {
                throw new Error(`it already exists and is not mine, please rename ${scriptPath}`);
            }
            await rm(scriptPath, { recursive: true, force: true });
        }
        await mkdir(OUTDIR, { recursive: true });
        await symlink(resolve(OUTDIR), scriptPath, "junction");
        console.log(`Linked ${scriptPath} -> dist`);
    } catch (error) {
        console.warn(`Could not link dist/ into Cavalry: ${error.message}`);
    }
}

// Nothing is packed around the bundle: it is the script, so it goes to dist/ as it is.
async function buildOnce() {
    await rm(OUTDIR, { recursive: true, force: true });
    await build({ ...esbuildOptions(), outfile, plugins: [copyAssets()] });
    await linkIntoCavalry();
    console.log(`Built ${outfile}`);
}

async function watch() {
    const ctx = await context({
        ...esbuildOptions(true),
        outfile,
        plugins: [copyAssets(), reportErrors()],
    });
    await ctx.watch();
    await linkIntoCavalry();
    console.log(`Watching… Cavalry reads the script from ${scriptPath}`);
}

// Only when run directly: the test suite imports esbuildOptions() without building anything.
if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
    await (process.argv.includes("--watch") ? watch() : buildOnce());
}
