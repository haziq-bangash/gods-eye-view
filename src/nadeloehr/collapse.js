/**
 * Which cards and sections the reader minimised, remembered in this
 * browser so the layout stays the way they left it.
 */
import { ref, watch } from 'vue';

const KEY = 'nadeloehr.collapsed.v1';

function read() {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(KEY) || '[]');
    return new Set(Array.isArray(value) ? value.map(String) : []);
  } catch {
    return new Set();
  }
}

const collapsed = ref(read());
watch(
  collapsed,
  (set) => {
    try {
      globalThis.localStorage?.setItem(KEY, JSON.stringify([...set]));
    } catch {
      /* Private mode or full storage: the choice lasts for this visit. */
    }
  },
  { deep: true },
);

/** Whether a card is minimised, and a toggle for it. */
export function useCollapsed(id) {
  return {
    isCollapsed: () => collapsed.value.has(id),
    toggle() {
      const next = new Set(collapsed.value);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      collapsed.value = next;
    },
  };
}
