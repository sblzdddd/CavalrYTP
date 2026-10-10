/// <reference types="@scenery/cavalry-types" />

import { state, uiHandles } from "./modules/appContext.ts";
import { generateKeyframes } from "./modules/CavarYtpGenerate.ts";
import {
    getDefaultOutputOptions,
    getOutputLayerSpecs,
    hasEnabledOutputLayer,
} from "./modules/CavarYtpOutputs.ts";
import type { OutputLayerSpec } from "./modules/CavarYtpOutputs.ts";
import { getDefaultOpenPath } from "./modules/CavarYtpPaths.ts";
import { clearLoadedMIDI, loadMIDIFile, updateSubmitButton } from "./modules/CavarYtpUi.ts";

ui.setTitle("CavalrYTP");
ui.setMinimumWidth(300);
ui.setMinimumHeight(320);
ui.setMargins(4, 4, 4, 4);

uiHandles.modal = new ui.Modal();
state.outputOptions = getDefaultOutputOptions();

var midiFileLabel = new ui.Label("MIDI File:");
var importFilePath = new ui.FilePath();
importFilePath.setReadOnly(true);
importFilePath.setMode("OpenFile");
importFilePath.setFilter("MIDI File (*.mid)");
importFilePath.setOpenLocation(getDefaultOpenPath());
importFilePath.onValueChanged = function () {
    var path = importFilePath.getFilePath();
    if (path && api.filePathExists(path)) {
        loadMIDIFile(path);
        return;
    }

    state.selectedMIDIFile = null;
    uiHandles.deleteButton.setEnabled(false);
    clearLoadedMIDI();
};

uiHandles.deleteButton = new ui.ImageButton(`${api.getAppAssetsPath()}/icons/palette_clearPalette@2x.png`);
uiHandles.deleteButton.setFixedWidth(21);
uiHandles.deleteButton.setFixedHeight(21);
uiHandles.deleteButton.setEnabled(false);
uiHandles.deleteButton.onClick = function () {
    state.selectedMIDIFile = null;
    uiHandles.deleteButton.setEnabled(false);
    clearLoadedMIDI();
    importFilePath.setFilePath("");
};

var importLayout = new ui.HLayout();
importLayout.add(midiFileLabel);
importLayout.addSpacing(4);
importLayout.setMargins(0, 0, 0, 0);
importLayout.add(importFilePath);
importLayout.add(uiHandles.deleteButton);

var trackListLabel = new ui.Label("Tracks to import: (Ctrl/Shift to select multiple)");
uiHandles.trackList = new ui.List();
uiHandles.trackList.showSearchBar(false);
uiHandles.trackList.setSelectionMode("extended");
uiHandles.trackList.setRowsRenamable(false);
uiHandles.trackList.setRowsDeletable(false);
uiHandles.trackList.setRowsReorderable(false);
uiHandles.trackList.setPlaceholder("Load a MIDI file to select tracks");
uiHandles.trackList.setMinimumHeight(160);
uiHandles.trackList.setEnabled(false);
// cavalry-types declares this as `() => void`, but Cavalry passes the selected row uuids.
uiHandles.trackList.onSelectionChanged = ((selectedUUIDs: string[]) => {
    state.selectedTrackUUIDs = selectedUUIDs;
    updateSubmitButton();
}) as () => void;

function createOutputOptionRow(spec: OutputLayerSpec): ui.HLayout {
    var row = new ui.HLayout();
    var checkbox = new ui.Checkbox(state.outputOptions[spec.id] ?? false);
    var label = new ui.Label(spec.label);

    checkbox.onValueChanged = function () {
        state.outputOptions[spec.id] = checkbox.getValue();
        updateSubmitButton();
    };

    row.setMargins(0, 0, 0, 0);
    row.add(checkbox);
    row.addSpacing(4);
    row.add(label);
    row.addStretch();
    return row;
}

var outputOptionsLabel = new ui.Label("Layers to generate:");
var outputOptionsLayout = new ui.VLayout();
outputOptionsLayout.setMargins(0, 0, 0, 0);

var outputLayerSpecs = getOutputLayerSpecs();
for (var outputIndex = 0; outputIndex < outputLayerSpecs.length; outputIndex += 1) {
    outputOptionsLayout.add(createOutputOptionRow(outputLayerSpecs[outputIndex]));
}

uiHandles.submitButton = new ui.Button("Generate");
uiHandles.submitButton.setEnabled(false);
uiHandles.submitButton.onClick = function () {
    if (!state.selectedMIDIFile) {
        uiHandles.modal.showMessage("Please select a MIDI file first!");
        return;
    }
    if (state.selectedTrackUUIDs.length == 0) {
        uiHandles.modal.showMessage("Please select one or more tracks first!");
        return;
    }
    if (!hasEnabledOutputLayer()) {
        uiHandles.modal.showMessage("Please enable at least one layer to generate.");
        return;
    }

    generateKeyframes();
};

ui.addSpacing(4);
ui.add(importLayout);
ui.addSpacing(8);
ui.add(trackListLabel);
ui.add(uiHandles.trackList);
ui.addSpacing(8);
ui.add(outputOptionsLabel);
ui.add(outputOptionsLayout);
ui.add(uiHandles.submitButton);
ui.show();
