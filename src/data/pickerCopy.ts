/**
 * WHAT THE CARD BROWSER CALLS ITSELF, AND ITS MAIN BUTTON (MIC-017, owner 2026-11-12, phone: hand
 * Search added the card to the hand, but the sheet said Replace "M Blastoise EX"). Hand Search
 * opens the browser with no pocket behind it, so nothing in it may name one: no "Edit pocket", no
 * Replace "<card>", no "Find similar to ... (in this pocket)".
 */
export type PickerTarget = 'hand' | 'pocket';

export function pickerTitle(target: PickerTarget, pocketFilled: boolean): string {
  if (target === 'hand') return 'Add to your hand';
  return pocketFilled ? 'Edit pocket' : 'Add to pocket';
}

/** The card sheet's main button. `occupant` is the card already in the pocket, if any. */
export function pickerPrimaryLabel(target: PickerTarget, cardId: string, occupant?: { id: string; name: string }): string {
  if (target === 'hand') return 'Add to hand';
  return occupant && occupant.id !== cardId ? `Replace “${occupant.name}”` : 'Place in pocket';
}

/** The pocket's card the browser highlights and offers "Find similar to"; none for the hand. */
export function pickerSelectedCard(target: PickerTarget, slot?: { type: string; cardId?: string }): string | undefined {
  return target === 'pocket' && slot?.type === 'card' ? slot.cardId : undefined;
}
