/// <reference types="@scenery/cavalry-types" />

import type { parseMidi } from "midi-file";

/** The SMF default: 120 BPM, i.e. half a second per quarter note. */
const DEFAULT_MICROSECONDS_PER_BEAT = 500000;

type ParsedMidiFile = ReturnType<typeof parseMidi>;
export type MicrosecondsAt = (absTicks: number) => number;

interface TempoChange {
    absTicks: number;
    microsecondsPerBeat: number;
    /** Filled in by `stampTempoTimes`. */
    absMicroseconds: number;
}

function durationMicroseconds(
    ticks: number,
    microsecondsPerBeat: number,
    ticksPerBeat: number
): number {
    return Math.trunc((ticks * microsecondsPerBeat) / ticksPerBeat);
}

function headerNumber(value: number | undefined): number {
    return typeof value == "number" ? value : 0;
}

// Tempo belongs to the file, not to a track: changes from every track land in one map.
function collectTempoChanges(tracks: ParsedMidiFile["tracks"]): TempoChange[] {
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
    return tempoChanges;
}

// Ticks before the first change run at 120 BPM. A later change on the same tick replaces the
// tempo for everything after it, and shares the timestamp of the earlier one.
function stampTempoTimes(tempoChanges: TempoChange[], ticksPerBeat: number): void {
    var lastTicks = 0;
    var lastMicroseconds = 0;
    var lastTempo = DEFAULT_MICROSECONDS_PER_BEAT;

    for (var index = 0; index < tempoChanges.length; index += 1) {
        var change = tempoChanges[index];
        var diffTicks = change.absTicks - lastTicks;
        if (diffTicks != 0) {
            lastMicroseconds += durationMicroseconds(diffTicks, lastTempo, ticksPerBeat);
            lastTicks = change.absTicks;
        }
        change.absMicroseconds = lastMicroseconds;
        lastTempo = change.microsecondsPerBeat;
    }
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

export function microsecondsFor(parsed: ParsedMidiFile): MicrosecondsAt {
    var ticksPerBeat = headerNumber(parsed.header.ticksPerBeat);
    if (ticksPerBeat > 0) {
        var tempoChanges = collectTempoChanges(parsed.tracks);
        stampTempoTimes(tempoChanges, ticksPerBeat);
        return function (absTicks) {
            return microsecondsAtTicks(tempoChanges, ticksPerBeat, absTicks);
        };
    }

    var framesPerSecond = headerNumber(parsed.header.framesPerSecond);
    var ticksPerFrame = headerNumber(parsed.header.ticksPerFrame);
    return function (absTicks) {
        return smpteMicrosecondsAt(absTicks, framesPerSecond, ticksPerFrame);
    };
}
