const { searchCapabilities, readCapability, planDependencies, exportAppCapabilities } = require("./creator-capabilities.cjs");

// Used by native harnesses through their ordinary shell/approval mechanism.
// Read operations never materialize skills or change an Agent's configuration.
if (require.main === module) {
  try {
    const operations = { search: searchCapabilities, read: readCapability, plan: planDependencies, export: exportAppCapabilities };
    const operation = process.argv[2];
    if (!Object.hasOwn(operations, operation)) throw new Error("Use search|read|plan|export followed by one JSON object.");
    const args = JSON.parse(process.argv[3] || "{}");
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Arguments must be a JSON object.");
    console.log(JSON.stringify(operations[operation](args)));
  } catch (error) {
    console.error(JSON.stringify({ error: error.message }));
    process.exitCode = 1;
  }
}
