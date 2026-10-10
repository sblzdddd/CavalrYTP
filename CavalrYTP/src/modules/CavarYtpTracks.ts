/// <reference types="@scenery/cavalry-types" />

import { state } from "./appContext.ts";
import type { MidiData, MidiTrack } from "./CavarYtpTypes.ts";

export interface TrackRow {
    uuid: string;
    label: string;
    tooltip: string;
}

export function makeTrackLabel(
    track: MidiTrack,
    fallbackName: string | undefined,
    rowIndex: number
): string {
    var trackNumber = typeof track.index == "number" ? track.index + 1 : rowIndex + 1;
    if (track.name) {
        return track.name;
    }
    if (fallbackName) {
        return fallbackName;
    }
    return "Track " + trackNumber;
}

export function getTrackRows(midiData: MidiData | null | undefined): TrackRow[] {
    var rows: TrackRow[] = [];
    var tracks = midiData && midiData.tracks ? midiData.tracks : [];
    var trackNames = midiData && midiData.trackNames ? midiData.trackNames : [];

    for (var index = 0; index < tracks.length; index += 1) {
        var track = tracks[index];
        var trackId = typeof track.index == "number" ? track.index : index;
        var trackNumber = typeof track.index == "number" ? track.index + 1 : index + 1;
        rows.push({
            uuid: "track-" + trackId,
            label: makeTrackLabel(track, trackNames[index], index),
            tooltip: "MIDI track " + trackNumber,
        });
    }

    return rows;
}

export function getSelectedTracks(): MidiTrack[] {
    var midiFile = state.midiFile;
    if (!midiFile) {
        return [];
    }

    var selected: Record<string, boolean> = {};
    var selectedTracks: MidiTrack[] = [];
    for (var index = 0; index < state.selectedTrackUUIDs.length; index += 1) {
        selected[state.selectedTrackUUIDs[index]] = true;
    }

    for (var trackIndex = 0; trackIndex < midiFile.tracks.length; trackIndex += 1) {
        var track = midiFile.tracks[trackIndex];
        var trackId = typeof track.index == "number" ? track.index : trackIndex;
        if (selected["track-" + trackId]) {
            selectedTracks.push(track);
        }
    }

    return selectedTracks;
}
