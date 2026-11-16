const path = require("node:path");
const { writeBuildInfo } = require("./build-info.cjs");
module.exports = async context => {
  writeBuildInfo(context.packager.projectDir);
  await require(path.join(__dirname, "prepare-latex-engine.cjs"))(context);
};
