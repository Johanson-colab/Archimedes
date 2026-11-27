# Archimedes macOS 分发与首次使用调研

日期：2026-11-17  
状态：调研完成，未修改产品代码；签名/公证未执行（本机没有 Developer ID 证书）  
范围：macOS 分发（签名、公证、安装包、自动更新）与首次使用成本（workspace、模型、引导）

> **2026-11-17 决策：先不做签名。**  
> 签名、公证、自动更新暂缓；不申请 Apple Developer 账号、不改签名/公证构建配置、不引入 `electron-updater`。第 4 节保留为后续参考。当前优先第 5–6 节的上手成本，以及第 2.4 节的包体问题；未签名阶段的安装说明需要单独修正（macOS 15+ 不能再用右键 → Open）。

## 0. 结论

值得做，但要分成两条线，不能指望“签名包”单独解决上手问题。

1. **发布信任线**：Developer ID 签名 + Apple 公证 + stapled DMG/ZIP + 自动更新。  
   这是 macOS 上对外分发桌面软件的标准做法。它能消掉“未识别开发者/损坏/去系统设置里点仍要打开”的安装阻力，也是自动更新的前置条件。成本是 Apple Developer Program **99 美元/年**，加上大约 **1–2 周**的工程与验证；不需要上 Mac App Store。

2. **首次使用线**：默认数据目录 + 首次启动向导 + 模型配置 + 可选 CLI 探测 + 示例/预检。  
   这条线对“上手难”的改善更直接，而且不依赖 Apple 账号。当前首次启动在没有历史 workspace 时，会把用户 home 目录当成数据 workspace；用户同时面对空白项目、未配置模型和四个欢迎卡片，很容易不知道下一步。

推荐顺序：**并行启动 Apple 账号申请**（等待期最长），工程上先做 notarization spike，再做首次启动向导；签名/公证和自动更新作为发布轨道推进。  
不建议：只做 ad-hoc 签名、上 Mac App Store、先做 universal 包、或把“签名”当成上手的全部答案。

当前 v0.1.0 的事实比预期更差：发布 DMG **完全没有签名**，应用是 linker-signed/ad-hoc，`codesign --verify --deep --strict` 失败，`spctl` 拒绝，且没有公证 ticket。Release note 仍写“macOS 首次启动右键 → Open”，但 macOS 15 起这个绕过方式已经被移除。

---

## 1. 调研方法与边界

做了三类检查：

- 读当前源码与构建配置：`electron-builder.config.cjs`、`electron/main.cjs`、`src/App.tsx`、`package.json`、`shared/latex-engine.json`、`docs/`。
- 审计真实发布物：从 GitHub Releases 下载 `Archimedes-0.1.0-mac-arm64.dmg`，挂载后检查 DMG、`.app`、嵌套二进制、公证 ticket 和体积。
- 对照 Apple 与 electron-builder/Electron 的官方文档，确认签名、公证、自动更新和 Mac App Store 的硬性要求。

没有做：改代码、生成证书、提交公证、发布新 release。原因是没有 Apple Developer 账号和签名身份；本机 `security find-identity -v -p codesigning` 返回 **0 valid identities**。因此“签名后能否通过公证”仍需要一次真实 spike 验证，尤其是 Tectonic 归档。

---

## 2. 当前发布链路事实

### 2.1 构建配置

`electron-builder.config.cjs` 当前：

- `mac.target: ["dmg"]`，只出 DMG，没有 ZIP。
- `publish: null`，没有更新源，也没有 `latest-mac.yml`。
- 没有 `mac.identity`、`hardenedRuntime`、`entitlements`、`notarize`、`forceCodeSigning`。
- `dmg.sign` 未设置，electron-builder 默认为 `false`。
- `appId: com.archimedes.research`，`artifactName` 含版本/OS/arch，命名本身没问题。
- 打包包含 `scripts/**/*` 和全部生产依赖；`asarUnpack` 包含 `node-pty/**/*`、`@napi-rs/**/*`。
- `extraResources` 把 `.archimedes/latex-package/${os}-${arch}` 复制为 `Resources/latex-engine`，里面是 `engine.tar.gz`。

`package.json` 的发布脚本只有：

```text
package:desktop  -> electron-builder --dir --publish never
dist:mac         -> electron-builder --mac dmg --publish never
```

`dist:mac` 没有指定 `--arm64`/`--x64`，默认只构建当前主机架构。v0.1.0 同时发布了 arm64 和 x64 两个 DMG，说明当时是分别构建或用了额外参数；当前脚本本身不能一次产出双架构。

### 2.2 v0.1.0 的真实签名状态

对下载的 `Archimedes-0.1.0-mac-arm64.dmg`（318,654,530 bytes，约 304 MiB）检查：

| 检查 | 结果 |
| --- | --- |
| DMG `codesign -dv` | `code object is not signed at all` |
| DMG `spctl -a -t open --context context:primary-signature` | `rejected`，`no usable signature` |
| `.app` 主可执行文件 | `Identifier=Electron`，`flags=adhoc,linker-signed`，`Signature=adhoc` |
| `.app` `codesign --verify --deep --strict` | 失败：`code has no resources but signature indicates they must be present` |
| `.app` `spctl -a -vv` | 拒绝 |
| `stapler validate` | `does not have a ticket stapled to it` |
| 公证 ticket | 无 |
| `.app` 体积 | 911 MB |
| `app.asar` | 370 MB |
| `app.asar.unpacked` | 225 MB |
| 未签名 Mach-O | `node-pty/prebuilds/darwin-x64/pty.node`、`darwin-x64/spawn-helper` |
| Tectonic（`latex-engine/engine.tar.gz` 内） | ad-hoc/linker-signed，`spctl` rejected |

这说明当前产物不是“已 ad-hoc 签名、只差公证”，而是**应用 bundle 本身没有有效签名**。Gatekeeper 可能把它报成“无法验证开发者”，也可能报成“已损坏”；无论哪种，都不是正常的 macOS 安装体验。

Release note 原文（v0.1.0）：

> Builds are unsigned. Windows shows a SmartScreen warning; macOS requires right-click → Open on first launch.

macOS 15 Sequoia 起，Control-click 绕过 Gatekeeper 的方式已被移除，用户必须去 **System Settings → Privacy & Security** 里逐次允许。也就是说，release note 的指引在当前 macOS 上已经过时。

### 2.3 更新与 CI

- 没有 `.github/workflows`。发布是本地构建后手动上传，签名证书和公证凭据没有 CI 隔离。
- `package.json` 没有 `electron-updater`；`publish: null`。
- `docs/sidebar-footer.md` 明确写：“This app currently has no application updater/detector.” 侧栏的 Update 按钮只在未来某个 updater 发出 `archimedes:update-available` 时显示；当前主进程没有发送者，按钮退化为打开 GitHub Releases 页面。
- 因此用户升级路径是：自己发现新版本 → 打开浏览器 → 重新下载 304 MB DMG → 手动替换。对非技术用户来说，这一步很容易断。

### 2.4 体积

v0.1.0 的 911 MB 应用里，`app.asar.unpacked` 225 MB。本机当前工作树包含 #355 对 `onnxruntime-node` 的排除，本地打包降到 757 MB；`app.asar` 仍约 371 MB，`app.asar.unpacked` 约 70 MB。也就是说，v0.1.0 的 225 MB 里有一部分是已经被 #355 处理的历史包袱，但主 asar 仍然很大。

`app.asar` 里可见的主要大项（未压缩）：

- `onnxruntime-web` 的 WASM：`dist/assets` 与 `node_modules/onnxruntime-web/dist` 各有一份，单文件 13–27 MB，合计约 130 MB 级重复。
- `@napi-rs/canvas`：约 25 MB。
- `@img/sharp-libvips`：约 17 MB。
- `@rolldown/binding`：约 16 MB；`lightningcss`：约 8 MB。它们来自生产依赖里的 `vite` / `@vitejs/plugin-react`，不是运行时必需。
- `pdfjs-dist`、`lucide-react` 的 source map / 类型文件，以及 `jsdom` 的部分开发文件。`jsdom` 本身被主进程的 `conferences.cjs` / `remote-content.cjs` 使用，不能直接删。

这会影响两件事：用户下载时间，以及公证上传/等待时间。签名前先做一轮包体审计，性价比很高。

---

## 3. 为什么现在的安装体验会卡

把用户路径按顺序拆开：

1. **下载**：304 MB DMG。对网络一般的用户已经是一次明显等待。
2. **打开 DMG**：DMG 本身无签名，`spctl` 拒绝。
3. **拖进 Applications**：可以拖，但第一次启动会被 Gatekeeper 拦。
4. **首次启动**：应用签名无效；用户可能看到“无法验证开发者”或“已损坏”。Release note 说的右键 → Open 在 macOS 15+ 不再可用。
5. **进入应用**：没有首次启动向导；如果之前没有 `last-workspace.json`，会把 home 当 workspace（见第 5 节）。
6. **配置模型**：需要自己找到 Settings → Models，填 provider、base URL、model、API key，且没有在欢迎页引导。
7. **升级**：没有应用内更新，只能手动重复下载。

签名/公证能解决第 2–4 步，自动更新能解决第 7 步；第 5–6 步需要产品侧的首次使用设计。两者不是替代关系。

另外，`docs/app-icons.md` 已经写明“未签名的本地 icon-audit 构建不应作为生产发布”，但 v0.1.0 仍以未签名形式发布。这说明发布门禁本身也缺一条：没有 `forceCodeSigning`，也没有 CI 检查，构建可以“成功”地产出不可分发的包。

---

## 4. 签名/公证方案

### 4.1 概念澄清

“签名包”在 macOS 上通常包含三件事，缺一不可：

- **Code signing**：用 Developer ID Application 证书签 `.app` 及其嵌套代码，带 secure timestamp。
- **Hardened Runtime**：签名时加 `--options runtime`，并按需声明 entitlements。
- **Notarization + stapling**：把签名后的产物提交 Apple notary service；通过后把 ticket staple 到 `.app` 和 DMG 上，离线也能验证。

只做 codesign 不做公证，Gatekeeper 仍会拦；只做 ad-hoc 签名，连“开发者身份”都没有。Apple 公证不是 App Review，不检查 UI/商业模式，只做自动化安全扫描和签名校验。

安装包形态：

- **DMG**：macOS 最常见的拖拽安装方式，适合普通用户。不是严格意义的“安装器”，但体验最自然。
- **ZIP**：自动更新需要；也是部分用户的分发方式。
- **PKG**：真正的 Installer.app 向导，需要 Developer ID Installer 证书；适合企业/受管部署、需要 preinstall/postinstall 的场景。对单一 `.app` 不是必需。
- **Mac App Store**：另一套分发体系，需要 App Sandbox 和 App Review；不适合当前应用（见 4.6）。

### 4.2 方案对比

| 方案 | 安装体验 | 成本 | 主要风险 | 结论 |
| --- | --- | --- | --- | --- |
| 继续未签名 | 差；Gatekeeper 拦截，可能报损坏 | 0 | 支持成本高、信任感差 | 不继续 |
| 只做 ad-hoc 签名 | 仍会被 Gatekeeper 拦 | 0 | 需要用户手动绕过；macOS 15+ 更麻烦 | 不够 |
| Developer ID + 公证 + DMG | 好；首次打开只需系统确认“从互联网下载” | 99 美元/年 + 1–2 周 | 嵌套代码/公证被拒；证书管理 | **推荐** |
| 公证 + PKG | 好，但多一层 Installer 向导 | 99 美元/年 + Installer 证书 | 需要管理员权限；对普通用户更重 | 企业需求再考虑 |
| Mac App Store | 最好，但受沙箱限制 | 99 美元/年 + 审核 | 终端/子进程/下载资源大概率不合规 | 不做 |
| Homebrew Cask | 对开发者友好 | 0（在公证之后） | 只覆盖 brew 用户 | 可作为补充渠道 |

### 4.3 推荐方案

**Developer ID Application 签名 + Hardened Runtime + Apple 公证 + stapled DMG/ZIP + GitHub Releases + electron-updater。**

理由：

- 直接分发是开发者工具/研究软件的主流路径；不需要为了“签名”进 App Store。
- DMG 对普通用户最自然；ZIP 给自动更新用；两者可以同时发布。
- GitHub Releases 是现成渠道；公开仓库的 GitHub Actions 标准 macOS runner 免费。
- electron-updater 与 electron-builder 集成最好，支持 GitHub provider 和差分下载；但 macOS 自动更新要求应用已签名（Squirrel.Mac 的硬性要求）。

### 4.4 实施蓝图（后续实施时）

构建配置层面，大致需要：

```js
// electron-builder.config.cjs（示意，不是本次改动）
mac: {
  target: [
    { target: "dmg", arch: ["arm64", "x64"] },
    { target: "zip", arch: ["arm64", "x64"] }, // 自动更新需要
  ],
  hardenedRuntime: true,
  gatekeeperAssess: false,
  entitlements: "electron/assets/entitlements.mac.plist",
  entitlementsInherit: "electron/assets/entitlements.mac.inherit.plist",
  notarize: true,
  forceCodeSigning: true, // 没有证书就失败，防止再发未签名包
},
publish: { provider: "github", owner: "Johanson-colab", repo: "Archimedes" },
```

注意：electron-builder 内置的 `mac.notarize` 主要作用于 `.app`；DMG 本身通常还要在 `afterAllArtifactBuild` 或发布脚本里单独 `notarytool submit` + `stapler staple`。`dmg.sign` 建议先保持默认的 `false`，electron-builder 自己也提示 DMG 签名与公证组合可能带来额外错误；先用“app 公证 + DMG 公证/staple”跑通，再决定是否签 DMG。

entitlements 起步可以用 electron-builder 默认模板的组合：

- `com.apple.security.cs.allow-jit`（Electron/V8）
- `com.apple.security.cs.allow-unsigned-executable-memory`（V8/WASM 兼容）
- `com.apple.security.cs.disable-library-validation`（原生模块/Electron 框架；先保证能跑，再评估收紧）

同时确认：

- 不要带 `com.apple.security.get-task-allow`。
- `NSMicrophoneUsageDescription` 已经存在，保留。
- `codesign -d --entitlements :-` 检查 XML/ASCII、无 BOM。
- 每个嵌套 Mach-O（`.node`、`spawn-helper`、Tectonic）都签了，且带 hardened runtime + timestamp。

CI 层面：

- 用 macOS runner 构建；公开仓库的标准 runner 免费（macOS 3-core/4-core，14 GB 磁盘）。
- 证书用 `CSC_LINK`（base64 .p12）+ `CSC_KEY_PASSWORD`；公证用 `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID`，或 App Store Connect API key（`APPLE_API_KEY`/`APPLE_API_KEY_ID`/`APPLE_API_ISSUER`）。
- 证书和 API key 放 GitHub Secrets，绑定 protected `release` environment；不要进仓库、不要进构建产物。
- tag 触发；构建 arm64 和 x64；上传 DMG、ZIP、`latest-mac.yml`、`.blockmap`；创建 draft release，人工确认后发布。
- CI 里不要只看“构建成功”：`forceCodeSigning` 只能防止未签名，不能保证公证通过；必须再断言 `codesign --verify --deep --strict`、`spctl` 接受、`stapler validate` 通过，否则 release job 失败。
- 注意多架构的 `latest-mac.yml`：不要让 arm64 和 x64 两个 job 互相覆盖。可以在同一个 job 里顺序构建两个架构，或在最后做一步合并元数据。

公证/验收命令：

```sh
codesign --verify --deep --strict --verbose=2 Archimedes.app
spctl -a -vv Archimedes.app
xcrun stapler validate Archimedes.app

xcrun notarytool submit Archimedes.dmg --keychain-profile "AC" --wait
xcrun stapler staple Archimedes.dmg
xcrun stapler validate Archimedes.dmg
spctl -a -t open --context context:primary-signature -v Archimedes.dmg
```

验收环境：

- 全新 macOS 用户账号（没有缓存/没有开发者工具）。
- 从浏览器下载（带 quarantine），双击挂载、拖入 Applications、首次启动。
- 断网后再启动一次，确认 stapled ticket 生效。
- 麦克风等 TCC 权限按预期提示。
- 终端、PDF、LaTeX 编译、模型请求各跑一次。
- 记录 macOS 版本、架构、DMG SHA256、公证 submission id。

### 4.5 签名特有的工程风险

这是本调研最重要的部分：Archimedes 不是“改个配置就能签”的普通 Electron 应用。

**风险 1：Tectonic 归档里的 ad-hoc 二进制**

`Resources/latex-engine/engine.tar.gz` 里的 `tectonic` 是 upstream 的 ad-hoc/linker-signed 二进制，`spctl` 直接拒绝。当前 `shared/latex-engine.json` 同时校验 archive SHA256 和 executable SHA256；重新签名会改变这两个值。

可选路径：

- 构建时解包 → 用 Developer ID 重签 Tectonic（hardened runtime + timestamp）→ 重新打包 → 更新派生 hash/manifest。供应链从“上游字节”变成“上游字节 + 本地签名”，需要明确记录。
- 或者把 Tectonic 作为单独的已签名 helper 放进 bundle，不再塞进 tar.gz；但仍要处理 hash 校验和更新。
- 或者不在 bundle 里带 Tectonic，首次使用时下载；下载的二进制同样需要可信来源和校验，且离线首次编译会失败。

Apple notary 会扫描 bundle 里的可执行内容；归档里的未签名 Mach-O 是**高风险**，必须在真实 notary 日志里验证。不要在没有 spike 的情况下承诺“签名一周搞定”。

**风险 2：node-pty 的跨架构 prebuild**

v0.1.0 的 arm64 应用里带了 `node-pty/prebuilds/darwin-x64/pty.node` 和 `spawn-helper`，两者未签名；同时还有 `win32-arm64`/`win32-x64` 的 `.node`。公证会检查 Mach-O；跨架构/跨平台二进制至少是噪声，也可能是拒绝点。

建议：

- 每个架构只带自己的 prebuild；mac 包排除 win32 prebuild。
- 确保 `@electron/osx-sign` 覆盖 `spawn-helper` 和所有 `.node`；用 `codesign --deep --strict` 和 notary log 双重确认。
- 不要用 `--deep` 给整个 app 签名来“糊过去”；嵌套代码要由内向外签。

**风险 3：体积与公证上传**

304 MB DMG / 911 MB app 的公证上传和 Apple 扫描都需要时间；CI 上还要装 Electron、Node 模块、双架构产物。14 GB 磁盘的 runner 可能紧张。先在本地把包体降下来，再上 CI，会省很多重试。

**风险 4：证书归属与续期**

Apple Developer Program 是 **99 美元/年**。个人账号可以签，但证书和团队绑定在个人身上，项目换维护者会有 bus factor。组织账号更稳，但通常需要 D-U-N-S（免费申请，周期通常 1–2 周）。建议项目层面明确：谁持有账号、谁有 Admin、证书如何备份、每年谁续费。

**风险 5：自动更新的迁移**

macOS 自动更新要求应用已签名。现有 v0.1.0 未签名，**不能自动更新到 signed 版本**；用户必须手动安装一次新的签名 DMG。Release note/官网要写清楚“这一次需要手动安装，之后可以自动更新”。不要假设老用户能无缝升级。

**风险 6：entitlements 与原生模块**

`@napi-rs/canvas`、`sharp`、`node-pty` 都是原生模块；hardened runtime 下如果库校验/内存权限不对，应用可能启动崩溃。先用较宽的 entitlements 保证功能，再逐项收紧；每次收紧都跑终端、PDF、FigureForge、LaTeX、模型请求的回归。

### 4.6 不建议的路线

- **Mac App Store**：需要 App Sandbox；应用要启动用户 shell、执行命令、读写任意 workspace、下载 Tectonic/模型资源。Apple 指南 2.4.5(i) 要求沙箱，2.4.5(iv) 限制下载/安装独立代码，2.5.2 限制执行下载的代码。被拒风险高，且即使通过也要维护一套独立构建。当前阶段不值得。
- **只做 ad-hoc 签名**：`codesign` 能过，Gatekeeper 仍拦；对用户没有实质改善。
- **只签名不公证**：macOS 10.15+ 下载的软件仍需公证；只签名不够。
- **先做 universal 包**：会让本来 304 MB 的 DMG 更大；当前双架构分开发布更合理。等自动更新/CI 稳定后再评估 universal。
- **PKG 优先**：Installer 向导对普通用户更重，还要多一张 Developer ID Installer 证书；没有企业部署需求时不必先做。

---

## 5. 上手成本现状

### 5.1 首次启动的真实代码路径

这是调研中比签名更意外的发现。

1. `electron/main.cjs` 的 `startupWorkspace()`：如果没有 `last-workspace.json`，生产环境返回 `null`。
2. `createWindow(startupWorkspace())`：`workspace` 为 null 时，不会给窗口设置 workspace。
3. 渲染进程 `src/App.tsx`：

   ```ts
   desktopBridge.getInitialWorkspace().then((initialWorkspace) =>
     loadWorkspace(initialWorkspace ?? DEFAULT_WORKSPACE)
   );
   ```

   `DEFAULT_WORKSPACE` 在打包环境是空字符串，所以实际调用 `loadWorkspace("")`。
4. `electron/main.cjs` 的 `resolveWorkspace("")`：

   ```js
   if (!expanded) return fs.realpathSync(app.getPath("home"));
   ```

   也就是**返回用户 home 目录**。
5. `workspace:open` 随后 `rememberWorkspace(home)`，把 home 写进 `last-workspace.json`；`watchWorkspace(home, { recursive: true })` 开始递归监听整个 home。
6. `store.openWorkspace(home)` 会在 home 下创建 `.archimedes/archimedes.db`。

结果：一个全新安装、没有任何配置的用户，第一次启动就把整个 home 当成研究 workspace，侧栏没有项目，欢迎页出现，模型未配置。用户并没有被明确告知“你的 home 被选为数据目录”，也不会意识到之后每次启动都会回到这里。

这可能是有意的 fallback，也可能是开发期便利逻辑漏到了生产；无论意图如何，对首次使用都不理想：

- home 里可能有大量文件，文件树/监听/索引都不合适。
- `.archimedes` 出现在 home 根目录，不显眼也不符合“项目数据”心智。
- 用户以为应用“没有设置”，但实际上已经绑定了一个很大的目录。
- 如果用户之后换目录，旧数据/旧项目还在 home 下，容易混乱。

### 5.2 模型与工具配置

- 聊天需要 API key；`electron/model-config.cjs` 在没有 key 时返回 `hasApiKey: false`。Composer 会显示一条提示：“Configure an API model to send research messages. Local files, PDF reading and data analysis remain available.” 但提示在聊天区，不在欢迎页；用户要先进入聊天才能看到。
- 模型设置界面（`ModelSettingsModal`）已经有 provider 列表、模型目录刷新、测试连接；能力是够的，问题是**入口深、没有首次引导**。
- 模型 key 存在 `model-config.json`，文件权限 `0600`，但内容是明文 JSON，没有用 macOS Keychain/`safeStorage`。0600 能挡住其他用户，挡不住同一用户下的其他进程；对一款要用户信任的签名应用，这是一个明显的信任缺口。
- 原生 CLI（Codex/Claude Code/OpenCode）在 `electron/agent-backend-config.cjs` 里有配置能力，但没有首次启动探测/推荐。对已经有 CLI 订阅的用户，本来可以少配一个 API key。
- Web search（Brave 等）是可选；没有首次引导，也不阻塞本地文件/PDF。
- LaTeX 使用托管 Tectonic 0.17.0；应用自带 `engine.tar.gz`，但首次编译可能还要下载 TeX bundle（`shared/latex-engine.json` 的 `bundleUrl`）。离线/弱网首次编译会失败，当前没有预检提示。
- FigureForge 默认关闭，首次使用还要下载模型权重；不属于首次启动主路径，但会增加“为什么点了没反应”的困惑。

### 5.3 其他上手摩擦

| 摩擦 | 现状 | 影响 |
| --- | --- | --- |
| 首次启动无向导 | 只有 4 张欢迎卡片；没有“先做什么”的步骤 | 用户不知道先建项目、配模型还是选目录 |
| workspace 概念 | “数据目录/项目/workspace/会话”四层概念，UI 没有解释 | 新用户容易把项目文件夹和数据目录混在一起 |
| 默认语言 | `readLanguage()` 只读 localStorage，默认 `en` | 中文用户首次进入是英文，需要自己找设置 |
| 更新 | 无 updater；侧栏按钮只打开 Releases | 用户要手动发现和重装 |
| 诊断 | About 有 build info，但没有“复制诊断”/日志入口 | 出问题时支持成本高 |
| 示例内容 | 没有 demo 项目/示例论文 | 欢迎卡片点进去常是空状态 |
| 安装信任 | 未签名/未公证 | 第一道门就流失 |

---

## 6. 上手成本改进方案

按“用户第一次打开到第一次获得价值”的顺序排：

### P0：首次启动向导 + 默认数据目录

目标：全新用户 2 分钟内进入一个可用状态，不再把 home 当 workspace。

建议流程：

1. **选择数据目录**  
   默认 `~/Documents/Archimedes`（自动创建），说明“项目、论文、笔记、数据库都放这里；默认不上云；之后可在 Settings 改”。提供“选择其他文件夹”。  
   如果用户选 home，给出明确警告：“这会把整个 home 作为 workspace，可能很大；建议选专用文件夹。”

2. **配置模型（可跳过）**  
   Provider 卡片 + API key + “Test connection” + 模型下拉（复用现有 `listProviderModels`/`testModelConfig`）。  
   明确写“没有 key 也可以先看本地文件/PDF；聊天和 agent 需要模型”。  
   加一个“使用已安装的 CLI”入口，探测 Codex/Claude Code/OpenCode。

3. **可选工具**  
   Web search key、语言（默认跟随系统或让用户选）、终端/LaTeX 状态。  
   LaTeX 显示“已内置，首次编译可能需要下载资源”；FigureForge 保持 off by default，不放进首次启动。

4. **完成页**  
   创建第一个项目（默认放在数据目录下），或“先看看示例项目”。  
   欢迎页的四个卡片保留，但加一句“需要模型/需要项目”的状态提示；不要点了以后才报错。

验收标准：

- 全新用户、无 `last-workspace.json`、无 `model-config.json`：启动出现向导，不出现 home 文件树。
- 选择默认目录后，`~/Documents/Archimedes/.archimedes/archimedes.db` 创建；重启恢复该目录。
- 跳过模型：能打开 PDF/本地文件；发消息时给出明确“配置模型”入口。
- 已有用户：不出现向导，行为不变。
- 向导可跳过、可再次运行（Settings → “Run setup again”）。

### P1：模型配置与 key 存储

- 把 `model-config.json` 的 API key 改为 `safeStorage.encryptString`（macOS 下走 Keychain），保留非敏感字段明文；迁移旧文件，迁移后删除明文 key。
- 设置页显示“key 存在 macOS Keychain”，并提供“Replace/Remove”。
- 首次向导里复用现有测试连接，不要另写一套 provider 逻辑。
- 原生 CLI 探测：`which codex`/`which claude`/`which opencode` + 版本/登录状态；显示“已检测到，使用现有订阅”选项。注意权限模式和可执行路径校验，沿用 `agent-backend-config.cjs` 的约束。

### P2：首次价值与支持

- **示例项目**：一个可删除的 demo，含一篇公开论文/一段笔记/一个已完成的对话，展示“问题 → 证据 → 写作”的闭环。不要自动塞进用户真实项目。
- **预检面板**：模型、搜索、LaTeX、终端、磁盘/目录权限、版本/更新通道；每项给“修复”入口。
- **诊断导出**：About 里加“Copy diagnostics”，包含 build info、平台/架构、配置状态（不含 key）、最近日志路径。
- **语言**：首次启动跟随 `navigator.language`（`zh*` → 中文），或把语言选择放进向导；已有用户保留 localStorage 选择。
- **更新提示**：签名 + 自动更新落地后，侧栏 Update 接真实事件；显示下载进度/重启按钮。

### 不建议的“onboarding”做法

- 一上来让用户读长文档/看视频；研究工具的用户更愿意直接试。
- 自动创建大量示例项目/文件；会污染真实 workspace。
- 把模型 key 设为强制；本地文件/PDF 是低门槛价值，应允许先体验。
- 用“引导”掩盖错误；每个空状态还是要有明确的下一步。

---

## 7. 路线图与工作量

两条线可以并行，但发布线有外部等待（Apple 账号），应尽早启动。

| 阶段 | 内容 | 预估 | 依赖 |
| --- | --- | --- | --- |
| D0 | Apple Developer Program 报名/证书/公证凭据 | 个人 1–2 天；组织 1–2 周 | 账号、付费、D-U-N-S（组织） |
| D1 | 签名 + hardened runtime + entitlements + 公证 + staple；真实 notary 日志 | 3–5 天 | D0 |
| D2 | 嵌套代码 spike：Tectonic 重签/重打包、node-pty 跨架构清理 | 1–3 天，未知 | D1 的 notary 日志 |
| D3 | CI release workflow（双架构、secrets、draft release、校验和） | 2–3 天 | D1/D2 |
| D4 | electron-updater + ZIP + `latest-mac.yml` + 更新 UI + 老版本迁移说明 | 2–3 天 | D1/D3 |
| O1 | 首次启动向导 + 默认数据目录 | 3–5 天 | 无（可先做） |
| O2 | 模型设置复用 + Keychain + CLI 探测 | 2–3 天 | O1 |
| O3 | 示例项目/预检/诊断/语言 | 2–4 天 | O1 |
| P1 | 包体审计：vite 移到 devDeps、fonts/source maps、ORT 重复、跨平台 prebuild | 1–3 天 | 无 |
| P2 | 发布规范：LICENSE/隐私政策、版本/变更日志、证书续期 runbook | 1–2 天 | D0 |

总体：一个工程师大约 **2–4 周**（不含 Apple 组织账号等待）；签名线在账号就绪后约 **1–2 周**。如果只做“签名 + 公证 + 手动更新”，可以压到 **3–5 天 + 账号等待**；自动更新和首次向导是额外的。

建议拆分（每项一个 issue/PR，按仓库 AGENTS.md 先拿 UI/依赖/发布变更的批准）：

1. `build(macos): sign, harden, and notarize the app`
2. `fix(macos): sign bundled Tectonic and native helpers`
3. `ci(release): build signed arm64/x64 artifacts on tag`
4. `feat(release): auto-update with electron-updater`
5. `feat(onboarding): first-run workspace and model setup`
6. `feat(settings): store model credentials with safeStorage`
7. `perf(package): trim production dependencies and cross-arch binaries`
8. `feat(about): diagnostics export and update channel`

---

## 8. 需要用户决定的问题

1. **Apple 账号归属**：个人账号还是组织账号？如果是组织，是否已有 D-U-N-S/主体信息？谁持有 Admin、谁负责每年续费？这决定 D0 的时间。
2. **99 美元/年是否接受**：如果短期只给内部/演示使用，可以先不做签名；如果要给外部研究者下载，建议做。
3. **优先级**：先做“签名/公证 + 手动更新”，还是“首次启动向导”？我建议并行：账号申请先启动，工程先做 O1（不依赖账号），同时准备 D1。
4. **是否要自动更新**：它会引入 `electron-updater` 依赖、ZIP 产物和发布流程变化，但能显著降低升级流失。若暂时不想加依赖，可以先做签名 DMG + 手动更新。
5. **发布渠道**：继续 GitHub Releases，还是加官网下载页/Homebrew Cask？自动更新用 GitHub provider 最省事。
6. **是否允许调整依赖/打包**：`vite` 从 `dependencies` 移到 `devDependencies`、排除跨平台 prebuild、可能排除重复 ORT WASM；这些需要仓库的依赖/构建变更批准。
7. **是否要 Mac App Store**：我的建议是不要；如果坚持，需要单独评估沙箱化和功能删减。

---

## 9. 证据与来源

### 9.1 本地检查命令与关键结果

```sh
# 发布物
gh release download v0.1.0 --repo Johanson-colab/Archimedes \
  --pattern 'Archimedes-0.1.0-mac-arm64.dmg'
hdiutil attach -nobrowse -readonly Archimedes-0.1.0-mac-arm64.dmg

codesign -dv --verbose=4 /Volumes/Archimedes\ 0.1.0-arm64/Archimedes.app
# Identifier=Electron; flags=0x20002(adhoc,linker-signed); Signature=adhoc

codesign --verify --deep --strict --verbose=2 /Volumes/.../Archimedes.app
# code has no resources but signature indicates they must be present

spctl -a -vv /Volumes/.../Archimedes.app
# rejected

xcrun stapler validate /Volumes/.../Archimedes.app
# does not have a ticket stapled to it

codesign -dv --verbose=4 Archimedes-0.1.0-mac-arm64.dmg
# code object is not signed at all

spctl -a -t open --context context:primary-signature -v Archimedes-0.1.0-mac-arm64.dmg
# rejected; source=no usable signature
```

```sh
# 本机签名身份
security find-identity -v -p codesigning
# 0 valid identities found

# 工具链
xcrun notarytool --version
# 1.1.4 (43)
```

体积：

```text
v0.1.0 app: 911 MB
v0.1.0 app.asar: 370 MB
v0.1.0 app.asar.unpacked: 225 MB
v0.1.0 DMG: 318,654,530 bytes (~304 MiB)

current main local package (post #355): 757 MB
current main app.asar: 371 MB
current main app.asar.unpacked: 70 MB
```

未签名嵌套 Mach-O（v0.1.0）：

```text
Resources/app.asar.unpacked/node_modules/node-pty/prebuilds/darwin-x64/pty.node
Resources/app.asar.unpacked/node_modules/node-pty/prebuilds/darwin-x64/spawn-helper
```

Tectonic（v0.1.0 的 `Resources/latex-engine/engine.tar.gz`）：

```text
Identifier=tectonic-85dd05953467e990
flags=0x20002(adhoc,linker-signed)
Signature=adhoc
TeamIdentifier=not set
spctl: rejected
```

### 9.2 代码位置

- `electron-builder.config.cjs`：`mac.target`、`asarUnpack`、`extraResources`、`publish: null`。
- `electron/main.cjs`：
  - `startupWorkspace()`（无历史 workspace 返回 null）
  - `resolveWorkspace("")`（返回 `app.getPath("home")`）
  - `workspace:open`（`rememberWorkspace` + `watchWorkspace` + `store.openWorkspace`）
  - `createWindow`（无 workspace 时不设置窗口 workspace）
- `src/App.tsx`：
  - 初始 `getInitialWorkspace().then((initialWorkspace) => loadWorkspace(initialWorkspace ?? DEFAULT_WORKSPACE))`
  - `loadWorkspace` 的 `openWorkspace`/错误处理
  - 欢迎页 `ResearchWelcome` 与 `openWelcomeWorkflow`
  - `modelSetupHint`（composer 内的模型提示）
- `src/i18n.tsx`：`readLanguage()` 默认 `en`。
- `electron/model-config.cjs`：`fs.writeFileSync(configPath, ..., { mode: 0o600 })`，API key 明文。
- `docs/sidebar-footer.md`：明确当前没有 application updater/detector。
- `docs/app-icons.md`：写明 signing/notarization 未配置，未签名本地构建不应作为生产发布。
- `README.md`：v0.1.0 构建未签名；安装说明。
- `shared/latex-engine.json` + `electron/managed-latex-engine.cjs`：archive/executable SHA256 校验；重签 Tectonic 会改变 hash。

### 9.3 外部资料

- Apple Developer Program（99 美元/年）：https://developer.apple.com/programs/
- Apple 公证说明：https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution
- Apple 公证常见问题：https://developer.apple.com/documentation/security/resolving-common-notarization-issues
- electron-builder macOS 公证：https://www.electron.build/docs/features/code-signing/notarization/
- Electron autoUpdater（macOS 必须签名）：https://www.electronjs.org/docs/latest/api/auto-updater
- electron-builder auto-update：https://www.electron.build/auto-update
- Mac App Store Review Guidelines（2.4.5、2.5.2）：https://developer.apple.com/app-store/review/guidelines/
- macOS 15 Gatekeeper 变化（Control-click 绕过移除）：https://arstechnica.com/gadgets/2024/08/macos-15-sequoia-makes-you-jump-through-more-hoops-to-disable-gatekeeper-app-checks/
- GitHub Actions runner 定价（公开仓库标准 runner 免费）：https://docs.github.com/en/billing/reference/actions-runner-pricing
- GitHub Actions 公开仓库免费说明：https://docs.github.com/en/actions/concepts/billing-and-usage

---

## 10. 一句话版本

**签名/公证值得做，而且 Archimedes 当前的发布物确实需要它；但“上手难”的主因还有首次启动把 home 当 workspace、没有配置向导、模型 key 入口太深。建议把 Apple 账号申请和首次启动向导并行推进，先做 notarization spike 验证 Tectonic/node-pty，再上 CI 和自动更新。**
