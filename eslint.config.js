// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // Reanimated worklets legitimately mutate shared values (`sv.value = ...`) on the UI
    // thread; the React Compiler immutability rule false-positives on this pattern.
    files: [
      "src/components/binder/BinderGrid.tsx",
      "src/components/binder/PageStrip.tsx",
      "src/components/binder/SliceTray.tsx",
    ],
    rules: { "react-hooks/immutability": "off" },
  },
]);
