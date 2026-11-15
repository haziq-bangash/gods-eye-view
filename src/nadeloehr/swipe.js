/**
 * A horizontal swipe on a touch screen: the content follows the finger a
 * little, and a clear left or right flick calls back. Vertical scrolling
 * stays native (put `touch-action: pan-y` on the element), and rows that
 * scroll sideways themselves are left alone.
 */
import { shallowRef } from 'vue';

const MIN_DISTANCE = 60;
const MIN_VELOCITY = 0.45; // px per ms
const MAX_SLOPE = 0.6; // |dy| / |dx| above this is a scroll, not a swipe

/** Whether the touch began inside something that scrolls sideways. */
function insideSidewaysScroller(target, root) {
  for (let node = target; node && node !== root; node = node.parentElement) {
    if (node.dataset?.noSwipe !== undefined) return true;
    if (node.scrollWidth > node.clientWidth + 1) {
      const overflow = globalThis.getComputedStyle?.(node).overflowX;
      if (overflow === 'auto' || overflow === 'scroll') return true;
    }
    if (node.matches?.('input, textarea, [role="slider"]')) return true;
  }
  return false;
}

/**
 * Pointer handlers for an element, and `offset` (px) to translate it by
 * while the finger moves. `onSwipe('left' | 'right')` decides what a swipe
 * does; return false from `canSwipe(direction)` to resist that way.
 */
export function useSwipe({ onSwipe, canSwipe = () => true }) {
  const offset = shallowRef(0);
  let start = null;

  function down(event) {
    if (event.pointerType !== 'touch' || !event.isPrimary) return;
    if (insideSidewaysScroller(event.target, event.currentTarget)) return;
    start = {
      x: event.clientX,
      y: event.clientY,
      t: performance.now(),
      horizontal: null,
    };
  }
  function move(event) {
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (start.horizontal === null && Math.hypot(dx, dy) > 10)
      start.horizontal = Math.abs(dy) / Math.max(1, Math.abs(dx)) < MAX_SLOPE;
    if (!start.horizontal) return;
    const allowed = canSwipe(dx < 0 ? 'left' : 'right');
    // Follow the finger, with rubber-band resistance where there is no next.
    offset.value = allowed ? dx * 0.5 : dx * 0.15;
  }
  function up(event) {
    if (!start) return;
    const dx = event.clientX - start.x;
    const elapsed = Math.max(1, performance.now() - start.t);
    const horizontal = start.horizontal;
    start = null;
    offset.value = 0;
    if (!horizontal) return;
    const direction = dx < 0 ? 'left' : 'right';
    if (
      (Math.abs(dx) > MIN_DISTANCE || Math.abs(dx) / elapsed > MIN_VELOCITY) &&
      canSwipe(direction)
    )
      onSwipe(direction);
  }
  function cancel() {
    start = null;
    offset.value = 0;
  }
  return {
    offset,
    handlers: {
      onPointerdown: down,
      onPointermove: move,
      onPointerup: up,
      onPointercancel: cancel,
    },
  };
}
