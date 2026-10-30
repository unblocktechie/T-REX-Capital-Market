// Position the floating country list next to the row that opened it.
// Use the list's measured *content* height, not the maximum scroll height:
// short lists should never jump hundreds of pixels above their trigger.
const EDGE_GAP = 12;
const TRIGGER_GAP = 8;
const POPOVER_WIDTH = 340;
const POPOVER_MAX_HEIGHT = 360;

export function blockedCountriesPopoverPosition({
  anchor,
  viewportWidth,
  viewportHeight,
  contentHeight,
}) {
  const width = Math.min(POPOVER_WIDTH, Math.max(0, viewportWidth - EDGE_GAP * 2));
  const spaceAbove = Math.max(0, anchor.top - EDGE_GAP - TRIGGER_GAP);
  const spaceBelow = Math.max(0, viewportHeight - anchor.bottom - EDGE_GAP - TRIGGER_GAP);
  const preferredHeight = Math.min(POPOVER_MAX_HEIGHT, Math.max(0, contentHeight));

  // Prefer below when the content fits; otherwise use the roomier side.
  const openAbove = spaceBelow < preferredHeight && spaceAbove > spaceBelow;
  const availableSpace = openAbove ? spaceAbove : spaceBelow;
  const maxHeight = Math.min(POPOVER_MAX_HEIGHT, availableSpace);
  const visibleHeight = Math.min(preferredHeight, maxHeight);
  const anchoredTop = openAbove
    ? anchor.top - TRIGGER_GAP - visibleHeight
    : anchor.bottom + TRIGGER_GAP;

  return {
    width,
    left: Math.max(EDGE_GAP, Math.min(anchor.right - width, viewportWidth - width - EDGE_GAP)),
    top: Math.max(EDGE_GAP, Math.min(anchoredTop, viewportHeight - visibleHeight - EDGE_GAP)),
    maxHeight,
  };
}
