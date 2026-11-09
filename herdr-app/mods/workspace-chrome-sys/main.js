import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, run, props, window, shared, setShared, updates, layout, exec } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// To the rail (on macOS wide enough for the traffic lights), or back to the width it had.
function toggleSidebar() {
  const width = find(layout(), "sidebar")?.size?.px;
  if (!narrow()) setShared("sidebar.width", width);
  // Mods edited before the rail went by width still read the flag.
  setShared("sidebar.collapsed", !narrow());
  run("layout.resize", { id: "sidebar", px: narrow() ? (shared("sidebar.width") ?? 268) : window()?.platform === "macos" ? 76 : 44 });
}

export default class WorkspaceChrome extends View {
  init(_props, cx) {
    // Only the brand copy samples; the footer copy has no meter.
    if (props()?.footer) return;
    this.cpu = null;
    this.ram = null;
    this.prev = null;
    this.busy = false;
    cx.timer.every(3000, (cx) => this.refresh(cx));
    this.refresh(cx);
  }

  // CPU and RAM percentages, read from the OS. Linux samples /proc (CPU is the
  // delta between two reads); macOS and Windows ask their tools once.
  refresh(cx) {
    if (this.busy || narrow()) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        const platform = window()?.platform ?? "linux";
        if (platform === "windows") {
          const r = await exec("powershell", ["-NoProfile", "-Command",
            "$c=(Get-Counter '\\Processor(_Total)\\% Processor Time').CounterSamples.CookedValue;" +
            "$o=Get-CimInstance Win32_OperatingSystem;" +
            "$r=100*($o.TotalVisibleMemorySize-$o.FreePhysicalMemory)/$o.TotalVisibleMemorySize;" +
            "'{0:N0} {1:N0}' -f $c,$r"]);
          const [cpu, ram] = r.stdout.trim().split(/\s+/).map(Number);
          if (Number.isFinite(cpu)) this.cpu = Math.round(cpu);
          if (Number.isFinite(ram)) this.ram = Math.round(ram);
        } else if (platform === "macos") {
          const r = await exec("sh", ["-c", "top -l 1 -n 0 | grep -E 'CPU usage|PhysMem'"]);
          const cpu = r.stdout.match(/CPU usage:\s*([\d.]+)% user,\s*([\d.]+)% sys/);
          const mem = r.stdout.match(/PhysMem:\s*(\d+)M used.*?(\d+)M unused/);
          if (cpu) this.cpu = Math.round(Number(cpu[1]) + Number(cpu[2]));
          if (mem) {
            const used = Number(mem[1]), free = Number(mem[2]);
            this.ram = Math.round(100 * used / (used + free));
          }
        } else {
          const r = await exec("sh", ["-c", "cat /proc/stat; echo __M__; cat /proc/meminfo"]);
          const [stat, meminfo] = r.stdout.split("__M__");
          const line = stat.split("\n").find((l) => l.startsWith("cpu "));
          if (line) {
            const p = line.trim().split(/\s+/).slice(1).map(Number);
            const total = p.reduce((a, b) => a + b, 0);
            const idle = (p[3] ?? 0) + (p[4] ?? 0);
            if (this.prev) {
              const dt = total - this.prev.total, di = idle - this.prev.idle;
              if (dt > 0) this.cpu = Math.round(100 * (1 - di / dt));
            }
            this.prev = { total, idle };
          }
          const m = (key) => Number(meminfo.match(new RegExp(`${key}:\\s*(\\d+)`))?.[1] ?? NaN);
          const total = m("MemTotal"), avail = m("MemAvailable");
          if (total > 0 && avail >= 0) this.ram = Math.round(100 * (1 - avail / total));
        }
      } catch (_e) {
        // Leave the last values; the next tick tries again.
      } finally {
        this.busy = false;
        cx.notify();
      }
    });
  }

  meter(t) {
    return h_flex().id("sys-meter").flex_none().gap(5).items_center().text_size(11).text_color(t.dim)
      .child("CPU").child(div().text_color(t.muted).child(this.cpu == null ? "–" : `${this.cpu}%`))
      .child("RAM").child(div().text_color(t.muted).child(this.ram == null ? "–" : `${this.ram}%`));
  }

  button(id, label, action) {
    const t = theme();
    return div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.muted).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(action).child(label);
  }
  render() {
    const t = theme();
    const collapsed = narrow();
    if (props()?.footer) {
      const row = (id, icon, label, dim, action) => h_flex().id(id).h(28).px(8).gap(9).items_center().rounded(8)
        .when(collapsed, el => el.relative().w(32).px(0).justify_center().tooltip(label))
        .text_color(dim ? t.dim : t.muted).hover(s => s.bg(t.hover).text_color(t.foreground)).cursor_pointer()
        .on_click(action).child(svg(`mods/workspace-chrome-sys/${icon}.svg`).size(14))
        .when(!collapsed, el => el.child(label));
      const ready = div().size(6).rounded_full().bg(t.accent);
      return v_flex().size_full().bg(t.chrome).border_t(1).border_color(t.border).px(8).pt(4).pb(8).text_size(13)
        .when(collapsed, el => el.px(0).items_center())
        .child(row("settings", "settings", "Settings", false, () => run("app.settings"))
          .when(Boolean(updates().app.ready), el => el.child(collapsed ? ready.absolute().top(5).right(6) : ready)))
        .child(row("machine", "plus", "Add machine", true, () => run("mod.open", { name: "machine-add" })));
    }
    return h_flex().size_full().bg(t.chrome).pl(collapsed ? 6 : 14).pr(10).gap(4).items_center().text_size(13.5)
      .when(window()?.platform === "macos" && !window()?.fullscreen && !collapsed, el => el.pl(76))
      .when(!collapsed, el => el.child(h_flex().flex_1().gap(8).items_center()
        .child(image("frame/welcome/herdr.png").size(20).rounded(5))
        .child(div().font_semibold().text_color(t.foreground).child("Herdr"))
        .child(this.meter(t))))
      .when(!collapsed, el => el.child(this.button("search", svg("mods/workspace-chrome-sys/search.svg").size(15), () => run("mod.open", { name: "picker" }))))
      // On the macOS rail the traffic lights fill the row; the agents list's » unfolds it.
      .when(!(collapsed && window()?.platform === "macos"), el => el.child(this.button("sidebar-toggle", svg("mods/workspace-chrome-sys/sidebar.svg").size(15), toggleSidebar)));
  }
}
