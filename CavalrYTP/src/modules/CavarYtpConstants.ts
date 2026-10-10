/// <reference types="@scenery/cavalry-types" />

import type { ControlName } from "./CavarYtpTypes.ts";

/** Interpolation ids passed to `api.modifyKeyframe`. */
export const KEYFRAME_LINEAR = 1;
export const KEYFRAME_STEP = 2;

export type InterpolationType = typeof KEYFRAME_LINEAR | typeof KEYFRAME_STEP;

/** Used when the track never sends the control. */
export const CONTROL_DEFAULTS: Record<ControlName, number> = {
    pan: 64,
    volume: 100,
    glide: 0,
};
