/// <reference types="@scenery/cavalry-types" />

export function createValueLayer(folderId: string, name: string): string {
    var layerId = api.create("value", name);
    api.parent(layerId, folderId);
    return layerId;
}

export function setLayerClipRange(layerIds: string[], startFrame: number, endFrame: number): void {
    for (var index = 0; index < layerIds.length; index += 1) {
        api.setInFrame(layerIds[index], startFrame);
        api.setOutFrame(layerIds[index], endFrame);
    }
}
