/// <reference types="@scenery/cavalry-types" />

import { parseMidi } from "midi-file";
import { uiHandles } from "./appContext.ts";
import { decodeBase64 } from "./CavarYtpBase64.ts";
import { microsecondsFor } from "./CavarYtpMidiTime.ts";
import type { MicrosecondsAt } from "./CavarYtpMidiTime.ts";
import type { MidiData, MidiEvent, MidiTrack } from "./CavarYtpTypes.ts";

type ParsedMidiFile = ReturnType<typeof parseMidi>;
type ParsedTrack = ParsedMidiFile["tracks"][number];
type ParsedEvent = ParsedTrack[number];

// Only the three messages the UI reads survive: a note start, a note end and a controller.
// `midi-file` already turns a note on with velocity 0 into a note off, so one `noteoff`
// branch covers both spellings.
function convertEvent(event: ParsedEvent, absMicroseconds: number): MidiEvent | null {
    if (event.type == "noteOn" || event.type == "noteOff") {
        return {
            absMicroseconds: absMicroseconds,
            type: event.type == "noteOn" ? "noteon" : "noteoff",
            data: { channel: event.channel, key: event.noteNumber, velocity: event.velocity },
        };
    }
    if (event.type == "controller") {
        return {
            absMicroseconds: absMicroseconds,
            type: "controlchange",
            data: { channel: event.channel, controller: event.controllerType, value: event.value },
        };
    }
    return null;
}

// Drops the sequencer scaffolding (tempo, time signatures, …). A track with no note-ons is
// left out, and the original index is kept so the UI can label the ones that remain.
function convertTrack(
    events: ParsedTrack,
    trackIndex: number,
    microsecondsAt: MicrosecondsAt
): MidiTrack | null {
    var trackName = "";
    var absTicks = 0;
    var hasNotes = false;
    var convertedEvents: MidiEvent[] = [];

    for (var index = 0; index < events.length; index += 1) {
        var event = events[index];
        absTicks += event.deltaTime;
        if (event.type == "trackName") {
            trackName = event.text;
            continue;
        }
        if (event.type == "noteOn") {
            hasNotes = true;
        }

        var converted = convertEvent(event, microsecondsAt(absTicks));
        if (converted) {
            convertedEvents.push(converted);
        }
    }

    if (!hasNotes) {
        return null;
    }

    var name = trackName || "Track " + (trackIndex + 1);
    return { index: trackIndex, name: name, events: convertedEvents };
}

export function parseMidiBytes(bytes: Uint8Array): MidiData {
    var parsed = parseMidi(bytes);
    var microsecondsAt = microsecondsFor(parsed);
    var tracks: MidiTrack[] = [];
    var trackNames: string[] = [];

    for (var trackIndex = 0; trackIndex < parsed.tracks.length; trackIndex += 1) {
        var track = convertTrack(parsed.tracks[trackIndex], trackIndex, microsecondsAt);
        if (!track || !track.name) {
            continue;
        }
        tracks.push(track);
        trackNames.push(track.name);
    }

    return { trackNames: trackNames, tracks: tracks };
}

function toMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

// Cavalry hands the file over as base64 because `api.readFromFile` is text-only. From there
// everything is plain JavaScript, so no external converter is involved and the script runs on
// every platform Cavalry ships for.
export function convertMIDIFile(filePath: string): MidiData | null {
    if (!api.filePathExists(filePath)) {
        uiHandles.modal.showMessage("MIDI file not found: " + filePath);
        return null;
    }

    var encoded = "";
    try {
        encoded = api.encodeBinary(filePath);
    } catch (error) {
        uiHandles.modal.showMessage("Failed to read MIDI file: " + toMessage(error));
        return null;
    }

    if (!encoded) {
        uiHandles.modal.showMessage("Failed to read MIDI file: " + filePath);
        return null;
    }

    try {
        return parseMidiBytes(decodeBase64(encoded));
    } catch (error) {
        uiHandles.modal.showMessage("Failed to convert MIDI file: " + toMessage(error));
        return null;
    }
}
