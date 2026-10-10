/// <reference types="@scenery/cavalry-types" />

import { parseMidi } from "midi-file";
import { uiHandles } from "./appContext.ts";
import { decodeBase64 } from "./CavarYtpBase64.ts";
import type { MidiData, MidiEvent, MidiTrack } from "./CavarYtpTypes.ts";

/** The SMF default: 120 BPM, i.e. half a second per quarter note. */
const DEFAULT_MICROSECONDS_PER_BEAT = 500000;

type ParsedMidiFile = ReturnType<typeof parseMidi>;
type ParsedEvent = ParsedMidiFile["tracks"][number][number];

interface TempoChange {
    absTicks: number;
    microsecondsPerBeat: number;
    /** Filled in by `buildTempoMap`. */
    absMicroseconds: number;
}

function durationMicroseconds(
    ticks: number,
    microsecondsPerBeat: number,
    ticksPerBeat: number
): number {
    return Math.trunc((ticks * microsecondsPerBeat) / ticksPerBeat);
}

/** The last tempo change at or before `absTicks`; the list is sorted by `absTicks`. */
function tempoChangeAt(tempoChanges: TempoChange[], absTicks: number): TempoChange | null {
    var found: TempoChange | null = null;
    for (var index = 0; index < tempoChanges.length; index += 1) {
        if (tempoChanges[index].absTicks > absTicks) {
            break;
        }
        found = tempoChanges[index];
    }
    return found;
}

// Tempo belongs to the file, not to a track: changes from every track land in one map and are
// applied to every event. Ticks before the first change run at the MIDI default of 120 BPM.
function buildTempoMap(tracks: ParsedMidiFile["tracks"], ticksPerBeat: number): TempoChange[] {
    var tempoChanges: TempoChange[] = [];

    for (var trackIndex = 0; trackIndex < tracks.length; trackIndex += 1) {
        var events = tracks[trackIndex];
        var absTicks = 0;
        for (var eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
            var event = events[eventIndex];
            absTicks += event.deltaTime;
            if (event.type == "setTempo") {
                tempoChanges.push({
                    absTicks: absTicks,
                    microsecondsPerBeat: event.microsecondsPerBeat,
                    absMicroseconds: 0,
                });
            }
        }
    }

    tempoChanges.sort(function (a, b) {
        return a.absTicks - b.absTicks;
    });

    var lastTicks = 0;
    var lastMicroseconds = 0;
    for (var changeIndex = 0; changeIndex < tempoChanges.length; changeIndex += 1) {
        var change = tempoChanges[changeIndex];
        var diffTicks = change.absTicks - lastTicks;
        if (diffTicks == 0) {
            change.absMicroseconds = lastMicroseconds;
            continue;
        }

        var previous = tempoChangeAt(tempoChanges, change.absTicks - 1);
        var previousMicroseconds = previous ? previous.absMicroseconds : 0;
        var previousTempo = previous ? previous.microsecondsPerBeat : DEFAULT_MICROSECONDS_PER_BEAT;
        change.absMicroseconds =
            previousMicroseconds + durationMicroseconds(diffTicks, previousTempo, ticksPerBeat);
        lastTicks = change.absTicks;
        lastMicroseconds = change.absMicroseconds;
    }

    return tempoChanges;
}

function microsecondsAtTicks(
    tempoChanges: TempoChange[],
    ticksPerBeat: number,
    absTicks: number
): number {
    var previous = tempoChangeAt(tempoChanges, absTicks - 1);
    if (!previous) {
        return durationMicroseconds(absTicks, DEFAULT_MICROSECONDS_PER_BEAT, ticksPerBeat);
    }
    return (
        previous.absMicroseconds +
        durationMicroseconds(
            absTicks - previous.absTicks,
            previous.microsecondsPerBeat,
            ticksPerBeat
        )
    );
}

/** SMPTE divisions are absolute: a tick is a fixed slice of a second and tempo plays no part. */
function smpteMicrosecondsAt(
    absTicks: number,
    framesPerSecond: number,
    ticksPerFrame: number
): number {
    var ticksPerSecond = framesPerSecond * ticksPerFrame;
    if (ticksPerSecond <= 0) {
        return 0;
    }
    return Math.trunc((absTicks * 1000000) / ticksPerSecond);
}

// Only the three messages the UI reads survive: a note start, a note end and a controller.
// `midi-file` already turns a note on with velocity 0 into a note off, so one `noteoff`
// branch covers both spellings.
function convertEvent(event: ParsedEvent, absMicroseconds: number): MidiEvent | null {
    if (event.type == "noteOn") {
        return {
            absMicroseconds: absMicroseconds,
            type: "noteon",
            data: { channel: event.channel, key: event.noteNumber, velocity: event.velocity },
        };
    }
    if (event.type == "noteOff") {
        return {
            absMicroseconds: absMicroseconds,
            type: "noteoff",
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

// Drops the sequencer scaffolding (tempo, time signatures, …) and keeps only the tracks that
// actually play something, with their original index so the UI can label them.
export function parseMidiBytes(bytes: Uint8Array): MidiData {
    var parsed = parseMidi(bytes);
    var header = parsed.header;
    var ticksPerBeat = typeof header.ticksPerBeat == "number" ? header.ticksPerBeat : 0;
    var metric = ticksPerBeat > 0;
    var tempoChanges = metric ? buildTempoMap(parsed.tracks, ticksPerBeat) : [];
    var framesPerSecond = typeof header.framesPerSecond == "number" ? header.framesPerSecond : 0;
    var ticksPerFrame = typeof header.ticksPerFrame == "number" ? header.ticksPerFrame : 0;

    var tracks: MidiTrack[] = [];
    var trackNames: string[] = [];

    for (var trackIndex = 0; trackIndex < parsed.tracks.length; trackIndex += 1) {
        var events = parsed.tracks[trackIndex];
        var trackName = "";
        var absTicks = 0;
        var hasNotes = false;
        var convertedEvents: MidiEvent[] = [];

        for (var eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
            var event = events[eventIndex];
            absTicks += event.deltaTime;

            if (event.type == "trackName") {
                trackName = event.text;
                continue;
            }

            var absMicroseconds = metric
                ? microsecondsAtTicks(tempoChanges, ticksPerBeat, absTicks)
                : smpteMicrosecondsAt(absTicks, framesPerSecond, ticksPerFrame);

            if (event.type == "noteOn") {
                hasNotes = true;
            }

            var converted = convertEvent(event, absMicroseconds);
            if (converted) {
                convertedEvents.push(converted);
            }
        }

        if (!hasNotes) {
            continue;
        }

        var name = trackName || "Track " + (trackIndex + 1);
        tracks.push({ index: trackIndex, name: name, events: convertedEvents });
        trackNames.push(name);
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
