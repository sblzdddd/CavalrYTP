/// <reference path="c:/Users/LC-022/.cursor/extensions/scenery.cavalry-bridge-0.7.0/node_modules/@scenery/cavalry-types/types/script.d.ts"/>

var KEYFRAME_LINEAR = 1;
var KEYFRAME_STEP = 2;
var CONTROL_DEFAULTS = {
    pan: 64,
    volume: 100,
    glide: 0,
};
var OUTPUT_LAYER_SPECS = [
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
var PRE_COMP_TIME_REMAP_ENABLE_ATTRS = [
    "timeRemapping",
    "timeRemap",
    "enableTimeRemapping",
    "timeRemapping.enabled",
    "timeRemap.enabled",
];
var PRE_COMP_TIME_REMAP_VALUE_ATTRS = [
    "timeRemapping",
    "timeRemap",
    "timeRemapping.value",
    "timeRemap.value",
];

function getOutputLayerSpecs() {
    return OUTPUT_LAYER_SPECS;
}

function getDefaultOutputOptions() {
    var options = {};
    for (var index = 0; index < OUTPUT_LAYER_SPECS.length; index += 1) {
        var spec = OUTPUT_LAYER_SPECS[index];
        options[spec.id] = spec.defaultEnabled;
    }
    return options;
}

function hasEnabledOutputLayer() {
    for (var index = 0; index < OUTPUT_LAYER_SPECS.length; index += 1) {
        if (state.outputOptions[OUTPUT_LAYER_SPECS[index].id]) {
            return true;
        }
    }
    return false;
}

function getDefaultOpenPath() {
    var basePath = api.getProjectPath();
    if (!basePath) {
        console.log("CavalrYTP: No project path found, using scene folder instead!");
        basePath = api.getFolderFromPath(api.getSceneFilePath());
    }
    if (!basePath) {
        console.warn("CavalrYTP: No scene folder found, using home folder instead!");
        basePath = api.getHomeFolder();
    }
    return basePath;
}

function convertMIDIFile(filePath) {
    if (!api.filePathExists(filePath)) {
        modal.showMessage("MIDI file not found: " + filePath);
        return null;
    }

    var converterPath = `${ui.scriptLocation}/CavalrYTP_assets/CMC${api.getPlatform() == "Windows" ? ".exe" : ""}`;
    var res = api.runProcess(converterPath, [api.toNativeFilePath(filePath)]);
    if (res.error) {
        modal.showMessage("Failed to convert MIDI file: " + res.error);
        return null;
    }

    var output = JSON.parse(res.output);
    if (output.status != "success" || !api.filePathExists(output.destination)) {
        modal.showMessage("Failed to convert MIDI file: " + output.error);
        return null;
    }

    return JSON.parse(api.readFromFile(output.destination));
}

function makeTrackLabel(track, fallbackName, rowIndex) {
    var trackNumber = typeof track.index == "number" ? track.index + 1 : rowIndex + 1;
    if (track.name) {
        return track.name;
    }
    if (fallbackName) {
        return fallbackName;
    }
    return "Track " + trackNumber;
}

function getTrackRows(midiData) {
    var rows = [];
    var tracks = midiData && midiData.tracks ? midiData.tracks : [];
    var trackNames = midiData && midiData.trackNames ? midiData.trackNames : [];

    for (var index = 0; index < tracks.length; index += 1) {
        var track = tracks[index];
        var trackId = typeof track.index == "number" ? track.index : index;
        var trackNumber = typeof track.index == "number" ? track.index + 1 : index + 1;
        rows.push({
            uuid: "track-" + trackId,
            label: makeTrackLabel(track, trackNames[index], index),
            tooltip: "MIDI track " + trackNumber,
        });
    }

    return rows;
}

function updateSubmitButton() {
    submitButton.setEnabled(
        state.selectedMIDIFile != null &&
        state.midiFile != null &&
        state.selectedTrackUUIDs.length > 0 &&
        hasEnabledOutputLayer()
    );
}

function clearLoadedMIDI() {
    state.midiFile = null;
    state.selectedTrackUUIDs = [];
    trackList.setModel([]);
    trackList.setEnabled(false);
    updateSubmitButton();
}

function loadMIDIFile(filePath) {
    state.selectedMIDIFile = filePath;
    deleteButton.setEnabled(true);
    clearLoadedMIDI();

    var midiData = convertMIDIFile(filePath);
    if (!midiData) {
        return;
    }

    var trackRows = getTrackRows(midiData);
    state.midiFile = midiData;
    trackList.setModel(trackRows);
    trackList.setEnabled(trackRows.length > 0);
    updateSubmitButton();
}

function getSelectedTracks() {
    var selected = {};
    var selectedTracks = [];
    for (var index = 0; index < state.selectedTrackUUIDs.length; index += 1) {
        selected[state.selectedTrackUUIDs[index]] = true;
    }

    for (var trackIndex = 0; trackIndex < state.midiFile.tracks.length; trackIndex += 1) {
        var track = state.midiFile.tracks[trackIndex];
        var trackId = typeof track.index == "number" ? track.index : trackIndex;
        if (selected["track-" + trackId]) {
            selectedTracks.push(track);
        }
    }

    return selectedTracks;
}

function toNumber(value, fallback) {
    var numberValue = Number(value);
    return isNaN(numberValue) ? fallback : numberValue;
}

function getEventNumber(event, key, fallback) {
    if (!event || !event.data || event.data[key] == null) {
        return fallback;
    }
    return toNumber(event.data[key], fallback);
}

function getCompNumberAttr(compId, attrNames, fallback) {
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
            // Attribute names vary between Cavalry versions, so try the next known name.
        }
    }
    return fallback;
}

function getCompTiming() {
    var activeComp = api.getActiveComp();
    return {
        compId: activeComp,
        fps: getCompNumberAttr(activeComp, ["fps", "frameRate", "framesPerSecond"], 30),
        startFrame: api.getFrame(),
    };
}

function attributeExists(layerId, attrId) {
    try {
        api.getAttributeDefinition(layerId, attrId);
        return true;
    } catch (error) {
        return false;
    }
}

function getFirstExistingAttribute(layerId, attrIds) {
    for (var index = 0; index < attrIds.length; index += 1) {
        if (attributeExists(layerId, attrIds[index])) {
            return attrIds[index];
        }
    }
    return null;
}

function getSelectedPreCompReference() {
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

function getReferencedCompFrameCount(preCompInfo) {
    var startFrame = getCompNumberAttr(preCompInfo.compId, ["startFrame", "start"], 0);
    var endFrame = getCompNumberAttr(preCompInfo.compId, ["endFrame", "end"], null);
    if (endFrame != null && endFrame >= startFrame) {
        return Math.max(1, endFrame - startFrame + 1);
    }

    var refInFrame = api.getInFrame(preCompInfo.layerId);
    var refOutFrame = api.getOutFrame(preCompInfo.layerId);
    if (refOutFrame >= refInFrame) {
        return Math.max(1, refOutFrame - refInFrame + 1);
    }

    return 1;
}

function tryEnablePreCompTimeRemap(layerId) {
    for (var index = 0; index < PRE_COMP_TIME_REMAP_ENABLE_ATTRS.length; index += 1) {
        try {
            var attrId = PRE_COMP_TIME_REMAP_ENABLE_ATTRS[index];
            api.set(layerId, { [attrId]: true });
        } catch (error) {
            // Keep trying known attribute variants.
        }
    }
}

function buildPreCompTimeRemapKeys(timeRemapKeys, compFrameCount) {
    var percentPerFrame = 100 / compFrameCount;
    var keys = [];
    for (var index = 0; index < timeRemapKeys.length; index += 1) {
        keys.push({
            frame: timeRemapKeys[index].frame,
            value: timeRemapKeys[index].value * percentPerFrame,
        });
    }
    return keys;
}

function applyPreCompTimeRemap(preCompInfo, timeline) {
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
    console.log(
        "CavalrYTP: Applied pre-comp time remapping using " +
            compFrameCount +
            " referenced comp frames."
    );
}

function microsecondsToFrame(absMicroseconds, fps, startFrame) {
    return startFrame + Math.round((absMicroseconds / 1000000) * fps);
}

function eventSort(a, b) {
    if (a.frame != b.frame) {
        return a.frame - b.frame;
    }
    if (a.trackIndex != b.trackIndex) {
        return a.trackIndex - b.trackIndex;
    }
    return a.key - b.key;
}

function getControlName(event) {
    var controller = getEventNumber(event, "controller", -1);
    if (controller == 10) {
        return "pan";
    }
    if (controller == 7) {
        return "volume";
    }
    if (controller == 5) {
        return "glide";
    }
    return null;
}

function collectMidiTimeline(tracks, timing) {
    var rawNotes = [];
    var controls = {
        pan: [],
        volume: [],
        glide: [],
    };

    for (var trackIndex = 0; trackIndex < tracks.length; trackIndex += 1) {
        var track = tracks[trackIndex];
        var activeNotes = {};
        var events = track.events || [];

        for (var eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
            var event = events[eventIndex];
            var frame = microsecondsToFrame(event.absMicroseconds, timing.fps, timing.startFrame);

            if (event.type == "noteon" && getEventNumber(event, "velocity", 0) > 0) {
                var noteKey = getEventNumber(event, "key", 0);
                var channel = getEventNumber(event, "channel", 0);
                var activeKey = channel + ":" + noteKey;
                var note = {
                    frame: frame,
                    trackIndex: typeof track.index == "number" ? track.index : trackIndex,
                    channel: channel,
                    key: noteKey,
                    velocity: getEventNumber(event, "velocity", 0),
                    noteOffFrame: null,
                    durationFrames: 1,
                };

                if (!activeNotes[activeKey]) {
                    activeNotes[activeKey] = [];
                }
                activeNotes[activeKey].push(note);
                rawNotes.push(note);
            } else if (event.type == "noteoff") {
                var offKey = getEventNumber(event, "key", 0);
                var offChannel = getEventNumber(event, "channel", 0);
                var offActiveKey = offChannel + ":" + offKey;
                if (activeNotes[offActiveKey] && activeNotes[offActiveKey].length > 0) {
                    activeNotes[offActiveKey].shift().noteOffFrame = frame;
                }
            } else if (event.type == "controlchange") {
                var controlName = getControlName(event);
                if (controlName) {
                    controls[controlName].push({
                        frame: frame,
                        value: getEventNumber(event, "value", CONTROL_DEFAULTS[controlName]),
                    });
                }
            }
        }
    }

    rawNotes.sort(eventSort);

    var notes = [];
    var seenNoteFrames = {};
    for (var rawIndex = 0; rawIndex < rawNotes.length; rawIndex += 1) {
        var rawNote = rawNotes[rawIndex];
        if (seenNoteFrames[rawNote.frame]) {
            continue;
        }
        seenNoteFrames[rawNote.frame] = true;
        notes.push(rawNote);
    }

    for (var noteIndex = 0; noteIndex < notes.length; noteIndex += 1) {
        var currentNote = notes[noteIndex];
        var nextNote = notes[noteIndex + 1];
        var fallbackEndFrame = nextNote ? nextNote.frame : currentNote.frame + 1;
        var noteEndFrame = currentNote.noteOffFrame != null ? currentNote.noteOffFrame : fallbackEndFrame;
        currentNote.durationFrames = Math.max(1, noteEndFrame - currentNote.frame);
    }

    return {
        notes: notes,
        controls: controls,
    };
}

function getFileBaseName(filePath) {
    var parts = filePath.replace(/\\/g, "/").split("/");
    var fileName = parts[parts.length - 1] || "MIDI";
    var dotIndex = fileName.lastIndexOf(".");
    return dotIndex > 0 ? fileName.substring(0, dotIndex) : fileName;
}

function createValueLayer(folderId, name) {
    var layerId = api.create("value", name);
    api.parent(layerId, folderId);
    return layerId;
}

function addAttributeKeyframes(layerId, attrId, keyframes, interpolationType) {
    var byFrame = {};
    var frames = [];

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

function addValueKeyframes(layerId, keyframes, interpolationType) {
    addAttributeKeyframes(layerId, "value", keyframes, interpolationType);
}

function getLastGeneratedFrame(timeline) {
    var lastFrame = 0;
    for (var noteIndex = 0; noteIndex < timeline.notes.length; noteIndex += 1) {
        var note = timeline.notes[noteIndex];
        lastFrame = Math.max(lastFrame, note.frame + note.durationFrames);
    }

    for (var controlName in timeline.controls) {
        var controlEvents = timeline.controls[controlName];
        for (var controlIndex = 0; controlIndex < controlEvents.length; controlIndex += 1) {
            lastFrame = Math.max(lastFrame, controlEvents[controlIndex].frame);
        }
    }

    return lastFrame;
}

function setLayerClipRange(layerIds, startFrame, endFrame) {
    for (var index = 0; index < layerIds.length; index += 1) {
        api.setInFrame(layerIds[index], startFrame);
        api.setOutFrame(layerIds[index], endFrame);
    }
}

function buildTimeRemapKeys(notes) {
    var keys = [];
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

function buildNoteValueKeys(notes, propertyName) {
    var keys = [];
    for (var index = 0; index < notes.length; index += 1) {
        keys.push({
            frame: notes[index].frame,
            value: notes[index][propertyName],
        });
    }
    return keys;
}

function buildCountKeys(notes) {
    var keys = [];
    for (var index = 0; index < notes.length; index += 1) {
        keys.push({
            frame: notes[index].frame,
            value: index + 1,
        });
    }
    return keys;
}

function buildFlipKeys(notes, startFrame) {
    var keys = [{ frame: startFrame, value: 1 }];
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

function buildControlKeys(controlEvents, defaultValue, startFrame) {
    var keys = [{ frame: startFrame, value: defaultValue }];
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

function getOutputKeyframes(outputId, timeline, timing) {
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
            keyframes: buildControlKeys(timeline.controls.pan, CONTROL_DEFAULTS.pan, timing.startFrame),
            interpolationType: KEYFRAME_STEP,
        };
    }
    if (outputId == "volume") {
        return {
            keyframes: buildControlKeys(timeline.controls.volume, CONTROL_DEFAULTS.volume, timing.startFrame),
            interpolationType: KEYFRAME_STEP,
        };
    }
    if (outputId == "glide") {
        return {
            keyframes: buildControlKeys(timeline.controls.glide, CONTROL_DEFAULTS.glide, timing.startFrame),
            interpolationType: KEYFRAME_STEP,
        };
    }
    return null;
}

function getEnabledOutputLayerSpecs() {
    var specs = [];
    for (var index = 0; index < OUTPUT_LAYER_SPECS.length; index += 1) {
        var spec = OUTPUT_LAYER_SPECS[index];
        if (state.outputOptions[spec.id]) {
            specs.push(spec);
        }
    }
    return specs;
}

function generateKeyframes() {
    var selectedPreCompReference = getSelectedPreCompReference();
    var selectedTracks = getSelectedTracks();
    if (selectedTracks.length == 0) {
        modal.showMessage("Please select one or more tracks first!");
        return;
    }
    var enabledOutputSpecs = getEnabledOutputLayerSpecs();
    if (enabledOutputSpecs.length == 0) {
        modal.showMessage("Please enable at least one layer to generate.");
        return;
    }

    var timing = getCompTiming();
    if (!timing.compId) {
        modal.showMessage("No active composition found.");
        return;
    }

    var timeline = collectMidiTimeline(selectedTracks, timing);
    if (timeline.notes.length == 0) {
        modal.showMessage("No note events found in the selected tracks.");
        return;
    }

    applyPreCompTimeRemap(selectedPreCompReference, timeline);

    var folderName = `${getFileBaseName(state.selectedMIDIFile)}.mid Controllers`;
    var folderId = api.create("group", folderName);
    var createdLayers = [folderId];
    var endFrame = getLastGeneratedFrame(timeline);

    // Cavalry inserts newly parented layers above older siblings, so create bottom-to-top.
    for (var index = enabledOutputSpecs.length - 1; index >= 0; index -= 1) {
        var spec = enabledOutputSpecs[index];
        var layerId = createValueLayer(folderId, spec.label);
        var outputKeyframes = getOutputKeyframes(spec.id, timeline, timing);
        if (outputKeyframes) {
            addValueKeyframes(layerId, outputKeyframes.keyframes, outputKeyframes.interpolationType);
        }
        createdLayers.push(layerId);
    }

    setLayerClipRange(createdLayers, timing.startFrame, endFrame);
    api.select(createdLayers);
    console.log("CavalrYTP: Generated " + timeline.notes.length + " MIDI notes at " + timing.fps + "fps.");
}
