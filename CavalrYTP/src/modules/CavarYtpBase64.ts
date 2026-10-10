/// <reference types="@scenery/cavalry-types" />

// Cavalry's runtime has no `atob`, no `Buffer` and no `Uint8Array.fromBase64`, so the base64
// alphabet is decoded by hand. `api.encodeBinary` returns a plain base64 string, but the
// `data:…;base64,` wrapper and stray line breaks are tolerated as well.

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Maps an ASCII character code to its 6-bit value; anything else stays `undefined`. */
const BASE64_VALUES: number[] = [];

for (var alphabetIndex = 0; alphabetIndex < BASE64_ALPHABET.length; alphabetIndex += 1) {
    BASE64_VALUES[BASE64_ALPHABET.charCodeAt(alphabetIndex)] = alphabetIndex;
}

export function decodeBase64(input: string): Uint8Array {
    var payload = input;
    var separator = payload.indexOf(",");
    if (separator != -1 && payload.slice(0, separator).indexOf("base64") != -1) {
        payload = payload.slice(separator + 1);
    }

    var bytes: number[] = [];
    var chunk = 0;
    var chunkBits = 0;

    for (var index = 0; index < payload.length; index += 1) {
        if (payload.charAt(index) == "=") {
            break;
        }

        var value = BASE64_VALUES[payload.charCodeAt(index)];
        if (value == null) {
            // Whitespace (and anything else outside the alphabet) is skipped.
            continue;
        }

        chunk = (chunk << 6) | value;
        chunkBits += 6;
        if (chunkBits >= 8) {
            chunkBits -= 8;
            bytes.push((chunk >> chunkBits) & 0xff);
            chunk &= (1 << chunkBits) - 1;
        }
    }

    return new Uint8Array(bytes);
}
