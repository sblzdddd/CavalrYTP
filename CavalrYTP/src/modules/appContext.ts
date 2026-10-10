/// <reference types="@scenery/cavalry-types" />

import type { OutputId } from "./CavarYtpOutputs.ts";
import type { MidiData } from "./CavarYtpTypes.ts";

export interface AppState {
    selectedMIDIFile: string | null;
    midiFile: MidiData | null;
    selectedTrackUUIDs: string[];
    outputOptions: Partial<Record<OutputId, boolean>>;
}

export const state: AppState = {
    selectedMIDIFile: null,
    midiFile: null,
    selectedTrackUUIDs: [],
    outputOptions: {},
};

// Assigned while the entry script builds the layout. Helpers only ever touch these from
// callbacks, which cannot fire before that, so they are typed as ready rather than as `null`.
export interface UiHandles {
    modal: ui.Modal;
    trackList: ui.List;
    submitButton: ui.Button;
    deleteButton: ui.ImageButton;
}

export const uiHandles = {} as UiHandles;
