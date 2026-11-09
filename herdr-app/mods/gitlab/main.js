import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, panes, focused, exec, theme, layout, window, home } from "herdr";

const REMOTE_GLAB = ["glab", "/usr/local/bin/glab", "/opt/homebrew/bin/glab", "/usr/bin/glab", "/snap/bin/glab"];

function location() {
  const space = spaces().find((s) => s.active), f = focused();
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder, on };
}

function normPath(p) {
  const win = window()?.platform === "windows";
  const s = p.replace(/\\/g, "/");
  const t = s.length > 1 ? s.replace(/\/+$/, "") : s;
  return win ? t.toLowerCase() : t;
}

function isInside(root, path) {
  if (!root || !path) return false;
  const r = normPath(root), p = normPath(path);
  return p === r || p.startsWith(r.endsWith("/") ? r : `${r}/`);
}

function isShown(node, mod, shown = true) {
  if (!node || !shown) return false;
  if (node.hidden) shown = false;
  if (node.type === "stack") {
    for (const child of node.children ?? []) {
      if (isShown(child, mod, shown && node.active === child.id)) return true;
    }
    return false;
  }
  if (node.content?.mod === mod && shown) return true;
  for (const child of node.children ?? []) {
    if (isShown(child, mod, shown)) return true;
  }
  return false;
}

const STATUS = {
  success: "ansi2",
  failed: "ansi1",
  canceled: "dim",
  skipped: "dim",
  created: "dim",
  manual: "ansi3",
  running: "working",
  pending: "blocked",
  preparing: "working",
  waiting_for_resource: "blocked",
  scheduled: "ansi4",
};

const statusColor = (t, status) => t[STATUS[status] ?? "muted"] ?? t.muted;

const NOT_GITLAB = [
  "point to a known gitlab host",
  "no gitlab remotes found",
  "no gitlab projects found from remotes",
  "repository is not on a gitlab host",
  "not a gitlab repository",
  "could not determine base repository",
];

function isNotGitlab(message) {
  const text = String(message ?? "").toLowerCase();
  return NOT_GITLAB.some((marker) => text.includes(marker));
}

function latestPerRef(pipelines) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const recent = pipelines.filter((p) => (Date.parse(p.created_at ?? p.updated_at ?? "") || 0) >= cutoff);
  const sorted = [...recent].sort((a, b) => {
    const ta = Date.parse(a.created_at ?? a.updated_at ?? "") || 0;
    const tb = Date.parse(b.created_at ?? b.updated_at ?? "") || 0;
    if (ta !== tb) return tb - ta;
    return (b.id ?? 0) - (a.id ?? 0);
  });
  const seen = new Set();
  const out = [];
  for (const pipeline of sorted) {
    const ref = pipeline.ref ?? "";
    if (seen.has(ref)) continue;
    seen.add(ref);
    out.push(pipeline);
  }
  return out;
}

export default class Gitlab extends View {
  init(_props, cx) {
    this.generation = 0;
    this.cwdKey = null;
    this.root = null;
    this.on = null;
    this.issues = [];
    this.pipelines = [];
    this.error = null;
    this.unavailable = false;
    this.loading = false;
    this.shown = false;
    this.lastChecked = 0;
    this.refresh(cx);
    cx.timer.every(30000, (cx) => { if (this.shown) this.refresh(cx, true); });
  }

  clear(message) {
    this.root = null;
    this.issues = [];
    this.pipelines = [];
    this.error = message;
    this.unavailable = false;
  }

  refresh(cx, force = false) {
    const { cwd, on } = location();
    if (!cwd) {
      this.cwdKey = null;
      this.clear("No folder to inspect");
      return;
    }
    const cwdKey = `${on ?? ""}\0${cwd}`;
    if (this.root && this.on === on && isInside(this.root, cwd)) {
      this.cwdKey = cwdKey;
      if (force && !this.loading) this.load(cx, this.root, on);
      return;
    }
    if (!force && cwdKey === this.cwdKey) return;
    this.cwdKey = cwdKey;
    const gen = ++this.generation;
    this.loading = true;
    this.root = null;
    this.on = on;
    this.issues = [];
    this.pipelines = [];
    this.error = null;
    this.unavailable = false;
    cx.spawn(async (cx) => {
      let root = null, error = null;
      try {
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on });
        if (gen !== this.generation) return;
        if (top.code === 0) root = top.stdout.trim();
        else error = "Not a git repository";
      } catch (e) {
        error = String(e);
      }
      if (gen !== this.generation) return;
      if (!root) {
        this.loading = false;
        this.lastChecked = Date.now();
        this.error = error;
        this.unavailable = false;
        cx.notify();
        return;
      }
      this.root = root;
      this.on = on;
      await this.load(cx, root, on, gen);
    });
  }

  async glabPath(on) {
    const key = on ?? "";
    this.glabBy ??= {};
    this.glabMiss ??= {};
    if (this.glabBy[key]) return this.glabBy[key];
    const message = on ? `glab not found on ${on}` : "glab not found (looked in PATH, mise, ~/.local/bin, /usr/local/bin)";
    if (Date.now() < (this.glabMiss[key] ?? 0)) throw new Error(message);
    const homeDir = home();
    const candidates = on ? REMOTE_GLAB : [
      "glab",
      `${homeDir}/.local/share/mise/shims/glab`,
      `${homeDir}/.local/bin/glab`,
      `${homeDir}/.local/share/mise/installs/glab/latest/bin/glab`,
      "/usr/local/bin/glab",
      "/opt/homebrew/bin/glab",
      "/usr/bin/glab",
      "/snap/bin/glab",
    ];
    for (const cmd of candidates) {
      try {
        const r = await exec(cmd, ["--version"], { on, timeout: 5000 });
        if (r.code === 0) {
          this.glabBy[key] = cmd;
          return cmd;
        }
      } catch {}
    }
    this.glabMiss[key] = Date.now() + 60000;
    throw new Error(message);
  }

  async load(cx, root, on, gen = this.generation) {
    this.loading = true;
    this.lastChecked = Date.now();
    try {
      const glab = await this.glabPath(on);
      if (gen !== this.generation) return;
      const [issueResult, pipelineResult] = await Promise.all([
        exec(glab, ["issue", "list", "--output", "json", "--per-page", "50"], { cwd: root, on, timeout: 20000 }).catch((e) => ({ error: String(e) })),
        exec(glab, ["ci", "list", "--output", "json", "--per-page", "100"], { cwd: root, on, timeout: 20000 }).catch((e) => ({ error: String(e) })),
      ]);
      if (gen !== this.generation) return;
      const issues = this.read(issueResult, "issues");
      const pipelines = this.read(pipelineResult, "pipelines");
      const notGitlab = isNotGitlab(issues.error) || isNotGitlab(pipelines.error);
      this.issues = notGitlab ? [] : issues.data;
      this.pipelines = notGitlab ? [] : latestPerRef(pipelines.data);
      this.error = notGitlab ? null : [issues.error, pipelines.error].filter(Boolean).join("\n") || null;
      this.unavailable = notGitlab;
    } catch (e) {
      if (gen === this.generation) {
        this.error = String(e);
        this.unavailable = false;
      }
    } finally {
      if (gen === this.generation) {
        this.loading = false;
        this.lastChecked = Date.now();
      }
      cx.notify();
    }
  }

  read(result, what) {
    if (result?.error) return { data: [], error: result.error };
    if (result?.code !== 0) return { data: [], error: (result?.stderr || result?.stdout || `glab ${what} failed`).trim() };
    try {
      const data = JSON.parse(result.stdout || "[]");
      if (data?.error) return { data: [], error: data.error.message || String(data.error) };
      return { data: Array.isArray(data) ? data : [], error: null };
    } catch {
      return { data: [], error: `Could not read glab ${what} output` };
    }
  }

  section(title, t, rows) {
    return v_flex().gap(2)
      .child(h_flex().px(8).py(4).items_center().gap(6).text_size(11).text_color(t.dim)
        .child(div().font_semibold().child(title)))
      .children(rows);
  }

  empty(text, t) {
    return div().px(8).py(6).text_size(12).text_color(t.dim).child(text);
  }

  issueRow(issue, t) {
    const iid = issue.iid ?? issue.references?.short ?? "";
    const labels = (issue.labels ?? []).slice(0, 3);
    return h_flex().id(`gitlab-issue-${issue.id ?? iid}`).h(28).flex_none().px(8).gap(8).items_center().rounded(7)
      .cursor_pointer().hover((s) => s.bg(t.hover))
      .when(Boolean(issue.web_url), (el) => el.on_click((_e, cx) => cx.open_url(issue.web_url)))
      .child(div().text_size(11).text_color(t.muted).child(`#${iid}`))
      .child(div().flex_1().min_w(0).truncate().child(issue.title ?? ""))
      .when(labels.length > 0, (el) => el.child(h_flex().gap(4).children(labels.map((label) =>
        div().px(5).py(1).rounded(4).bg(t.raised).text_size(10).text_color(t.muted).child(label)))));
  }

  pipelineRow(pipeline, t) {
    const status = pipeline.status ?? "unknown";
    const color = statusColor(t, status);
    return h_flex().id(`gitlab-pipeline-${pipeline.id ?? pipeline.iid ?? ""}`).h(28).flex_none().px(8).gap(8).items_center().rounded(7)
      .cursor_pointer().hover((s) => s.bg(t.hover))
      .when(Boolean(pipeline.web_url), (el) => el.on_click((_e, cx) => cx.open_url(pipeline.web_url)))
      .child(div().size(7).flex_none().rounded_full().bg(color))
      .child(div().w(64).flex_none().text_size(11).text_color(color).truncate().child(status))
      .child(div().flex_1().min_w(0).truncate().text_size(12).child(pipeline.ref ?? ""))
      .child(div().text_size(10).text_color(t.dim).child(`#${pipeline.iid ?? pipeline.id ?? ""}`));
  }

  render(cx) {
    this.shown = isShown(layout(), "gitlab");
    this.refresh(cx);
    if (this.shown && !this.loading && Date.now() - this.lastChecked > 30000) this.refresh(cx, true);
    if (this.unavailable) return div().size_full();
    const t = theme();
    const repo = this.root ? normPath(this.root).split("/").filter(Boolean).pop() ?? "" : "";
    return v_flex().id("gitlab").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(svg("mods/gitlab/gitlab.svg").size(15).text_color(t.muted))
        .child(div().font_semibold().child("Gitlab"))
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.dim).child(repo))
        .child(div().id("gitlab-refresh").h(24).px(8).flex().items_center().rounded(6).cursor_pointer().text_color(t.muted).hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => this.refresh(cx, true)).child(this.loading ? "…" : "Refresh")))
      .child(v_flex().flex_1().min_h(0).overflow_y_scroll().p(8).gap(8)
        .when(Boolean(this.error), (el) => el.child(div().p(8).text_size(12).text_color(t.ansi1).child(this.error)))
        .child(this.section("Issues", t, this.issues.length
          ? this.issues.map((issue) => this.issueRow(issue, t))
          : [this.empty(this.loading ? "Loading issues…" : "No open issues", t)]))
        .child(this.section("Pipelines", t, this.pipelines.length
          ? this.pipelines.map((pipeline) => this.pipelineRow(pipeline, t))
          : [this.empty(this.loading ? "Loading pipelines…" : "No pipelines in the last 24 hours", t)])));
  }
}
