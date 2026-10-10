/// <reference types="@scenery/cavalry-types" />

import { state, uiHandles } from "./appContext.ts";
import { convertMIDIFile } from "./CavarYtpMidiFile.ts";
import { hasEnabledOutputLayer } from "./CavarYtpOutputs.ts";
import { getTrackRows } from "./CavarYtpTracks.ts";

export function updateSubmitButton(): void {
    uiHandles.submitButton.setEnabled(
        state.selectedMIDIFile != null &&
        state.midiFile != null &&
        state.selectedTrackUUIDs.length > 0 &&
        hasEnabledOutputLayer()
    );
}

export function clearLoadedMIDI(): void {
    state.midiFile = null;
    state.selectedTrackUUIDs = [];
    uiHandles.trackList.setModel([]);
    uiHandles.trackList.setEnabled(false);
    updateSubmitButton();
}

export function loadMIDIFile(filePath: string): void {
    state.selectedMIDIFile = filePath;
    uiHandles.deleteButton.setEnabled(true);
    clearLoadedMIDI();

    var midiData = convertMIDIFile(filePath);
    if (!midiData) {
        return;
    }

    var trackRows = getTrackRows(midiData);
    state.midiFile = midiData;
    uiHandles.trackList.setModel(trackRows);
    uiHandles.trackList.setEnabled(trackRows.length > 0);
    updateSubmitButton();
}
