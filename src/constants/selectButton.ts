/**
 * THE MULTI-SELECT CONTROL, ONE LOOK EVERYWHERE (MIC-039 p24; owner: "standardize this multi-select
 * button in its normal, selected, active, disabled, etc. states, as well as its symbol and text
 * everywhere it appears across the editor and browse kit instances").
 *
 * Mirrors the kit's MultiSelectButton (tcgscan-browse 0.9.102, src/SelectButton.tsx): the ⧉ glyph
 * and the word "Select"; idle is an outline, selecting is a solid fill dark enough for white text
 * (#1d4ed8 on white text is 6.70:1, where the brand blue was 3.68:1); pressed 0.7; disabled 0.45.
 */
export const SELECT_GLYPH = '⧉';
export const SELECT_WORD = 'Select';
/** The selecting fill and its text, 6.70:1. */
export const SELECT_ON = '#1d4ed8';
export const SELECT_ON_TEXT = '#ffffff';
export const SELECT_PRESSED_OPACITY = 0.7;
export const SELECT_DISABLED_OPACITY = 0.45;
