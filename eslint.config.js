// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // `api/` is not app code — those are Vercel serverless functions running on Node, so Node
    // globals like `Buffer` are legitimate there even though the Expo preset assumes a React
    // Native / browser environment. (They were Edge functions, where `Buffer` genuinely doesn't
    // exist; api/og-image-binder.js moved to the Node runtime to re-encode its PNG as JPEG.)
    files: ["api/**/*.js"],
    languageOptions: { globals: { Buffer: "readonly" } },
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
