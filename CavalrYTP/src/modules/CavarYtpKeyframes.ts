/// <reference types="@scenery/cavalry-types" />

import { CONTROL_DEFAULTS, KEYFRAME_LINEAR, KEYFRAME_STEP } from "./CavarYtpConstants.ts";
import type { InterpolationType } from "./CavarYtpConstants.ts";
import type { OutputId } from "./CavarYtpOutputs.ts";
import type {
    ControlName,
    FrameValueKeyframe,
    MidiNote,
    MidiTimeline,
    Timing,
} from "./CavarYtpTypes.ts";

export interface OutputKeyframes {
    keyframes: FrameValueKeyframe[];
    interpolationType: InterpolationType;
}

type OutputBuilder = (timeline: MidiTimeline, timing: Timing) => OutputKeyframes;
type NoteNumberKey = "durationFrames" | "velocity" | "key";

// Duplicate frames are collapsed (last value wins) and every written keyframe gets the
// interpolation type.
export function addAttributeKeyframes(
    layerId: string,
    attrId: string,
    keyframes: FrameValueKeyframe[],
    interpolationType: InterpolationType
): void {
    var byFrame: Record<number, number | undefined> = {};
    var frames: number[] = [];

    for (var index = 0; index < keyframes.length; index += 1) {
        var frame = keyframes[index].frame;
        if (byFrame[frame] == null) {
            frames.push(frame);
        }
        byFrame[frame] = keyframes[index].value;
    }

    frames.sort(function (a, b) {
        return a - b;
    });

    for (var frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
        var keyFrame = frames[frameIndex];
        api.keyframe(layerId, keyFrame, { [attrId]: byFrame[keyFrame] });
        api.modifyKeyframe(layerId, { [attrId]: { frame: keyFrame, type: interpolationType } });
    }
}

export function addValueKeyframes(
    layerId: string,
    keyframes: FrameValueKeyframe[],
    interpolationType: InterpolationType
): void {
    addAttributeKeyframes(layerId, "value", keyframes, interpolationType);
}

function mapKeys<T extends { frame: number }>(
    items: T[],
    valueAt: (item: T, index: number) => number
): FrameValueKeyframe[] {
    var keys: FrameValueKeyframe[] = [];
    for (var index = 0; index < items.length; index += 1) {
        keys.push({ frame: items[index].frame, value: valueAt(items[index], index) });
    }
    return keys;
}

function step(keyframes: FrameValueKeyframe[]): OutputKeyframes {
    return { keyframes: keyframes, interpolationType: KEYFRAME_STEP };
}

function seeded(
    startFrame: number,
    value: number,
    rest: FrameValueKeyframe[]
): FrameValueKeyframe[] {
    return [{ frame: startFrame, value: value }].concat(rest);
}

/** Rides 0 → note length while the note sounds and snaps back to 0 on retrigger. */
export function buildTimeRemapKeys(notes: MidiNote[]): FrameValueKeyframe[] {
    var keys: FrameValueKeyframe[] = [];
    for (var index = 0; index < notes.length; index += 1) {
        var note = notes[index];
        var nextNote = notes[index + 1];
        var endFrame = nextNote ? nextNote.frame - 1 : note.frame + note.durationFrames;

        keys.push({ frame: note.frame, value: 0 });
        if (endFrame > note.frame) {
            keys.push({ frame: endFrame, value: endFrame - note.frame });
        }
    }
    return keys;
}

function noteOutput(propertyName: NoteNumberKey): OutputBuilder {
    return function (timeline) {
        return step(
            mapKeys(timeline.notes, function (note) {
                return note[propertyName];
            })
        );
    };
}

/** Starts at +1 on `startFrame` and flips sign on every note. */
function flipOutput(timeline: MidiTimeline, timing: Timing): OutputKeyframes {
    var value = 1;
    return step(
        seeded(
            timing.startFrame,
            value,
            mapKeys(timeline.notes, function () {
                value *= -1;
                return value;
            })
        )
    );
}

function controlOutput(name: ControlName): OutputBuilder {
    return function (timeline, timing) {
        var events = timeline.controls[name];
        events.sort(function (a, b) {
            return a.frame - b.frame;
        });
        return step(
            seeded(
                timing.startFrame,
                CONTROL_DEFAULTS[name],
                mapKeys(events, function (event) {
                    return event.value;
                })
            )
        );
    };
}

var OUTPUT_BUILDERS: Record<OutputId, OutputBuilder> = {
    timeRemap: function (timeline) {
        return { keyframes: buildTimeRemapKeys(timeline.notes), interpolationType: KEYFRAME_LINEAR };
    },
    duration: noteOutput("durationFrames"),
    velocity: noteOutput("velocity"),
    pitch: noteOutput("key"),
    count: function (timeline) {
        return step(
            mapKeys(timeline.notes, function (_note, index) {
                return index + 1;
            })
        );
    },
    flip: flipOutput,
    pan: controlOutput("pan"),
    volume: controlOutput("volume"),
    glide: controlOutput("glide"),
};

export function getOutputKeyframes(
    outputId: string,
    timeline: MidiTimeline,
    timing: Timing
): OutputKeyframes | null {
    if (!Object.prototype.hasOwnProperty.call(OUTPUT_BUILDERS, outputId)) {
        return null;
    }
    return OUTPUT_BUILDERS[outputId as OutputId](timeline, timing);
}
