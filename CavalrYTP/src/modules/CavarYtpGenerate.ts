/// <reference types="@scenery/cavalry-types" />

import { state, uiHandles } from "./appContext.ts";
import { getCompTiming } from "./CavarYtpComp.ts";
import { addValueKeyframes, getOutputKeyframes } from "./CavarYtpKeyframes.ts";
import { createValueLayer, setLayerClipRange } from "./CavarYtpLayers.ts";
import { getEnabledOutputLayerSpecs } from "./CavarYtpOutputs.ts";
import { getFileBaseName } from "./CavarYtpPaths.ts";
import { applyPreCompTimeRemap, getSelectedPreCompReference } from "./CavarYtpPreComp.ts";
import { collectMidiTimeline, getLastGeneratedFrame } from "./CavarYtpTimeline.ts";
import { getSelectedTracks } from "./CavarYtpTracks.ts";

export function generateKeyframes(): void {
    var selectedPreCompReference = getSelectedPreCompReference();
    var selectedTracks = getSelectedTracks();
    if (selectedTracks.length == 0) {
        uiHandles.modal.showMessage("Please select one or more tracks first!");
        return;
    }
    var enabledOutputSpecs = getEnabledOutputLayerSpecs();
    if (enabledOutputSpecs.length == 0) {
        uiHandles.modal.showMessage("Please enable at least one layer to generate.");
        return;
    }

    var timing = getCompTiming();
    if (!timing.compId) {
        uiHandles.modal.showMessage("No active composition found.");
        return;
    }

    var timeline = collectMidiTimeline(selectedTracks, timing);
    if (timeline.notes.length == 0) {
        uiHandles.modal.showMessage("No note events found in the selected tracks.");
        return;
    }

    applyPreCompTimeRemap(selectedPreCompReference, timeline);

    var folderName = `${getFileBaseName(state.selectedMIDIFile ?? "")}.mid Controllers`;
    var folderId = api.create("group", folderName);
    var createdLayers = [folderId];
    var endFrame = getLastGeneratedFrame(timeline);

    // Cavalry inserts new layers above older siblings, so create bottom-to-top.
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
