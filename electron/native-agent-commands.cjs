function registerNativeAgentCommands({ ipcMain, store, dataWorkspace, native }) {
  function running(event, input) {
    if (!input || typeof input.threadId !== "string" || !input.threadId) throw new Error("A saved conversation is required.");
    store.openWorkspace(dataWorkspace(event, input));
    const thread = store.getResearchThread(input.threadId);
    if (thread.kind === "paper") throw new Error("Native controls are available only in main Work.");
    if (thread.status !== "running") throw new Error("There is no running native turn in this conversation.");
    return thread.id;
  }
  ipcMain.handle("agent:native-steer", (event, input) => {
    const id = running(event, input);
    if (typeof input.text !== "string" || !input.text.trim() || input.text.length > 20_000) throw new Error("Steering requires at most 20000 characters.");
    return native.steerNative(id, input.text.trim());
  });
  ipcMain.handle("agent:native-answer", (event, input) => {
    const id = running(event, input);
    if (typeof input.questionId !== "string" || !input.questionId || input.questionId.length > 200) throw new Error("A native question ID is required.");
    if (!input.answers || typeof input.answers !== "object" || Array.isArray(input.answers) || JSON.stringify(input.answers).length > 20_000) throw new Error("Invalid native answers.");
    return native.answerNativeQuestion(id, input.questionId, input.answers);
  });
}

module.exports = { registerNativeAgentCommands };
