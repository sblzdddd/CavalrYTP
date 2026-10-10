// Run with: pnpm test
//
// Covers the pure core (timeline, keyframes, track rows, output catalogue); nothing here
// needs a Cavalry stub. The imports point straight at the .ts sources, which Node strips.

import assert from "node:assert/strict";
import { test } from "node:test";

import { writeMidi } from "midi-file";

import { state } from "../src/modules/appContext.ts";
import { decodeBase64 } from "../src/modules/CavarYtpBase64.ts";
import { KEYFRAME_LINEAR, KEYFRAME_STEP } from "../src/modules/CavarYtpConstants.ts";
import { getOutputKeyframes } from "../src/modules/CavarYtpKeyframes.ts";
import { getEventNumber, toNumber } from "../src/modules/CavarYtpNumbers.ts";
import {
    getDefaultOutputOptions,
    getEnabledOutputLayerSpecs,
    hasEnabledOutputLayer,
} from "../src/modules/CavarYtpOutputs.ts";
import { getFileBaseName } from "../src/modules/CavarYtpPaths.ts";
import {
    collectMidiTimeline,
    getControlName,
    getLastGeneratedFrame,
    microsecondsToFrame,
} from "../src/modules/CavarYtpTimeline.ts";
import { parseMidiBytes } from "../src/modules/CavarYtpMidiFile.ts";
import { getTrackRows } from "../src/modules/CavarYtpTracks.ts";

// One MIDI file worth of events, 30fps, one second per 30 frames.
// Track 0: a note, a pan, a note retriggering on the same frame as the first note ending,
// a velocity-0 note on (which is a note off), volume and glide, plus an unsupported
// controller that has to be dropped.
// Track 1: an unnamed track, whose note shares frame 0 with track 0's note.
const MIDI_DATA = {
    trackNames: ["Piano", "Bass"],
    tracks: [
        {
            index: 0,
            name: "Piano",
            events: [
                { type: "noteon", absMicroseconds: 0, data: { key: 60, velocity: 100, channel: 0 } },
                { type: "controlchange", absMicroseconds: 500000, data: { controller: 10, value: 20 } },
                { type: "noteoff", absMicroseconds: 1000000, data: { key: 60, channel: 0 } },
                { type: "noteon", absMicroseconds: 1000000, data: { key: 64, velocity: 80, channel: 0 } },
                { type: "noteoff", absMicroseconds: 2000000, data: { key: 64, channel: 0 } },
                { type: "noteon", absMicroseconds: 2000000, data: { key: 67, velocity: 0, channel: 0 } },
                { type: "controlchange", absMicroseconds: 2500000, data: { controller: 7, value: 90 } },
                { type: "controlchange", absMicroseconds: 3000000, data: { controller: 5, value: 5 } },
                { type: "controlchange", absMicroseconds: 3500000, data: { controller: 99, value: 1 } },
            ],
        },
        {
            index: 1,
            events: [
                { type: "noteon", absMicroseconds: 0, data: { key: 36, velocity: 110, channel: 1 } },
                { type: "noteoff", absMicroseconds: 1500000, data: { key: 36, channel: 1 } },
            ],
        },
    ],
};

const TIMING = { compId: "comp#1", fps: 30, startFrame: 0 };

function buildTimeline() {
    return collectMidiTimeline(MIDI_DATA.tracks, TIMING);
}

test("toNumber falls back only when the value is not numeric", () => {
    assert.equal(toNumber("12", 1), 12);
    assert.equal(toNumber("x", 7), 7);
    assert.equal(toNumber(undefined, 7), 7);
    // Number(null) is 0, so a present-but-null field is not treated as missing here.
    assert.equal(toNumber(null, 7), 0);
});

test("getEventNumber reads a payload field and falls back when it is missing", () => {
    assert.equal(getEventNumber({ data: { key: 3 } }, "key", 9), 3);
    assert.equal(getEventNumber({ data: { key: 3 } }, "velocity", 9), 9);
    assert.equal(getEventNumber({ data: null }, "key", 9), 9);
    assert.equal(getEventNumber(null, "key", 9), 9);
});

test("getFileBaseName keeps the name and drops the directory and the extension", () => {
    assert.equal(getFileBaseName("C:/midi/My Song.mid"), "My Song");
    assert.equal(getFileBaseName("C:\\midi\\My Song.mid"), "My Song");
    assert.equal(getFileBaseName("C:\\midi\\no extension"), "no extension");
    // A leading dot is part of the name, not an extension.
    assert.equal(getFileBaseName("C:/midi/.hidden"), ".hidden");
});

test("microsecondsToFrame converts to the composition frame grid", () => {
    assert.equal(microsecondsToFrame(0, 30, 0), 0);
    assert.equal(microsecondsToFrame(500000, 30, 0), 15);
    assert.equal(microsecondsToFrame(1500000, 24, 10), 46);
});

test("collectMidiTimeline pairs note offs, collapses chords and keeps supported controls", () => {
    const timeline = buildTimeline();

    // The velocity-0 note on at 2s is a note off, so it produces no note, and the frame-0
    // chord across two tracks keeps only the first note in track order.
    assert.deepEqual(timeline.notes, [
        {
            frame: 0,
            trackIndex: 0,
            channel: 0,
            key: 60,
            velocity: 100,
            noteOffFrame: 30,
            durationFrames: 30,
        },
        {
            frame: 30,
            trackIndex: 0,
            channel: 0,
            key: 64,
            velocity: 80,
            noteOffFrame: 60,
            durationFrames: 30,
        },
    ]);

    assert.deepEqual(timeline.controls, {
        pan: [{ frame: 15, value: 20 }],
        volume: [{ frame: 75, value: 90 }],
        glide: [{ frame: 90, value: 5 }],
    });
});

test("a note without a note off runs until the next note", () => {
    const timeline = collectMidiTimeline(
        [
            {
                index: 0,
                events: [
                    { type: "noteon", absMicroseconds: 0, data: { key: 60, velocity: 100, channel: 0 } },
                    { type: "noteon", absMicroseconds: 1500000, data: { key: 62, velocity: 100, channel: 0 } },
                ],
            },
        ],
        TIMING
    );

    assert.equal(timeline.notes.length, 2);
    assert.equal(timeline.notes[0].durationFrames, 45);
    assert.equal(timeline.notes[1].durationFrames, 1);
});

test("getLastGeneratedFrame reaches past the notes to the last control change", () => {
    // The last note ends on frame 60, the last control change lands on frame 90.
    assert.equal(getLastGeneratedFrame(buildTimeline()), 90);
});

test("getOutputKeyframes builds every output layer", () => {
    const timeline = buildTimeline();

    assert.deepEqual(getOutputKeyframes("timeRemap", timeline, TIMING), {
        keyframes: [
            { frame: 0, value: 0 },
            { frame: 29, value: 29 },
            { frame: 30, value: 0 },
            { frame: 60, value: 30 },
        ],
        interpolationType: KEYFRAME_LINEAR,
    });
    assert.deepEqual(getOutputKeyframes("duration", timeline, TIMING), {
        keyframes: [
            { frame: 0, value: 30 },
            { frame: 30, value: 30 },
        ],
        interpolationType: KEYFRAME_STEP,
    });
    assert.deepEqual(getOutputKeyframes("velocity", timeline, TIMING), {
        keyframes: [
            { frame: 0, value: 100 },
            { frame: 30, value: 80 },
        ],
        interpolationType: KEYFRAME_STEP,
    });
    assert.deepEqual(getOutputKeyframes("pitch", timeline, TIMING), {
        keyframes: [
            { frame: 0, value: 60 },
            { frame: 30, value: 64 },
        ],
        interpolationType: KEYFRAME_STEP,
    });
    assert.deepEqual(getOutputKeyframes("count", timeline, TIMING), {
        keyframes: [
            { frame: 0, value: 1 },
            { frame: 30, value: 2 },
        ],
        interpolationType: KEYFRAME_STEP,
    });
    // Flip starts on +1 before the first note and alternates from there, which puts two
    // keys on frame 0 on purpose (one seed, one flip).
    assert.deepEqual(getOutputKeyframes("flip", timeline, TIMING), {
        keyframes: [
            { frame: 0, value: 1 },
            { frame: 0, value: -1 },
            { frame: 30, value: 1 },
        ],
        interpolationType: KEYFRAME_STEP,
    });
    // Controls are seeded with their defaults on the first frame.
    assert.deepEqual(getOutputKeyframes("pan", timeline, TIMING), {
        keyframes: [
            { frame: 0, value: 64 },
            { frame: 15, value: 20 },
        ],
        interpolationType: KEYFRAME_STEP,
    });
    assert.deepEqual(getOutputKeyframes("volume", timeline, TIMING), {
        keyframes: [
            { frame: 0, value: 100 },
            { frame: 75, value: 90 },
        ],
        interpolationType: KEYFRAME_STEP,
    });
    assert.deepEqual(getOutputKeyframes("glide", timeline, TIMING), {
        keyframes: [
            { frame: 0, value: 0 },
            { frame: 90, value: 5 },
        ],
        interpolationType: KEYFRAME_STEP,
    });

    assert.equal(getOutputKeyframes("nope", timeline, TIMING), null);
});

test("the output catalogue drives the checkbox defaults", () => {
    const defaults = getDefaultOutputOptions();
    assert.equal(defaults.timeRemap, true);
    assert.equal(Object.keys(defaults).length, 9);
    assert.equal(
        Object.keys(defaults).filter((id) => defaults[id]).length,
        1
    );

    state.outputOptions = { timeRemap: true, glide: true };
    assert.equal(hasEnabledOutputLayer(), true);
    assert.deepEqual(
        getEnabledOutputLayerSpecs().map((spec) => spec.id),
        ["timeRemap", "glide"]
    );

    state.outputOptions = {};
    assert.equal(hasEnabledOutputLayer(), false);
    assert.deepEqual(getEnabledOutputLayerSpecs(), []);
});

test("getTrackRows labels tracks from the file, the fallback name or the index", () => {
    assert.deepEqual(getTrackRows(MIDI_DATA), [
        { uuid: "track-0", label: "Piano", tooltip: "MIDI track 1" },
        { uuid: "track-1", label: "Bass", tooltip: "MIDI track 2" },
    ]);

    // No name and no trackNames entry falls back to the one-based track number.
    assert.deepEqual(getTrackRows({ tracks: [{ index: 4, events: [] }, { events: [] }] }), [
        { uuid: "track-4", label: "Track 5", tooltip: "MIDI track 5" },
        { uuid: "track-1", label: "Track 2", tooltip: "MIDI track 2" },
    ]);
});

// --- MIDI parsing ---------------------------------------------------------------------------

// 480 ticks per beat and 250000µs per beat, so a quarter note is 250ms and 1920 ticks a second.
// Track 2 carries no notes on purpose: it has to be dropped, controller and name included.
const SMF_TRACKS = [
    [
        { deltaTime: 0, meta: true, type: "trackName", text: "Piano" },
        { deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: 250000 },
        { deltaTime: 0, channel: 0, type: "noteOn", noteNumber: 60, velocity: 100 },
        { deltaTime: 480, channel: 0, type: "controller", controllerType: 10, value: 20 },
        { deltaTime: 480, channel: 0, type: "noteOff", noteNumber: 60, velocity: 0 },
        { deltaTime: 480, channel: 0, type: "noteOn", noteNumber: 64, velocity: 80 },
        { deltaTime: 0, channel: 0, type: "noteOn", noteNumber: 64, velocity: 0 },
    ],
    [
        { deltaTime: 960, channel: 1, type: "noteOn", noteNumber: 36, velocity: 110 },
        { deltaTime: 480, channel: 1, type: "noteOff", noteNumber: 36, velocity: 64 },
    ],
    [
        { deltaTime: 0, meta: true, type: "trackName", text: "Conductor" },
        { deltaTime: 240, channel: 2, type: "controller", controllerType: 7, value: 90 },
    ],
];

function encodeMidiFile(tracks) {
    return new Uint8Array(writeMidi({ header: { format: 1, ticksPerBeat: 480 }, tracks }));
}

function encodeMidiFileAsBase64(tracks) {
    return Buffer.from(encodeMidiFile(tracks)).toString("base64");
}

test("decodeBase64 decodes base64 the way the Cavalry runtime needs it", () => {
    const bytes = encodeMidiFile(SMF_TRACKS);
    const encoded = encodeMidiFileAsBase64(SMF_TRACKS);

    assert.deepEqual(Array.from(decodeBase64(encoded)), Array.from(bytes));
    // api.encodeBinary may wrap the payload or break it up; both still decode.
    assert.deepEqual(
        Array.from(decodeBase64(`data:audio/midi;base64,${encoded}`)),
        Array.from(bytes)
    );
    assert.deepEqual(
        Array.from(decodeBase64(encoded.replace(/(.{64})/g, "$1\n"))),
        Array.from(bytes)
    );
    assert.deepEqual(Array.from(decodeBase64("")), []);
    assert.deepEqual(Array.from(decodeBase64("SGVsbG8=")), [72, 101, 108, 108, 111]);
});

test("parseMidiBytes keeps the playing tracks, names them and converts the ticks", () => {
    const data = parseMidiBytes(decodeBase64(encodeMidiFileAsBase64(SMF_TRACKS)));

    assert.deepEqual(data, {
        trackNames: ["Piano", "Track 2"],
        tracks: [
            {
                index: 0,
                name: "Piano",
                events: [
                    {
                        absMicroseconds: 0,
                        type: "noteon",
                        data: { channel: 0, key: 60, velocity: 100 },
                    },
                    {
                        absMicroseconds: 250000,
                        type: "controlchange",
                        data: { channel: 0, controller: 10, value: 20 },
                    },
                    {
                        absMicroseconds: 500000,
                        type: "noteoff",
                        data: { channel: 0, key: 60, velocity: 0 },
                    },
                    {
                        absMicroseconds: 750000,
                        type: "noteon",
                        data: { channel: 0, key: 64, velocity: 80 },
                    },
                    // A note on with velocity 0 is a note off, so it keeps the same timestamp.
                    {
                        absMicroseconds: 750000,
                        type: "noteoff",
                        data: { channel: 0, key: 64, velocity: 0 },
                    },
                ],
            },
            {
                // The tempo lives in track 0 but applies here too: 960 ticks is 500ms, not a beat.
                index: 1,
                name: "Track 2",
                events: [
                    {
                        absMicroseconds: 500000,
                        type: "noteon",
                        data: { channel: 1, key: 36, velocity: 110 },
                    },
                    {
                        absMicroseconds: 750000,
                        type: "noteoff",
                        data: { channel: 1, key: 36, velocity: 64 },
                    },
                ],
            },
        ],
    });
});

test("parseMidiBytes falls back to 120 BPM without a tempo change", () => {
    const tracks = [[{ deltaTime: 480, channel: 0, type: "noteOn", noteNumber: 60, velocity: 1 }]];
    const data = parseMidiBytes(decodeBase64(encodeMidiFileAsBase64(tracks)));

    // 480 ticks at the default 500000µs per beat is half a second.
    assert.equal(data.tracks[0].events[0].absMicroseconds, 500000);
});

test("parseMidiBytes rejects bytes that are not a MIDI file", () => {
    assert.throws(() => parseMidiBytes(new Uint8Array([0, 1, 2, 3, 0, 0, 0, 0])));
});

test("a parsed file drives the same timeline the JSON dump used to", () => {
    const data = parseMidiBytes(decodeBase64(encodeMidiFileAsBase64(SMF_TRACKS)));
    const timeline = collectMidiTimeline(data.tracks, TIMING);

    // 30fps: 250ms rounds to frame 8, 500ms to frame 15 and 750ms to frame 23.
    assert.deepEqual(timeline.notes, [
        {
            frame: 0,
            trackIndex: 0,
            channel: 0,
            key: 60,
            velocity: 100,
            noteOffFrame: 15,
            durationFrames: 15,
        },
        {
            frame: 15,
            trackIndex: 1,
            channel: 1,
            key: 36,
            velocity: 110,
            noteOffFrame: 23,
            durationFrames: 8,
        },
        {
            frame: 23,
            trackIndex: 0,
            channel: 0,
            key: 64,
            velocity: 80,
            noteOffFrame: 23,
            durationFrames: 1,
        },
    ]);
    assert.deepEqual(timeline.controls, { pan: [{ frame: 8, value: 20 }], volume: [], glide: [] });
});

