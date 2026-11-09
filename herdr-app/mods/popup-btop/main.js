import { View, div } from "gpui-kit";
import { hc, openOverlay, closeOverlay, props, focused, home, run, terminals, setShared, shared } from "herdr";

const NAME = "popup-btop";
const CMD = "exec ~/.local/share/mise/shims/btop";
const WIDTH = 0.9;
const HEIGHT = 0.9;

export default class Popup extends View {
  init(_props, cx) {
    const overlay = props()?.overlay;
    if (!overlay) return;
    cx.spawn(async (cx) => {
      const r = await hc(["run", "--bg", "--json", "--no-parent", "--cwd", focused()?.cwd ?? home(), "--", "sh", "-c", CMD]);
      if (r.code !== 0) {
        closeOverlay(overlay);
        return;
      }
      const addr = JSON.parse(r.stdout).address;
      const old = shared(NAME);
      if (old && terminals().some((t) => t.address === old)) run("terminal.kill", { terminal: old });
      setShared(NAME, addr);
      openOverlay({ kind: "popup", width: WIDTH, height: HEIGHT, layout: { type: "block", content: { terminal: addr } } });
      await cx.sleep(120);
      closeOverlay(overlay);
    });
  }

  render() {
    return div().w(1).h(1);
  }
}
