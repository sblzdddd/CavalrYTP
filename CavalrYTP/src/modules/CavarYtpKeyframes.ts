/// <reference types="@scenery/cavalry-types" />

import { CONTROL_DEFAULTS, KEYFRAME_LINEAR, KEYFRAME_STEP } from "./CavarYtpConstants.ts";
import type { InterpolationType } from "./CavarYtpConstants.ts";
import type {
    ControlEvent,
    FrameValueKeyframe,
    MidiNote,
    MidiTimeline,
    Timing,
} from "./CavarYtpTypes.ts";

export type NoteNumberKey = "durationFrames" | "velocity" | "key";

export interface OutputKeyframes {
    keyframes: FrameValueKeyframe[];
    interpolationType: InterpolationType;
}

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

export function buildNoteValueKeys(
    notes: MidiNote[],
    propertyName: NoteNumberKey
): FrameValueKeyframe[] {
    var keys: FrameValueKeyframe[] = [];
    for (var index = 0; index < notes.length; index += 1) {
        keys.push({
            frame: notes[index].frame,
            value: notes[index][propertyName],
        });
    }
    return keys;
}

export function buildCountKeys(notes: MidiNote[]): FrameValueKeyframe[] {
    var keys: FrameValueKeyframe[] = [];
    for (var index = 0; index < notes.length; index += 1) {
        keys.push({
            frame: notes[index].frame,
            value: index + 1,
        });
    }
    return keys;
}

/** Starts at +1 on `startFrame` and flips sign on every note. */
export function buildFlipKeys(notes: MidiNote[], startFrame: number): FrameValueKeyframe[] {
    var keys: FrameValueKeyframe[] = [{ frame: startFrame, value: 1 }];
    var value = 1;
    for (var index = 0; index < notes.length; index += 1) {
        value *= -1;
        keys.push({
            frame: notes[index].frame,
            value: value,
        });
    }
    return keys;
}

export function buildControlKeys(
    controlEvents: ControlEvent[],
    defaultValue: number,
    startFrame: number
): FrameValueKeyframe[] {
    var keys: FrameValueKeyframe[] = [{ frame: startFrame, value: defaultValue }];
    controlEvents.sort(function (a, b) {
        return a.frame - b.frame;
    });

    for (var index = 0; index < controlEvents.length; index += 1) {
        keys.push({
            frame: controlEvents[index].frame,
            value: controlEvents[index].value,
        });
    }
    return keys;
}

export function getOutputKeyframes(
    outputId: string,
    timeline: MidiTimeline,
    timing: Timing
): OutputKeyframes | null {
    if (outputId == "timeRemap") {
        return {
            keyframes: buildTimeRemapKeys(timeline.notes),
            interpolationType: KEYFRAME_LINEAR,
        };
    }
    if (outputId == "duration") {
        return {
            keyframes: buildNoteValueKeys(timeline.notes, "durationFrames"),
            interpolationType: KEYFRAME_STEP,
        };
    }
    if (outputId == "velocity") {
        return {
            keyframes: buildNoteValueKeys(timeline.notes, "velocity"),
            interpolationType: KEYFRAME_STEP,
        };
    }
    if (outputId == "pitch") {
        return {
            keyframes: buildNoteValueKeys(timeline.notes, "key"),
            interpolationType: KEYFRAME_STEP,
        };
    }
    if (outputId == "count") {
        return {
            keyframes: buildCountKeys(timeline.notes),
            interpolationType: KEYFRAME_STEP,
        };
    }
    if (outputId == "flip") {
        return {
            keyframes: buildFlipKeys(timeline.notes, timing.startFrame),
            interpolationType: KEYFRAME_STEP,
        };
    }
    if (outputId == "pan") {
        return {
            keyframes: buildControlKeys(
                timeline.controls.pan,
                CONTROL_DEFAULTS.pan,
                timing.startFrame
            ),
            interpolationType: KEYFRAME_STEP,
        };
    }
    if (outputId == "volume") {
        return {
            keyframes: buildControlKeys(
                timeline.controls.volume,
                CONTROL_DEFAULTS.volume,
                timing.startFrame
            ),
            interpolationType: KEYFRAME_STEP,
        };
    }
    if (outputId == "glide") {
        return {
            keyframes: buildControlKeys(
                timeline.controls.glide,
                CONTROL_DEFAULTS.glide,
                timing.startFrame
            ),
            interpolationType: KEYFRAME_STEP,
        };
    }
    return null;
}
