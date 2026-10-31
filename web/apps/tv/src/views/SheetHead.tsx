/** The title of a sheet or dialog. Going back is the remote's Back key (Esc, a right click, a click outside): no arrow button. */
export function SheetHead(p: { title: string; right?: string }) {
  return (
    <div class="drawer-head">
      <div class="drawer-title">{p.title}</div>
      {p.right ? <div class="drawer-ver">{p.right}</div> : null}
    </div>
  );
}
