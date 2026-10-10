/// <reference types="@scenery/cavalry-types" />

import { getCompNumberAttr, getFirstExistingAttribute } from "./CavarYtpComp.ts";
import { KEYFRAME_LINEAR } from "./CavarYtpConstants.ts";
import { addAttributeKeyframes, buildTimeRemapKeys } from "./CavarYtpKeyframes.ts";
import type { FrameValueKeyframe, MidiTimeline } from "./CavarYtpTypes.ts";

export interface PreCompReference {
    layerId: string;
    compId: string;
}

// Cavalry versions differ in which attribute names exist, so both lists are tried in order.
var PRE_COMP_TIME_REMAP_ENABLE_ATTRS = [
    "timeRemapping",
    "timeRemap",
    "enableTimeRemapping",
    "timeRemapping.enabled",
    "timeRemap.enabled",
];

// The percentage-valued attribute.
var PRE_COMP_TIME_REMAP_VALUE_ATTRS = [
    "timeRemapping",
    "timeRemap",
    "timeRemapping.value",
    "timeRemap.value",
];

export function getSelectedPreCompReference(): PreCompReference | null {
    var selection = api.getSelection(true);
    for (var index = 0; index < selection.length; index += 1) {
        var layerId = selection[index];
        try {
            var compId = api.getCompFromReference(layerId);
            if (compId) {
                return {
                    layerId: layerId,
                    compId: compId,
                };
            }
        } catch (error) {
            // Non composition-reference layers throw here.
        }
    }
    return null;
}

export function getReferencedCompFrameCount(preCompInfo: PreCompReference): number {
    var startFrame = getCompNumberAttr(preCompInfo.compId, ["startFrame", "start"], 0);
    // NaN fails every comparison below, exactly like the null it replaced.
    var endFrame = getCompNumberAttr(preCompInfo.compId, ["endFrame", "end"], Number.NaN);
    if (endFrame >= startFrame) {
        return Math.max(1, endFrame - startFrame + 1);
    }

    var refInFrame = api.getInFrame(preCompInfo.layerId);
    var refOutFrame = api.getOutFrame(preCompInfo.layerId);
    if (refOutFrame >= refInFrame) {
        return Math.max(1, refOutFrame - refInFrame + 1);
    }

    return 1;
}

export function tryEnablePreCompTimeRemap(layerId: string): void {
    for (var index = 0; index < PRE_COMP_TIME_REMAP_ENABLE_ATTRS.length; index += 1) {
        try {
            var attrId = PRE_COMP_TIME_REMAP_ENABLE_ATTRS[index];
            api.set(layerId, { [attrId]: true });
        } catch (error) {
            // Keep trying known attribute variants.
        }
    }
}

/** Frame offsets → the percentage the attribute expects. */
export function buildPreCompTimeRemapKeys(
    timeRemapKeys: FrameValueKeyframe[],
    compFrameCount: number
): FrameValueKeyframe[] {
    var percentPerFrame = 100 / compFrameCount;
    var keys: FrameValueKeyframe[] = [];
    for (var index = 0; index < timeRemapKeys.length; index += 1) {
        keys.push({
            frame: timeRemapKeys[index].frame,
            value: timeRemapKeys[index].value * percentPerFrame,
        });
    }
    return keys;
}

export function applyPreCompTimeRemap(
    preCompInfo: PreCompReference | null,
    timeline: MidiTimeline
): void {
    if (!preCompInfo) {
        return;
    }

    tryEnablePreCompTimeRemap(preCompInfo.layerId);

    var attrId = getFirstExistingAttribute(preCompInfo.layerId, PRE_COMP_TIME_REMAP_VALUE_ATTRS);
    if (!attrId) {
        console.warn("CavalrYTP: Selected pre-comp does not expose a known Time Remapping attribute.");
        return;
    }

    var compFrameCount = getReferencedCompFrameCount(preCompInfo);
    var keys = buildPreCompTimeRemapKeys(buildTimeRemapKeys(timeline.notes), compFrameCount);
    addAttributeKeyframes(preCompInfo.layerId, attrId, keys, KEYFRAME_LINEAR);
    console.log(`CavalrYTP: Applied pre-comp time remapping using ${compFrameCount} referenced comp frames.`);
}
