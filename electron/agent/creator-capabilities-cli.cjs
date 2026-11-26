const { searchCapabilities, readCapability, planDependencies, exportAppCapabilities } = require("./creator-capabilities.cjs");

// Used by native harnesses through their ordinary shell/approval mechanism.
// Read operations never materialize skills or change an Agent's configuration.
if (require.main === module) {
  (async () => {
    const operations = { search: searchCapabilities, read: readCapability, plan: planDependencies, export: exportAppCapabilities, build: ({ workspace, appId }) => require('../research-app-frontend.cjs').createFrontend({ approve: async () => true }).build(workspace, appId), scaffold: require('../research-app-scaffold.cjs').scaffoldApp, status: ({ workspace, appId }) => require('../research-app-delivery-store.cjs').deliveryStatus(require('../research-app-runtime.cjs').readApp(workspace, appId)), checkpoint: ({ workspace, appId }) => ({ fingerprint: require('../research-app-delivery-store.cjs').snapshot(require('../research-app-runtime.cjs').readApp(workspace, appId)) }), verify: require('../research-app-verify.cjs').verifyApp };
    const operation = process.argv[2];
    if (!Object.hasOwn(operations, operation)) throw new Error("Use search|read|plan|export|scaffold|build|status|checkpoint|verify followed by one JSON object.");
    const args = JSON.parse(process.argv[3] || "{}");
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Arguments must be a JSON object.");
    const result = await operations[operation](args);
    console.log(JSON.stringify(result));
    if (operation === 'verify' && !result.passed) process.exitCode = 1;
  })().catch((error) => {
    console.error(JSON.stringify({ error: error.message }));
    process.exitCode = 1;
  });
}
