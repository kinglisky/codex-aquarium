import "./style.css";
import type { AquariumSnapshot, AquariumSession, SessionStatus } from "../shared/protocol";
import { ACTIVITY_FISH, createAquarium } from "./aquarium";
import { FISH_TYPES, isActiveSession, speciesForSession } from "./sessions";
import { demoSnapshot } from "./demo";
import type { FishSpecies } from "./fish";

const FISH_INFO: Record<FishSpecies, { name: string; color: string; role: string }> = {
  neon: { name: "霓虹灯鱼", color: "#54d8f5", role: "阅读与检索" },
  guppy: { name: "孔雀鱼", color: "#fb9b63", role: "其他工具" },
  betta: { name: "斗鱼", color: "#dd78d3", role: "子 Agent" },
  swordtail: { name: "剑尾鱼", color: "#f48b76", role: "写入与编辑" },
  rainbow: { name: "彩虹鱼", color: "#9cbdf3", role: "网页与浏览器" },
  golden: { name: "金丝鱼", color: "#e9ce7c", role: "终端与命令" },
  blacktail: { name: "黑尾大勾", color: "#c4d6cb", role: "会话主鱼" },
  cardinal: { name: "宝莲灯", color: "#20d8f6", role: "会话主鱼" },
  tiger: { name: "虎皮", color: "#f5a552", role: "会话主鱼" },
  zebra: { name: "斑马", color: "#83a9ec", role: "会话主鱼" },
};
const STATUS: Record<SessionStatus, string> = { thinking: "思考中", working: "执行中", waiting: "等待您", idle: "休息中", interrupted: "已中断", stale: "状态过期" };
const icons = {
  waves: '<path d="M2 8c3-3 5 3 8 0s5 3 8 0M2 13c3-3 5 3 8 0s5 3 8 0"/>',
  pause: '<path d="M7 5v14M17 5v14"/>',
  play: '<path d="m8 5 11 7-11 7Z"/>',
  reset: '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  arrow: '<path d="m9 5 7 7-7 7"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
};
function icon(name: keyof typeof icons) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`; }
function fishIcon(species: FishSpecies) {
  const tails: Record<FishSpecies, string> = { neon: "M12 16 3 11 5 17 3 22Z", guppy: "M13 16 2 7 1 17 3 26Z", betta: "M15 17 6 5 1 7 3 14 0 19 5 28 14 23Z", swordtail: "M12 16 3 11 5 18 0 29 13 21Z", rainbow: "M12 16 3 10 6 18 3 25Z", golden: "M12 16 3 12 7 18 3 23Z", blacktail: "M12 16 2 8 6 18 3 24Z", cardinal: "M12 16 3 12 6 18 3 23Z", tiger: "M12 16 3 10 7 18 3 26Z", zebra: "M12 16 2 11 6 18 2 24Z" };
  return `<svg class="fish-symbol fish-${species}" viewBox="0 0 44 34" aria-hidden="true" style="color:${FISH_INFO[species].color}"><path d="${tails[species]}" fill="currentColor" opacity=".6"/><path d="M9 18Q24 5 39 17Q25 29 9 18Z" fill="currentColor"/><path d="m19 13 6-8 4 8m-11 9 7 6 4-6" fill="currentColor" opacity=".65"/><circle cx="34" cy="16" r="1.2" fill="#0a2031"/></svg>`;
}
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character); }
function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`缺少页面元素：${selector}`);
  return element;
}

required<HTMLDivElement>("#app").innerHTML = `
  <header class="app-header">
    <a class="brand" href="/" aria-label="Codex Aquarium 首页"><span class="brand-mark">${icon("waves")}</span><span>泊<span class="brand-subtitle">Codex Aquarium</span></span></a>
    <div class="mode-control" role="group" aria-label="数据来源"><button id="live-mode" class="active" aria-pressed="true">实时鱼缸</button><button id="demo-mode" aria-pressed="false">演示鱼群</button></div>
    <div id="connection" class="connection" role="status"><span class="status-dot"></span><span>连接中</span></div>
  </header>
  <main class="workspace">
    <section class="aquarium-panel" aria-label="实时鱼缸">
      <div class="scene-title"><h1>让工作，游起来。</h1><p>一个活跃会话，一只鱼。同行的小鱼，是它正在做的事。</p></div>
      <div id="demo-notice" class="demo-notice" hidden>演示模式<span>鱼群为模拟数据</span></div>
      <div id="viewport"></div>
      <div id="empty-state" class="empty-state" hidden><span class="empty-ripple">${icon("waves")}</span><h2>静候下一次工作</h2><p>在已安装插件的 Codex 中开始工作，<br>活跃时游进来，休息时暂时离开。</p><button id="empty-demo" class="text-button">先看看演示鱼群 ${icon("arrow")}</button></div>
      <div id="offline-note" class="offline-note" hidden>连接已断开，鱼群停留在最后收到的状态。请确认本地服务仍在运行。</div>
      <div class="scene-footer"><p class="gesture-hint">拖动环绕 · 滚轮缩放 · 点击鱼查看会话</p><div class="scene-controls"><button id="reset-view" title="恢复视角" aria-label="恢复视角">${icon("reset")}</button><button id="pause" title="暂停游动" aria-label="暂停游动" aria-pressed="false">${icon("pause")}</button><button id="immersive" title="沉浸模式" aria-label="沉浸模式" aria-pressed="false">${icon("expand")}</button></div></div>
      <div class="waterline"></div>
    </section>
    <aside class="sidebar" aria-label="会话与鱼群">
      <section class="session-section"><div class="section-title"><h2>缸里的伙伴</h2><span id="session-total">0 个会话</span></div><div class="summary"><span><strong id="main-count">0</strong>只主鱼</span><span><strong id="activity-count">0</strong>只随行鱼</span></div><div id="session-list" class="session-list"></div><p id="session-empty" class="quiet-note">这里只显示活跃会话。继续工作后，同一只鱼会再次游回来。</p></section>
      <section id="detail" class="detail" hidden aria-live="polite"></section>
      <section class="settings"><div class="section-title"><h2>水下光景</h2></div><label for="light">灯光<span id="light-value">100%</span></label><input id="light" type="range" min="45" max="140" value="100"><label for="flow">水流<span id="flow-value">轻柔</span></label><input id="flow" type="range" min="0" max="180" value="80"></section>
      <section class="field-guide"><div class="section-title"><h2>鱼群图鉴</h2><span>${FISH_TYPES.length} 种鱼</span></div><div class="fish-guide">${FISH_TYPES.map((species) => `<div class="guide-entry">${fishIcon(species)}<span>${FISH_INFO[species].name}<small>${FISH_INFO[species].role}</small></span></div>`).join("")}</div><p class="quiet-note">大鱼代表会话；小鱼代表正在执行的工具或子 Agent，完成后离开鱼群。</p></section>
      <footer class="sidebar-footer"><span class="privacy-dot"></span>只在本机，安静地陪您工作</footer>
    </aside>
  </main>`;

let snapshot: AquariumSnapshot = { version: 1, source: "hooks", sessions: [], updatedAt: 0, lastEventAt: null };
let shownSnapshot = snapshot;
let mode: "live" | "demo" = "live";
let connection: "connecting" | "connected" | "offline" = "connecting";
let selectedId: string | null = null;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let paused = reducedMotion.matches;
let demoTick = 0;
let demoTimer: ReturnType<typeof setInterval> | undefined;
let aquarium: ReturnType<typeof createAquarium> | null = null;
let destroyed = false;

function selectedSession(): AquariumSession | undefined { return shownSnapshot.sessions.find((session) => session.id === selectedId); }

function renderDetail() {
  const detail = required<HTMLElement>("#detail");
  const preserveFocus = document.activeElement?.id === "close-detail";
  const session = selectedSession();
  detail.hidden = !session;
  if (!session) return;
  const species = speciesForSession(session.id);
  detail.innerHTML = `<div class="detail-heading"><span style="color:${FISH_INFO[species].color}">${FISH_INFO[species].name}</span><button id="close-detail" class="icon-button" aria-label="收起会话详情">${icon("close")}</button></div><h3>${escapeHtml(session.label)}</h3><p class="detail-status"><span class="status-dot status-${session.status}"></span>${STATUS[session.status]}</p><div class="activity-list">${session.activities.length ? session.activities.map((activity) => `<div class="activity-row">${fishIcon(ACTIVITY_FISH[activity.category])}<span>${escapeHtml(activity.label)}<small>${activity.kind === "agent" ? "子 Agent" : "工具"} · ${activity.status === "waiting" ? "等待中" : "正在执行"}</small></span></div>`).join("") : '<p class="quiet-note">此刻没有正在执行的工具或子 Agent。</p>'}</div>`;
  required<HTMLButtonElement>("#close-detail").addEventListener("click", () => selectSession(null));
  if (preserveFocus) required<HTMLButtonElement>("#close-detail").focus({ preventScroll: true });
}

function selectSession(id: string | null) {
  selectedId = id;
  aquarium?.select(id);
  for (const button of document.querySelectorAll<HTMLButtonElement>(".session-row")) button.setAttribute("aria-pressed", String(button.dataset.session === id));
  renderDetail();
}

function renderConnection() {
  const label = { connecting: "连接中", connected: "本地已连接", offline: "连接已断开" }[connection];
  const element = required<HTMLElement>("#connection");
  element.className = `connection ${mode === "demo" ? "demo" : connection}`;
  element.innerHTML = `<span class="status-dot"></span><span>${mode === "demo" ? "演示中" : label}</span>`;
  required<HTMLElement>("#offline-note").hidden = mode === "demo" || connection !== "offline";
  aquarium?.setDisconnected(mode === "live" && connection !== "connected");
}

function renderSnapshot(value: AquariumSnapshot) {
  const sessions = value.sessions.filter(isActiveSession);
  shownSnapshot = { ...value, sessions };
  aquarium?.setSessions(sessions);
  const activities = sessions.reduce((total, session) => total + session.activities.length, 0);
  required<HTMLElement>("#main-count").textContent = String(sessions.length);
  required<HTMLElement>("#activity-count").textContent = String(activities);
  required<HTMLElement>("#session-total").textContent = `${sessions.length} 个活跃会话`;
  required<HTMLElement>("#session-empty").hidden = sessions.length > 0;
  required<HTMLElement>("#empty-state").hidden = sessions.length > 0;
  const list = required<HTMLElement>("#session-list");
  const focusedId = document.activeElement instanceof HTMLButtonElement ? document.activeElement.dataset.session : undefined;
  list.innerHTML = sessions.map((session) => `<button class="session-row" data-session="${escapeHtml(session.id)}" aria-pressed="${session.id === selectedId}">${fishIcon(speciesForSession(session.id))}<span class="session-copy"><strong>${escapeHtml(session.label)}</strong><span><i class="status-dot status-${session.status}"></i>${STATUS[session.status]}${session.activities.length ? `<span class="follower-count">+${session.activities.length} 随行</span>` : ""}</span></span>${icon("arrow")}</button>`).join("");
  for (const button of list.querySelectorAll<HTMLButtonElement>(".session-row")) button.addEventListener("click", () => selectSession(button.dataset.session ?? null));
  if (focusedId) [...list.querySelectorAll<HTMLButtonElement>(".session-row")].find((button) => button.dataset.session === focusedId)?.focus({ preventScroll: true });
  if (selectedId && !selectedSession()) selectSession(null);
  renderDetail();
}

function setMode(value: "live" | "demo") {
  mode = value;
  clearInterval(demoTimer);
  demoTimer = undefined;
  selectSession(null);
  required<HTMLElement>("#demo-notice").hidden = mode !== "demo";
  for (const name of ["live", "demo"] as const) {
    const button = required<HTMLButtonElement>(`#${name}-mode`);
    button.classList.toggle("active", mode === name);
    button.setAttribute("aria-pressed", String(mode === name));
  }
  renderConnection();
  if (mode === "live") {
    renderSnapshot(snapshot);
    return;
  }
  renderSnapshot(demoSnapshot(demoTick));
  demoTimer = setInterval(() => {
    if (paused) return;
    demoTick += 1;
    renderSnapshot(demoSnapshot(demoTick));
  }, 2400);
}

function renderPause() {
  const button = required<HTMLButtonElement>("#pause");
  button.innerHTML = icon(paused ? "play" : "pause");
  button.setAttribute("aria-pressed", String(paused));
  button.setAttribute("aria-label", paused ? "继续游动" : "暂停游动");
  button.title = paused ? "继续游动" : "暂停游动";
  aquarium?.setPaused(paused);
}

try {
  aquarium = createAquarium(required<HTMLElement>("#viewport"), selectSession);
} catch (error) {
  required<HTMLElement>("#viewport").innerHTML = '<div class="render-error"><h2>暂时无法绘制 3D 鱼缸</h2><p>请启用浏览器硬件加速，并使用支持 WebGL 2 的浏览器。右侧仍可查看实时会话。</p></div>';
  console.error("鱼缸初始化失败", error);
}

required<HTMLButtonElement>("#live-mode").addEventListener("click", () => setMode("live"));
required<HTMLButtonElement>("#demo-mode").addEventListener("click", () => setMode("demo"));
required<HTMLButtonElement>("#empty-demo").addEventListener("click", () => setMode("demo"));
required<HTMLButtonElement>("#reset-view").addEventListener("click", () => aquarium?.resetView());
required<HTMLButtonElement>("#pause").addEventListener("click", () => { paused = !paused; renderPause(); });
required<HTMLInputElement>("#light").addEventListener("input", (event) => {
  const value = (event.currentTarget as HTMLInputElement).valueAsNumber;
  aquarium?.setLight(value / 100);
  required<HTMLElement>("#light-value").textContent = `${value}%`;
});
required<HTMLInputElement>("#flow").addEventListener("input", (event) => {
  const value = (event.currentTarget as HTMLInputElement).valueAsNumber;
  aquarium?.setFlow(value / 100);
  required<HTMLElement>("#flow-value").textContent = value === 0 ? "静水" : value < 100 ? "轻柔" : "活泼";
});
function setImmersive(value: boolean) {
  document.body.classList.toggle("immersive", value);
  required<HTMLButtonElement>("#immersive").setAttribute("aria-pressed", String(value));
}
required<HTMLButtonElement>("#immersive").addEventListener("click", () => setImmersive(!document.body.classList.contains("immersive")));
document.addEventListener("keydown", (event) => { if (event.key === "Escape") { setImmersive(false); selectSession(null); } });
function motionPreferenceChanged(event: MediaQueryListEvent) { paused = event.matches; renderPause(); }
reducedMotion.addEventListener("change", motionPreferenceChanged);
renderPause();
renderSnapshot(snapshot);

function receiveSnapshot(data: string) {
  const value = JSON.parse(data) as AquariumSnapshot;
  if (value.version !== 1 || value.source !== "hooks" || !Array.isArray(value.sessions)) throw new Error("不支持的会话数据格式");
  snapshot = value;
  connection = "connected";
  renderConnection();
  if (mode === "live") renderSnapshot(snapshot);
}

const eventSource = new EventSource("/api/events");
eventSource.addEventListener("state", (event: MessageEvent<string>) => {
  if (destroyed) return;
  try { receiveSnapshot(event.data); }
  catch (error) { console.error("无法读取会话事件", error); connection = "offline"; renderConnection(); }
});
eventSource.addEventListener("open", () => { connection = "connected"; renderConnection(); });
eventSource.addEventListener("error", () => { connection = "offline"; renderConnection(); });

const initialFetch = new AbortController();
fetch("/api/state", { signal: initialFetch.signal })
  .then((response) => { if (!response.ok) throw new Error(`状态接口返回 ${response.status}`); return response.text(); })
  .then((data) => { if (!destroyed && snapshot.updatedAt === 0) receiveSnapshot(data); })
  .catch(() => { if (!destroyed && snapshot.updatedAt === 0) { connection = "offline"; renderConnection(); } });

window.addEventListener("pagehide", () => {
  destroyed = true;
  clearInterval(demoTimer);
  initialFetch.abort();
  eventSource.close();
  reducedMotion.removeEventListener("change", motionPreferenceChanged);
  aquarium?.dispose();
}, { once: true });
window.addEventListener("pageshow", (event) => { if (event.persisted) window.location.reload(); });
