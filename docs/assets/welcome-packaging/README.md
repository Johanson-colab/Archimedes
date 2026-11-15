# Packaged welcome image fix

The five welcome images used root-absolute `/welcome/...` URLs, which resolve to `file:///welcome/...` in packaged desktop builds. They now use Vite's deployment base, matching the existing paper-template preview convention.

`before.png` and `after.png` use the same 1400 × 900 requested window size, paper theme, and isolated test profile. The image reports record browser-decoded dimensions, not just file existence. The audit loads each bundle's actual `app.asar` main process, preload and renderer with Electron 43.4.1; both bundle renderers are checked on the arm64 host. This does not establish Intel hardware or x64 main-process compatibility.

- Before: all five images had zero decoded dimensions.
- After, both bundles: hero 1800 × 805; four workflow images 1100 × 733.
- 13 focused welcome/packaging tests passed, including a regression that fails with the original file URLs and also checks a nested web deployment.
- Type checks, theme checks, both architecture builds, both package-structure checks and DMG integrity checks passed.
- The prior full-suite failures and Intel startup limitation reported during initial packaging remain outside this image-path fix.
