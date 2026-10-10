/// <reference types="@scenery/cavalry-types" />

import type { MidiEventData } from "./CavarYtpTypes.ts";

export function toNumber(value: unknown, fallback: number | null): number | null {
    var numberValue = Number(value);
    return isNaN(numberValue) ? fallback : numberValue;
}

export function getEventNumber(
    event: MidiEventData | null | undefined,
    key: string,
    fallback: number
): number {
    if (!event || !event.data || event.data[key] == null) {
        return fallback;
    }
    // Present fields are always numeric, so the fallback never triggers here.
    return toNumber(event.data[key], fallback) ?? fallback;
}
