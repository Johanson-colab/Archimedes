function registerLibraryReads(ipcMain, store) {
  ipcMain.handle("library:list", (_event, input = {}) => store.listLibraries(input.projectId ?? null));

  ipcMain.handle("library:list-projects", () => store.listLibraryProjects());

  ipcMain.handle("library:list-papers", (_event, { libraryId, query = "" }) => {
    if (typeof libraryId !== "string" || typeof query !== "string" || query.length > 300) {
      throw new Error("A library ID and a short search query are required.");
    }
    return store.listPapers(libraryId, query);
  });

  ipcMain.handle("library:get-bibliography", (_event, { paperId }) => store.getPaperBibliography(paperId));
}

module.exports = { registerLibraryReads };
