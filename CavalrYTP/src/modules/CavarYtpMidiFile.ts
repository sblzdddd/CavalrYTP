/// <reference types="@scenery/cavalry-types" />

import { uiHandles } from "./appContext.ts";
import type { MidiData } from "./CavarYtpTypes.ts";

/** What CMC prints on stdout (see CavalryMiDiConverter/main.go). */
interface ConverterResponse {
    status: string;
    destination?: string;
    error?: string;
}

/** What `api.runProcess` hands back; its declaration only promises `unknown`. */
interface ProcessResult {
    error: string;
    output: string;
}

// Cavalry sets this to the running script's folder; cavalry-types declares it as `void`.
const scriptLocation = ui.scriptLocation as unknown as string;

// The converter ships next to the script: the bundler copies `static/_assets` into
// `CavalrYTP_assets`, and the release zip keeps the two folders side by side.
export function convertMIDIFile(filePath: string): MidiData | null {
    if (!api.filePathExists(filePath)) {
        uiHandles.modal.showMessage("MIDI file not found: " + filePath);
        return null;
    }

    var converterPath = `${scriptLocation}/CavalrYTP_assets/CMC${api.getPlatform() == "Windows" ? ".exe" : ""}`;
    var res = api.runProcess(converterPath, [api.toNativeFilePath(filePath)]) as ProcessResult;
    if (res.error) {
        uiHandles.modal.showMessage("Failed to convert MIDI file: " + res.error);
        return null;
    }

    var output = JSON.parse(res.output) as ConverterResponse;
    var destination = output.destination;
    if (output.status != "success" || !destination || !api.filePathExists(destination)) {
        uiHandles.modal.showMessage("Failed to convert MIDI file: " + output.error);
        return null;
    }

    return JSON.parse(api.readFromFile(destination)) as MidiData;
}
