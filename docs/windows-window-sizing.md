# Initial window sizing on Windows

Electron display work areas are already expressed in device-independent pixels.
The initial window uses the display nearest the pointer, is centered in its work
area, and reserves 16 DIP for native borders and fractional-DPI rounding. Initial
and minimum sizes shrink on small work areas instead of imposing 1560x980 and
1100x720 windows. No extra multiplication by display scale is applied.

The policy tests cover large, 1280x680, 960x500, and negative-origin work areas:

~~~powershell
node --test electron/window-bounds.test.cjs
~~~

## Before and after

Both captures show the same new-task state, Paper theme, English and 100% UI
scale inside the same 1280x680 capture region. The test supplies an Electron work
area of 1280x680 DIP without changing system DPI. The initial renderer is
1560x980 before and 1264x664 after: its size is the behavior under test, so the
capture region stays fixed rather than resizing the old window to hide clipping.
The before capture loses the composer below the work area; the after capture
keeps it visible. This does not claim a physical multi-monitor or RDP DPI test.

### Before

![Before](assets/windows-window-sizing/before.png)

### After

![After](assets/windows-window-sizing/after.png)
