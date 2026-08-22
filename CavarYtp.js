/// <reference path="c:/Users/LC-022/.cursor/extensions/scenery.cavalry-bridge-0.7.0/node_modules/@scenery/cavalry-types/types/script.d.ts"/>

ui.setTitle("CavalrYTP");
ui.setMinimumWidth(300);
ui.setMinimumHeight(320);
ui.setMargins(4, 4, 4, 4);

var modal = new ui.Modal();
var state = {
    selectedMIDIFile: null,
    midiFile: null,
    selectedTrackUUIDs: [],
    outputOptions: {},
};

api.load(ui.scriptLocation + "/CavalrYTP_assets/CavarYtpCore.js");
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
    deleteButton.setEnabled(false);
    clearLoadedMIDI();
};

var deleteButton = new ui.ImageButton(`${api.getAppAssetsPath()}/icons/palette_clearPalette@2x.png`);
deleteButton.setFixedWidth(21);
deleteButton.setFixedHeight(21);
deleteButton.setEnabled(false);
deleteButton.onClick = function () {
    state.selectedMIDIFile = null;
    deleteButton.setEnabled(false);
    clearLoadedMIDI();
    importFilePath.setFilePath("");
};

var importLayout = new ui.HLayout();
importLayout.add(midiFileLabel);
importLayout.addSpacing(4);
importLayout.setMargins(0, 0, 0, 0);
importLayout.add(importFilePath);
importLayout.add(deleteButton);

var trackListLabel = new ui.Label("Tracks to import: (Ctrl/Shift to select multiple)");
var trackList = new ui.List();
trackList.showSearchBar(false);
trackList.setSelectionMode("extended");
trackList.setRowsRenamable(false);
trackList.setRowsDeletable(false);
trackList.setRowsReorderable(false);
trackList.setPlaceholder("Load a MIDI file to select tracks");
trackList.setMinimumHeight(160);
trackList.setEnabled(false);
trackList.onSelectionChanged = function (selectedUUIDs) {
    state.selectedTrackUUIDs = selectedUUIDs;
    updateSubmitButton();
};

function createOutputOptionRow(spec) {
    var row = new ui.HLayout();
    var checkbox = new ui.Checkbox(state.outputOptions[spec.id]);
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

var outputOptionsScrollView = new ui.ScrollView();
outputOptionsScrollView.setFixedHeight(120);
outputOptionsScrollView.setLayout(outputOptionsLayout);

var submitButton = new ui.Button("Generate");
submitButton.setEnabled(false);
submitButton.onClick = function () {
    if (!state.selectedMIDIFile) {
        modal.showMessage("Please select a MIDI file first!");
        return;
    }
    if (state.selectedTrackUUIDs.length == 0) {
        modal.showMessage("Please select one or more tracks first!");
        return;
    }
    if (!hasEnabledOutputLayer()) {
        modal.showMessage("Please enable at least one layer to generate.");
        return;
    }

    generateKeyframes();
};

ui.addSpacing(4);
ui.add(importLayout);
ui.addSpacing(8);
ui.add(trackListLabel);
ui.add(trackList);
ui.addSpacing(8);
ui.add(outputOptionsLabel);
ui.add(outputOptionsScrollView);
ui.add(submitButton);
ui.show();
