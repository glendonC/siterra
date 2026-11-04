// A column that scrolls with no bar drawn, as the thinking trace's chips scroll sideways
// (components/overview/ScrollableThinkingChips.tsx): data-fade names the edge with more to read ("top", "bottom" or
// "both") from the scroll position, so the column's style can fade that edge, and the column is a keyboard stop
// (tabindex 0, so the arrow and page keys scroll it) only while it has something to scroll to. Pass it as the scrolling
// element's ref; React calls the cleanup it returns when the element goes.

export type ScrollFade = "top" | "bottom" | "both";

export function scrollFade(el: HTMLElement | null): (() => void) | undefined {
  if (!el) return undefined;
  let fade: ScrollFade | null = null;
  let stop = false;
  const sync = () => {
    const max = el.scrollHeight - el.clientHeight;
    // only while its style lets it scroll: an unclipped element reports what overflows it too
    const scrolls = max > 2 && /^(auto|scroll)$/.test(getComputedStyle(el).overflowY);
    const above = scrolls && el.scrollTop > 3;
    const below = scrolls && el.scrollTop < max - 3;
    const next: ScrollFade | null =
      above && below ? "both" : below ? "bottom" : above ? "top" : null;
    if (next !== fade) {
      fade = next;
      if (next) el.setAttribute("data-fade", next);
      else el.removeAttribute("data-fade");
    }
    if (scrolls !== stop) {
      stop = scrolls;
      if (scrolls) el.setAttribute("tabindex", "0");
      else el.removeAttribute("tabindex");
    }
  };
  // the column's own size and its content's (a line that wraps anew, a group that opens), and any content put in
  const sized = new ResizeObserver(sync);
  const watch = () => {
    sized.observe(el);
    for (const child of el.children) sized.observe(child);
  };
  const added = new MutationObserver(() => {
    watch();
    sync();
  });
  watch();
  added.observe(el, { childList: true });
  el.addEventListener("scroll", sync, { passive: true });
  sync();
  return () => {
    el.removeEventListener("scroll", sync);
    sized.disconnect();
    added.disconnect();
  };
}
