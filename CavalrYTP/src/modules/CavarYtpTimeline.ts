/// <reference types="@scenery/cavalry-types" />

import { CONTROL_DEFAULTS } from "./CavarYtpConstants.ts";
import { getEventNumber } from "./CavarYtpNumbers.ts";
import type {
    ControlEvent,
    ControlName,
    ControlEvents,
    MidiEventData,
    MidiNote,
    MidiTimeline,
    MidiTrack,
    Timing,
} from "./CavarYtpTypes.ts";

export function microsecondsToFrame(
    absMicroseconds: number,
    fps: number,
    startFrame: number
): number {
    return startFrame + Math.round((absMicroseconds / 1000000) * fps);
}

export function eventSort(a: MidiNote, b: MidiNote): number {
    if (a.frame != b.frame) {
        return a.frame - b.frame;
    }
    if (a.trackIndex != b.trackIndex) {
        return a.trackIndex - b.trackIndex;
    }
    return a.key - b.key;
}

export function getControlName(event: MidiEventData): ControlName | null {
    var controller = getEventNumber(event, "controller", -1);
    if (controller == 10) {
        return "pan";
    }
    if (controller == 7) {
        return "volume";
    }
    if (controller == 5) {
        return "glide";
    }
    return null;
}

// Notes are paired with their note-off, sorted, de-duplicated by frame (chords collapse to the
// first note) and fall back to the next note's frame when the file never ends them.
export function collectMidiTimeline(tracks: MidiTrack[], timing: Timing): MidiTimeline {
    var rawNotes: MidiNote[] = [];
    var controls: ControlEvents = {
        pan: [],
        volume: [],
        glide: [],
    };

    for (var trackIndex = 0; trackIndex < tracks.length; trackIndex += 1) {
        var track = tracks[trackIndex];
        var activeNotes: Record<string, MidiNote[]> = {};
        var events = track.events || [];

        for (var eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
            var event = events[eventIndex];
            var frame = microsecondsToFrame(event.absMicroseconds, timing.fps, timing.startFrame);

            if (event.type == "noteon" && getEventNumber(event, "velocity", 0) > 0) {
                var noteKey = getEventNumber(event, "key", 0);
                var channel = getEventNumber(event, "channel", 0);
                var activeKey = channel + ":" + noteKey;
                var note: MidiNote = {
                    frame: frame,
                    trackIndex: typeof track.index == "number" ? track.index : trackIndex,
                    channel: channel,
                    key: noteKey,
                    velocity: getEventNumber(event, "velocity", 0),
                    noteOffFrame: null,
                    durationFrames: 1,
                };

                if (!activeNotes[activeKey]) {
                    activeNotes[activeKey] = [];
                }
                activeNotes[activeKey].push(note);
                rawNotes.push(note);
            } else if (event.type == "noteoff") {
                var offKey = getEventNumber(event, "key", 0);
                var offChannel = getEventNumber(event, "channel", 0);
                var offActiveKey = offChannel + ":" + offKey;
                var waitingNotes = activeNotes[offActiveKey];
                if (waitingNotes && waitingNotes.length > 0) {
                    var waitingNote = waitingNotes.shift();
                    if (waitingNote) {
                        waitingNote.noteOffFrame = frame;
                    }
                }
            } else if (event.type == "controlchange") {
                var controlName = getControlName(event);
                if (controlName) {
                    controls[controlName].push({
                        frame: frame,
                        value: getEventNumber(event, "value", CONTROL_DEFAULTS[controlName]),
                    });
                }
            }
        }
    }

    rawNotes.sort(eventSort);

    var notes: MidiNote[] = [];
    var seenNoteFrames: Record<number, boolean> = {};
    for (var rawIndex = 0; rawIndex < rawNotes.length; rawIndex += 1) {
        var rawNote = rawNotes[rawIndex];
        if (seenNoteFrames[rawNote.frame]) {
            continue;
        }
        seenNoteFrames[rawNote.frame] = true;
        notes.push(rawNote);
    }

    for (var noteIndex = 0; noteIndex < notes.length; noteIndex += 1) {
        var currentNote = notes[noteIndex];
        var nextNote = notes[noteIndex + 1];
        var fallbackEndFrame = nextNote ? nextNote.frame : currentNote.frame + 1;
        var noteEndFrame =
            currentNote.noteOffFrame != null ? currentNote.noteOffFrame : fallbackEndFrame;
        currentNote.durationFrames = Math.max(1, noteEndFrame - currentNote.frame);
    }

    return {
        notes: notes,
        controls: controls,
    };
}

export function getLastGeneratedFrame(timeline: MidiTimeline): number {
    var lastFrame = 0;
    for (var noteIndex = 0; noteIndex < timeline.notes.length; noteIndex += 1) {
        var note = timeline.notes[noteIndex];
        lastFrame = Math.max(lastFrame, note.frame + note.durationFrames);
    }

    for (var controlName in timeline.controls) {
        var controlEvents: ControlEvent[] = timeline.controls[controlName as ControlName];
        for (var controlIndex = 0; controlIndex < controlEvents.length; controlIndex += 1) {
            lastFrame = Math.max(lastFrame, controlEvents[controlIndex].frame);
        }
    }

    return lastFrame;
}
