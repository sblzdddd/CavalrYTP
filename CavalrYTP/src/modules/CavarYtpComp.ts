/// <reference types="@scenery/cavalry-types" />

import { toNumber } from "./CavarYtpNumbers.ts";
import type { Timing } from "./CavarYtpTypes.ts";

export function getCompNumberAttr(compId: string, attrNames: string[], fallback: number): number {
    for (var index = 0; index < attrNames.length; index += 1) {
        try {
            var value = api.get(compId, attrNames[index]);
            if (value == null) {
                continue;
            }
            var numberValue = toNumber(value, null);
            if (numberValue != null) {
                return numberValue;
            }
        } catch (error) {
            // Attribute names vary between Cavalry versions.
        }
    }
    return fallback;
}

export function getCompTiming(): Timing {
    var activeComp = api.getActiveComp();
    return {
        compId: activeComp,
        fps: getCompNumberAttr(activeComp, ["fps", "frameRate", "framesPerSecond"], 30),
        startFrame: api.getFrame(),
    };
}

export function attributeExists(layerId: string, attrId: string): boolean {
    try {
        api.getAttributeDefinition(layerId, attrId);
        return true;
    } catch (error) {
        return false;
    }
}

export function getFirstExistingAttribute(layerId: string, attrIds: string[]): string | null {
    for (var index = 0; index < attrIds.length; index += 1) {
        if (attributeExists(layerId, attrIds[index])) {
            return attrIds[index];
        }
    }
    return null;
}
