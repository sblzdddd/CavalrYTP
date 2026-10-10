/// <reference types="@scenery/cavalry-types" />

// Types only: nothing here reaches the bundle or the stripped test run.

export interface MidiEvent {
    absMicroseconds: number;
    /** `noteon`, `noteoff` or `controlchange`; every other message is dropped while parsing. */
    type: string;
    /** key, velocity, channel, controller, value, … */
    data?: Record<string, unknown>;
}

export interface MidiEventData {
    data?: Record<string, unknown>;
}

export interface MidiTrack {
    index?: number;
    name?: string;
    events?: MidiEvent[];
}

export interface MidiData {
    trackNames?: string[];
    tracks: MidiTrack[];
}

export interface MidiNote {
    frame: number;
    trackIndex: number;
    channel: number;
    key: number;
    velocity: number;
    /** Frame of the matching note-off, or `null` when the file never turns the note off. */
    noteOffFrame: number | null;
    durationFrames: number;
}

export type ControlName = "pan" | "volume" | "glide";

export interface ControlEvent {
    frame: number;
    value: number;
}

export type ControlEvents = Record<ControlName, ControlEvent[]>;

export interface MidiTimeline {
    notes: MidiNote[];
    controls: ControlEvents;
}

export interface Timing {
    compId: string;
    fps: number;
    startFrame: number;
}

export interface FrameValueKeyframe {
    frame: number;
    value: number;
}
