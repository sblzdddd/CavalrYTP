/// <reference types="@scenery/cavalry-types" />

export function getDefaultOpenPath(): string {
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

export function getFileBaseName(filePath: string): string {
    var parts = filePath.replace(/\\/g, "/").split("/");
    var fileName = parts[parts.length - 1] || "MIDI";
    var dotIndex = fileName.lastIndexOf(".");
    return dotIndex > 0 ? fileName.substring(0, dotIndex) : fileName;
}
