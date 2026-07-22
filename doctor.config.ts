import { defineConfig } from "react-doctor/api";

export default defineConfig({
  ignore: {
    files: ["components/graph/**", "bin/**", "scripts/**", ".github/**"],
  },
  rules: {
    // Sigma graph canvas — intentional effect/callback patterns; large refactor risk.
    "react-doctor/exhaustive-deps": "off",
    "react-doctor/prefer-use-effect-event": "off",
    "react-doctor/no-prop-callback-in-effect": "off",
    "react-doctor/no-event-handler": "off",
    "react-doctor/no-pass-data-to-parent": "off",
    "react-doctor/rerender-lazy-ref-init": "off",
    "react-doctor/js-cache-property-access": "off",
    "react-doctor/js-set-map-lookups": "off",
    // Explorer shell state — useReducer migration is out of scope.
    "react-doctor/prefer-useReducer": "off",
    // Radix Dialog is used intentionally (focus trap, a11y).
    "react-doctor/prefer-html-dialog": "off",
    // shadcn compound components + autocomplete listbox + resize separator.
    "react-doctor/no-multi-comp": "off",
    "react-doctor/prefer-tag-over-role": "off",
    "react-doctor/no-static-element-interactions": "off",
    "react-doctor/click-events-have-key-events": "off",
    // CI / supply-chain policy — not app code.
    "react-doctor/build-pipeline-secret-boundary": "off",
    "react-doctor/require-pnpm-hardening": "off",
  },
});
