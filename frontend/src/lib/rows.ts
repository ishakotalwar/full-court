import { useCallback, useRef } from "react";

/** The nearest ancestor that actually scrolls, or null if the page is what
 *  scrolls around this element. */
function scroller(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node) {
    const overflow = getComputedStyle(node).overflowY;
    if ((overflow === "auto" || overflow === "scroll") && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Keeps a handle on each rendered row, so a point clicked on a chart can bring
 * its row into view in the table beside it.
 *
 * The container is scrolled directly rather than through `scrollIntoView`,
 * which walks every scrollable ancestor and takes the whole page with it: the
 * reader clicks a dot and the ground moves under the chart they are looking
 * at. Only a row actually out of view moves anything, so picking a row that is
 * already on screen does nothing.
 */
export function useRowIndex<K>() {
  const nodes = useRef(new Map<K, HTMLElement>());

  const register = useCallback(
    (key: K) => (el: HTMLElement | null) => {
      if (el) nodes.current.set(key, el);
      else nodes.current.delete(key);
    },
    []
  );

  // A frame late, so the row is measured where the pick leaves it.
  const reveal = useCallback((key: K) => {
    requestAnimationFrame(() => {
      const el = nodes.current.get(key);
      if (!el) return;
      const box = scroller(el);
      if (!box) {
        // A table that is not its own scroller: the page is, and moving it is
        // then the only way to show the row.
        el.scrollIntoView({ block: "nearest", behavior: "auto" });
        return;
      }
      const row = el.getBoundingClientRect();
      const frame = box.getBoundingClientRect();
      if (row.top >= frame.top && row.bottom <= frame.bottom) return; // already there
      // Centered rather than brought just inside the edge: the list is taller
      // than the window on most screens, so a row parked against the bottom of
      // its own container can still be below the fold.
      box.scrollTop +=
        row.top + row.height / 2 - (frame.top + frame.height / 2);
    });
  }, []);

  return { register, reveal };
}
