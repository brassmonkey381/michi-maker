# Waiting for the next native build

Things worth doing that we have deliberately **not** done, because each one adds a native module
and so changes the EAS fingerprint. None of them can ship as a JS/OTA push; they all need a new
build of the iOS and Android binaries.

**Why the list exists.** These are cheap changes held back by an expensive step, so they are easy
to forget and easy to do badly one at a time — each would burn its own build. When a native build
is happening anyway, do them together: the marginal cost of the second and third is close to zero.

**How to check before shipping.** A JS-only change leaves the fingerprint alone; adding any of the
packages below does not. Confirm rather than assume:

```
npx @expo/fingerprint .        # before
# ...make the change...
npx @expo/fingerprint .        # after — the hash must be expected to differ here
```

---

## 1. Native image intake — `expo-image-picker`

**The gap.** Everything that reads a file off the device is web-only. On a phone the only way to
bring art in is to paste a URL.

| Where | What happens today |
|---|---|
| `src/components/binder/ArtUploadButton.tsx` | Renders `null` on iOS/Android. The real one is `ArtUploadButton.web.tsx`, a DOM file picker. |
| `src/components/auth/AuthSheet.tsx` (`pickAvatar`) | Same posture — builds an `<input type="file">` imperatively and no-ops off web, so there is no avatar picker on a phone. |

This is the single highest-value item on the list, and it is worse than it looks: michi's whole
premise is slicing your own art across a page, and the Slice Studio is a **touch-first** surface
(pinch-zoom, long-press-to-merge and the snap grid all landed for exactly that reason). Shipping a
studio you can frame with your fingers but cannot get a photo into is a strange shape.

Both call sites want the same thing, so one wrapper serves both. Keep the existing web files as the
`.web.tsx` variants and let the shared file become the native implementation rather than a
placeholder.

Permissions to declare when it lands: photo-library read on both platforms (`NSPhotoLibraryUsageDescription`
in `app.json` → `ios.infoPlist`, and the Android media permission the plugin adds).

## 2. Re-encoding imported art — `expo-image-manipulator`

`src/lib/transcodeArt.ts` is a placeholder that always declines: it re-encodes art the share-image
renderer cannot read, and there is no canvas on native. The caller already stores the original
bytes with a correctly sniffed content type, which is the important half — so this only becomes a
real gap **once native art upload exists**. Do it in the same build as item 1 or not at all.

## 3. Haptics on placement — `expo-haptics`

The one piece of the placement-feel pass (audit tier B) that could not ship. A card dropping into a
pocket is the gesture the whole app exists for, and on a phone it currently lands in silence: the
motion work gave it a spring and a settle, but no tick. A short selection-level tick on a
successful drop, and a heavier one on a refused drop, is most of the remaining difference between
"a value changed" and "an object went in".

Cheap to add, invisible to web, and worth pairing with the invalid-drop feedback noted below.

---

## Not on this list

**Invalid-drop feedback** (the store returns early and silently on an illegal drop, so nothing
shakes) is JS-only and does **not** need a build. It is grouped with haptics in conversation
because they are felt together, but it can ship any time.
