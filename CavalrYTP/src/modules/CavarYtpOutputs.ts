/// <reference types="@scenery/cavalry-types" />

import { state } from "./appContext.ts";

export type OutputId =
    | "timeRemap"
    | "duration"
    | "velocity"
    | "pitch"
    | "count"
    | "flip"
    | "pan"
    | "volume"
    | "glide";

export interface OutputLayerSpec {
    id: OutputId;
    label: string;
    defaultEnabled: boolean;
}

var OUTPUT_LAYER_SPECS: OutputLayerSpec[] = [
    { id: "timeRemap", label: "Time Remap", defaultEnabled: true },
    { id: "duration", label: "Duration", defaultEnabled: false },
    { id: "velocity", label: "Velocity", defaultEnabled: false },
    { id: "pitch", label: "Pitch", defaultEnabled: false },
    { id: "count", label: "Count", defaultEnabled: false },
    { id: "flip", label: "Flip", defaultEnabled: false },
    { id: "pan", label: "Channel Pan", defaultEnabled: false },
    { id: "volume", label: "Channel Volume", defaultEnabled: false },
    { id: "glide", label: "Channel Glide", defaultEnabled: false },
];

export function getOutputLayerSpecs(): OutputLayerSpec[] {
    return OUTPUT_LAYER_SPECS;
}

export function getDefaultOutputOptions(): Record<OutputId, boolean> {
    var options = {} as Record<OutputId, boolean>;
    for (var index = 0; index < OUTPUT_LAYER_SPECS.length; index += 1) {
        var spec = OUTPUT_LAYER_SPECS[index];
        options[spec.id] = spec.defaultEnabled;
    }
    return options;
}

export function hasEnabledOutputLayer(): boolean {
    for (var index = 0; index < OUTPUT_LAYER_SPECS.length; index += 1) {
        if (state.outputOptions[OUTPUT_LAYER_SPECS[index].id]) {
            return true;
        }
    }
    return false;
}

export function getEnabledOutputLayerSpecs(): OutputLayerSpec[] {
    var specs: OutputLayerSpec[] = [];
    for (var index = 0; index < OUTPUT_LAYER_SPECS.length; index += 1) {
        var spec = OUTPUT_LAYER_SPECS[index];
        if (state.outputOptions[spec.id]) {
            specs.push(spec);
        }
    }
    return specs;
}
