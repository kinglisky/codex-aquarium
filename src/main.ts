import "./style.css";
import type { AquariumSnapshot, AquariumSession, SessionStatus } from "../shared/protocol";
import { ACTIVITY_FISH, createAquarium } from "./aquarium";
import { FISH_TYPES, isActiveSession, speciesForSession } from "./sessions";
import { demoSnapshot } from "./demo";
import type { FishSpecies } from "./fish";
import { MUSEUM_SPECIES } from "./museum-fish";

const FISH_ROLE: Record<FishSpecies, string> = {
  neon: "阅读与检索", guppy: "其他工具", betta: "子 Agent", swordtail: "写入与编辑",
  rainbow: "网页与浏览器", golden: "终端与命令", blacktail: "会话主鱼",
  cardinal: "会话主鱼", tiger: "会话主鱼", zebra: "会话主鱼",
};
const STATUS: Record<SessionStatus, string> = { thinking: "思考中", working: "执行中", waiting: "等待您", idle: "休息中", interrupted: "已中断", stale: "状态过期" };
const icons = {
  waves: '<path d="M2 8c3-3 5 3 8 0s5 3 8 0M2 13c3-3 5 3 8 0s5 3 8 0"/>',
  pause: '<path d="M7 5v14M17 5v14"/>',
  play: '<path d="m8 5 11 7-11 7Z"/>',
  reset: '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  collapse: '<path d="M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5"/>',
  arrow: '<path d="m9 5 7 7-7 7"/>',
  book: '<path d="M3 5c4-2 7-1 9 1 2-2 5-3 9-1v14c-4-2-7-1-9 1-2-2-5-3-9-1Zm9 1v14"/>',
  walk: '<path d="M14 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm-2 5-3 6 3 2-1 5m1-13 3 4 3 1m-8-4-4 3m6 4 4 5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
};
function icon(name: keyof typeof icons) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`; }
function fishIcon(species: FishSpecies) {
  const tails: Record<FishSpecies, string> = { neon: "M12 16 3 11 5 17 3 22Z", guppy: "M13 16 2 7 1 17 3 26Z", betta: "M15 17 6 5 1 7 3 14 0 19 5 28 14 23Z", swordtail: "M12 16 3 11 5 18 0 29 13 21Z", rainbow: "M12 16 3 10 6 18 3 25Z", golden: "M12 16 3 12 7 18 3 23Z", blacktail: "M12 16 2 8 6 18 3 24Z", cardinal: "M12 16 3 12 6 18 3 23Z", tiger: "M12 16 3 10 7 18 3 26Z", zebra: "M12 16 2 11 6 18 2 24Z" };
  return `<svg class="fish-symbol fish-${species}" viewBox="0 0 44 34" aria-hidden="true" style="color:${MUSEUM_SPECIES[species].color}"><path d="${tails[species]}" fill="currentColor" opacity=".6"/><path d="M9 18Q24 5 39 17Q25 29 9 18Z" fill="currentColor"/><path d="m19 13 6-8 4 8m-11 9 7 6 4-6" fill="currentColor" opacity=".65"/><circle cx="34" cy="16" r="1.2" fill="#0a2031"/></svg>`;
}
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character); }
function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`缺少页面元素：${selector}`);
  return element;
}

required<HTMLDivElement>("#app").innerHTML = `
  <main class="workspace">
    <section class="aquarium-panel" aria-label="实时海洋馆">
      <div id="viewport"></div>
      <header class="app-header">
        <a class="brand" href="/" aria-label="Codex Aquarium 首页"><span class="brand-mark">${icon("waves")}</span><span>泊<span class="brand-subtitle">海洋馆</span></span></a>
        <div class="header-actions"><div id="connection" class="connection" role="status"><span class="status-dot"></span><span>连接中</span></div>
        <div class="mode-control" role="group" aria-label="数据来源"><button id="live-mode" class="active" aria-pressed="true">实时</button><button id="demo-mode" aria-pressed="false">演示</button></div>
        <button id="guide-toggle" class="guide-toggle" aria-expanded="false" aria-controls="museum-guide">${icon("book")}<span>展厅手册</span></button></div>
      </header>
      <div class="scene-title"><h1>远洋展厅</h1><p>一个会话，一位海洋来客。</p></div>
      <div id="demo-notice" class="demo-notice" hidden>演示鱼群<span>模拟会话，不影响真实状态</span></div>
      <div id="empty-state" class="empty-state" hidden><h2>海洋馆，正在等你。</h2><p>在 Codex 中开始一项任务，鱼就会游进来。</p><button id="empty-demo" class="text-button">看看演示鱼群 ${icon("arrow")}</button></div>
      <div id="offline-note" class="offline-note" hidden>连接已断开，鱼群暂时停留。请确认本地服务仍在运行。</div>
      <div class="scene-footer">
        <div class="gallery-caption"><span class="gallery-line"></span><p>在这里，慢慢看。<small>拖动观察 · 滚轮靠近 · 点鱼查看会话</small></p></div>
        <div class="visitor-controls" role="group" aria-label="沿玻璃散步"><button id="walk-left" aria-label="向左散步">${icon("arrow")}</button><span>${icon("walk")}<span>散步<small>A / D 或方向键</small></span></span><button id="walk-right" aria-label="向右散步">${icon("arrow")}</button></div>
        <div class="scene-controls"><button id="near-view" title="靠近玻璃" aria-label="靠近玻璃" aria-pressed="false">${icon("waves")}</button><button id="reset-view" title="恢复视角" aria-label="恢复视角">${icon("reset")}</button><button id="pause" title="暂停游动" aria-label="暂停游动" aria-pressed="false">${icon("pause")}</button><button id="immersive" title="进入全屏" aria-label="进入全屏" aria-pressed="false">${icon("expand")}</button></div>
      </div>
      <p id="fullscreen-notice" class="fullscreen-notice" role="status" hidden></p>
      <aside id="museum-guide" class="sidebar" aria-label="展厅手册" hidden>
        <div class="guide-heading"><div><h2>展厅手册</h2><p>正在发生的协作，都在这片海里。</p></div><button id="guide-close" class="icon-button" aria-label="收起展厅手册">${icon("close")}</button></div>
        <section id="detail" class="detail" hidden aria-live="polite"></section>
        <section class="session-section"><div class="section-title"><h2>此刻的来客</h2><span id="session-total">0 个活跃会话</span></div><div class="summary"><span><strong id="main-count">0</strong>只主鱼</span><span><strong id="activity-count">0</strong>只随行鱼</span></div><div id="session-list" class="session-list"></div><p id="session-empty" class="quiet-note">只展示正在执行或等待审批的会话。任务结束后离开，再次开始时还是原来那只鱼。</p></section>
        <section class="settings"><div class="section-title"><h2>展厅光景</h2></div><label for="light">灯光<span id="light-value">100%</span></label><input id="light" type="range" min="45" max="140" value="100"><label for="flow">水流<span id="flow-value">轻柔</span></label><input id="flow" type="range" min="0" max="180" value="80"></section>
        <section class="field-guide"><div class="section-title"><h2>海洋图鉴</h2><span>${FISH_TYPES.length} 种鱼</span></div><div class="fish-guide">${FISH_TYPES.map(species => `<div class="guide-entry" title="${MUSEUM_SPECIES[species].description}">${fishIcon(species)}<span>${MUSEUM_SPECIES[species].name}<small>${FISH_ROLE[species]}</small></span></div>`).join("")}</div><p class="quiet-note">原创 3D 模型，以海洋鱼类的轮廓重新绘制。大鱼代表会话，小鱼代表工具或子 Agent。</p></section>
        <footer class="sidebar-footer"><span class="privacy-dot"></span>只在本机，安静地陪您工作</footer>
      </aside>
    </section>
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
  detail.innerHTML = `<div class="detail-heading"><span style="color:${MUSEUM_SPECIES[species].color}">${MUSEUM_SPECIES[species].name}</span><button id="close-detail" class="icon-button" aria-label="收起会话详情">${icon("close")}</button></div><h3>${escapeHtml(session.label)}</h3><p class="detail-status"><span class="status-dot status-${session.status}"></span>${STATUS[session.status]}</p><div class="activity-list">${session.activities.length ? session.activities.map((activity) => `<div class="activity-row">${fishIcon(ACTIVITY_FISH[activity.category])}<span>${escapeHtml(activity.label)}<small>${activity.kind === "agent" ? "子 Agent" : "工具"} · ${activity.status === "waiting" ? "等待中" : "正在执行"}</small></span></div>`).join("") : '<p class="quiet-note">此刻没有正在执行的工具或子 Agent。</p>'}</div>`;
  required<HTMLButtonElement>("#close-detail").addEventListener("click", () => selectSession(null));
  if (preserveFocus) required<HTMLButtonElement>("#close-detail").focus({ preventScroll: true });
}

function setGuide(open: boolean) {
  required<HTMLElement>("#museum-guide").hidden = !open;
  required<HTMLButtonElement>("#guide-toggle").setAttribute("aria-expanded", String(open));
}

function selectSession(id: string | null) {
  selectedId = id;
  aquarium?.select(id);
  if (id) setGuide(true);
  for (const button of document.querySelectorAll<HTMLButtonElement>(".session-row")) button.setAttribute("aria-pressed", String(button.dataset.session === id));
  renderDetail();
  if (id) required<HTMLElement>("#detail").scrollIntoView({ block: "nearest", behavior: reducedMotion.matches ? "auto" : "smooth" });
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
let nearView = false;
const nearButton = required<HTMLButtonElement>("#near-view");
function setNearView(value: boolean) {
  nearView = value;
  aquarium?.resetView(value);
  nearButton.setAttribute("aria-pressed", String(value));
  nearButton.setAttribute("aria-label", value ? "返回全景" : "靠近玻璃");
  nearButton.title = value ? "返回全景" : "靠近玻璃";
}
required<HTMLButtonElement>("#reset-view").addEventListener("click", () => setNearView(false));
nearButton.addEventListener("click", () => setNearView(!nearView));
required<HTMLButtonElement>("#walk-left").addEventListener("click", () => aquarium?.walk(-1));
required<HTMLButtonElement>("#walk-right").addEventListener("click", () => aquarium?.walk(1));
required<HTMLButtonElement>("#guide-toggle").addEventListener("click", () => setGuide(Boolean(required<HTMLElement>("#museum-guide").hidden)));
required<HTMLButtonElement>("#guide-close").addEventListener("click", () => { setGuide(false); required<HTMLButtonElement>("#guide-toggle").focus(); });
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
const fullscreenPanel = required<HTMLElement>(".aquarium-panel");
const fullscreenButton = required<HTMLButtonElement>("#immersive");
const fullscreenNotice = required<HTMLElement>("#fullscreen-notice");
function renderFullscreen() {
  const active = document.fullscreenElement === fullscreenPanel;
  document.body.classList.toggle("immersive", active);
  fullscreenButton.setAttribute("aria-pressed", String(active));
  fullscreenButton.setAttribute("aria-label", active ? "退出全屏" : "进入全屏");
  fullscreenButton.title = active ? "退出全屏（Esc）" : "进入全屏";
  fullscreenButton.innerHTML = icon(active ? "collapse" : "expand");
}
function showFullscreenNotice(message: string) {
  fullscreenNotice.textContent = message;
  fullscreenNotice.hidden = false;
}
async function toggleFullscreen() {
  if (fullscreenButton.disabled) return;
  const active = document.fullscreenElement === fullscreenPanel;
  if (!fullscreenPanel.requestFullscreen || !document.exitFullscreen || document.fullscreenEnabled === false) {
    showFullscreenNotice("当前窗口不支持全屏，请在独立浏览器中打开鱼缸。");
    return;
  }
  fullscreenNotice.hidden = true;
  fullscreenButton.disabled = true;
  try {
    if (active) {
      await document.exitFullscreen();
      return;
    }
    await fullscreenPanel.requestFullscreen({ navigationUI: "hide" });
  } catch {
    showFullscreenNotice(active ? "未能退出全屏，请按 Esc 返回。" : "未能进入全屏，请在浏览器中打开鱼缸后重试。");
  } finally {
    fullscreenButton.disabled = false;
    renderFullscreen();
  }
}
fullscreenButton.addEventListener("click", toggleFullscreen);
document.addEventListener("fullscreenchange", renderFullscreen);
document.addEventListener("keydown", (event) => { if (event.key === "Escape") { selectSession(null); setGuide(false); } });
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
  document.removeEventListener("fullscreenchange", renderFullscreen);
  reducedMotion.removeEventListener("change", motionPreferenceChanged);
  aquarium?.dispose();
}, { once: true });
window.addEventListener("pageshow", (event) => { if (event.persisted) window.location.reload(); });
