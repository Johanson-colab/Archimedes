module.exports = {
  appId: "com.archimedes.research",
  productName: "Archimedes",
  executableName: "Archimedes",
  artifactName: "${productName}-${version}-${os}-${arch}.${ext}",
  directories: { output: "release", buildResources: "electron/assets" },
  asar: true,
  beforePack: "./scripts/prepare-latex-engine.cjs",
  npmRebuild: true,
  files: [
    "dist/**/*", "electron/**/*", "shared/**/*", "server/**/*", "scripts/**/*", "package.json",
    "!electron/**/*.test.cjs", "!electron/figure-forge-upstream-*.mjs", "!server/**/*.test.cjs",
    "!**/.env", "!**/.env.*", "!**/*.log",
  ],
  asarUnpack: ["node_modules/**/*.node", "node_modules/node-pty/**/*", "node_modules/@napi-rs/**/*"],
  extraResources: [{
    from: "electron/assets",
    to: "icons",
    filter: ["app-icon.ico", "app-icon.icns", "app-icon-256.png", "app-icon-1024.png"],
  }, {
    from: ".archimedes/latex-package/${os}-${arch}",
    to: "latex-engine",
  }],
  win: {
    icon: "electron/assets/app-icon.ico",
    target: [{ target: "nsis", arch: ["x64"] }],
    signAndEditExecutable: true,
  },
  nsis: {
    installerIcon: "electron/assets/app-icon.ico",
    uninstallerIcon: "electron/assets/app-icon.ico",
    installerHeaderIcon: "electron/assets/app-icon.ico",
    shortcutName: "Archimedes",
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    deleteAppDataOnUninstall: false,
  },
  mac: {
    icon: "electron/assets/app-icon.icns",
    target: ["dmg"],
    category: "public.app-category.productivity",
  },
  dmg: {
    icon: "electron/assets/app-icon.icns",
    contents: [{ x: 130, y: 220 }, { x: 410, y: 220, type: "link", path: "/Applications" }],
  },
  publish: null,
};
