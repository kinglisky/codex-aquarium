import "./style.css";
import type { AquariumSnapshot, AquariumSession } from "../shared/protocol";
import { ACTIVITY_FISH, createAquarium } from "./aquarium";
import { FISH_TYPES, isActiveSession, speciesForExhibit, speciesForSession } from "./sessions";
import { demoGroup, demoSnapshot, DEMO_GROUP_COUNT, DEMO_GROUP_TICKS } from "./demo";
import type { MuseumFishSpecies } from "./museum-fish";
import { MUSEUM_SPECIES } from "./museum-fish";
import { loadMuseumAssets } from "./museum-assets";
import { initSwimming } from "./swimming";
import { APPEARANCE_KEY, COMPANION_CATALOG, DEFAULT_APPEARANCE, filterCompanions, isCompanionId, isPlayerId, parseAppearance, PLAYER_MODELS } from "./museum-characters";
import type { MuseumAppearance } from "./museum-characters";
import { DEFAULT_SCENERY_STYLE, SCENERY_KEY, SCENERY_PRESETS, parseSceneryStyle } from "./scenery-presets";
import type { SceneryStyle } from "./scenery-presets";
import { createSceneryPreviews } from "./scenery-previews";
import { LOCALE_KEY, resolveLocale, translate } from "./i18n";
import type { MessageKey, MessageValues } from "./i18n";
import { companionName, companionSpeciesName, fishDescription, fishName, playerName, sceneryCopy } from "./catalog-i18n";

const browserLanguages = navigator.languages.length ? navigator.languages : [navigator.language];
let locale = resolveLocale(null, browserLanguages);
try { locale = resolveLocale(localStorage.getItem(LOCALE_KEY), browserLanguages); }
catch { /* 无法读取本地存储时，跟随浏览器语言。 */ }
function t(key: MessageKey, values?: MessageValues) { return translate(locale, key, values); }
function renderDocumentLanguage() {
  document.documentElement.lang = locale;
  document.title = t("pageTitle");
  document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute("content", t("pageDescription"));
}
renderDocumentLanguage();
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
function fishIcon(species: MuseumFishSpecies) {
  const { color, profile } = MUSEUM_SPECIES[species];
  const silhouettes: Record<string, string> = {
    eel: "M6 21Q18 6 37 13Q27 15 21 20T6 21Z",
    ray: "m5 18 16-13 13 11 7 2-11 2-8 10-9-9Z",
    seahorse: "M24 6q12 0 9 8l-6 1q-5 8 1 10t-5 5q-8-4-7-11l3-7Z",
    shark: "m6 17-5-9 12 5 8-9 3 9q10 0 16 5-10 7-24 3l-11 7Z",
  };
  const body = silhouettes[profile] ?? "m11 17-9-7 3 8-3 7 10-5q15 9 28-3-14-12-29 0Z";
  return `<svg class="fish-symbol fish-${species}" viewBox="0 0 44 34" aria-hidden="true" style="color:${color}"><path d="${body}" fill="currentColor"/><circle cx="33" cy="16" r="1" fill="#0a2031"/></svg>`;
}
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character); }
function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`缺少页面元素：${selector}`);
  return element;
}

function showStatus(element: HTMLElement, key: MessageKey) {
  element.hidden = false;
  element.dataset.i18n = key;
  element.textContent = t(key);
}

let appearance: MuseumAppearance = { ...DEFAULT_APPEARANCE };
try { appearance = parseAppearance(JSON.parse(localStorage.getItem(APPEARANCE_KEY) ?? "null")); }
catch { /* 浏览器禁用本地存储时，仍可选择本次逛馆的搭配。 */ }
let sceneryStyle: SceneryStyle = DEFAULT_SCENERY_STYLE;
try { sceneryStyle = parseSceneryStyle(localStorage.getItem(SCENERY_KEY)); }
catch { /* 无法读取本地存储时，使用默认造景。 */ }

function sceneryCard(style: SceneryStyle) {
  const { name, description } = sceneryCopy(style, locale);
  return `<label class="scenery-option"><input type="radio" name="scenery" value="${style}" ${sceneryStyle === style ? "checked" : ""}><span class="scenery-card"><img data-scenery-preview="${style}" alt="" width="320" height="180" decoding="async" hidden><span class="scenery-copy"><strong data-scenery-name="${style}">${escapeHtml(name)}</strong><span data-scenery-description="${style}">${escapeHtml(description)}</span></span><span class="scenery-check" aria-hidden="true">✓</span></span></label>`;
}

function characterCard(group: keyof MuseumAppearance, id: string, name: string, portrait = `portraits/${id}`) {
  const preview = id === "none" ? `<span class="character-empty">${icon("walk")}</span>` : `<img src="/models/acnh/${escapeHtml(portrait)}.png" alt="" width="256" height="300" loading="lazy" decoding="async">`;
  return `<label class="character-option"><input type="radio" name="${group}" value="${escapeHtml(id)}" ${appearance[group] === id ? "checked" : ""}><span class="character-card">${preview}<span class="character-name" data-character-group="${group}" data-character-id="${escapeHtml(id)}">${escapeHtml(name)}</span><span class="character-check" aria-hidden="true">✓</span></span></label>`;
}

function fishGuide() {
  return FISH_TYPES.map(species => `<div class="guide-entry" title="${escapeHtml(fishDescription(species, locale))}">${fishIcon(species)}<span>${escapeHtml(fishName(species, locale))}${locale === "zh-CN" ? `<small>${escapeHtml(MUSEUM_SPECIES[species].englishName)}</small>` : ""}</span></div>`).join("");
}

const companionSpecies = [...new Set(COMPANION_CATALOG.map(model => model.species))].sort((a, b) => a.localeCompare(b, "zh-CN"));

required<HTMLDivElement>("#app").innerHTML = `
  <main class="workspace">
    <section class="aquarium-panel" data-i18n-label="aquarium" aria-label="${t("aquarium")}">
      <div id="viewport"></div>
      <header class="app-header">
        <div class="header-actions"><div id="connection" class="connection" role="status"><span class="status-dot"></span><span>${t("connecting")}</span></div>
        <div class="mode-control" role="group" data-i18n-label="source" aria-label="${t("source")}"><button id="live-mode" class="active" aria-pressed="true" data-i18n="live">${t("live")}</button><button id="demo-mode" aria-pressed="false" data-i18n="demo">${t("demo")}</button></div>
        <button id="demo-next" class="guide-toggle" hidden>${t("nextGroup", { group: 1, total: DEMO_GROUP_COUNT })}</button>
        <select id="language" class="language-control" data-i18n-label="language" aria-label="${t("language")}"><option value="zh-CN" lang="zh-CN" ${locale === "zh-CN" ? "selected" : ""}>中文</option><option value="en" lang="en" ${locale === "en" ? "selected" : ""}>English</option></select>
        <button id="guide-toggle" class="guide-toggle" data-i18n-label="guide" aria-label="${t("guide")}" aria-expanded="false" aria-controls="museum-guide">${icon("book")}<span data-i18n="guide">${t("guide")}</span></button></div>
      </header>
      <div id="offline-note" class="offline-note" data-i18n="offlineNote" hidden>${t("offlineNote")}</div>
      <div class="scene-footer">
        <p class="operation-hint" data-i18n="operationHint">${t("operationHint")}</p>
        <div class="visitor-controls" role="group" data-i18n-label="runAlongGlass" aria-label="${t("runAlongGlass")}"><button id="walk-left" data-i18n-label="runLeft" aria-label="${t("runLeft")}">${icon("arrow")}</button><span>${icon("walk")}<span><span data-i18n="run">${t("run")}</span><small data-i18n="runKeys">${t("runKeys")}</small></span></span><button id="walk-right" data-i18n-label="runRight" aria-label="${t("runRight")}">${icon("arrow")}</button></div>
        <div class="scene-controls"><button id="near-view" title="${t("nearView")}" aria-label="${t("nearView")}" aria-pressed="false">${icon("waves")}</button><button id="reset-view" data-i18n-title="resetView" data-i18n-label="resetView" title="${t("resetView")}" aria-label="${t("resetView")}">${icon("reset")}</button><button id="pause" title="${t("pause")}" aria-label="${t("pause")}" aria-pressed="false">${icon("pause")}</button><button id="immersive" title="${t("enterFullscreen")}" aria-label="${t("enterFullscreen")}" aria-pressed="false">${icon("expand")}</button></div>
      </div>
      <p id="fullscreen-notice" class="fullscreen-notice" role="status" hidden></p>
      <aside id="museum-guide" class="sidebar" data-i18n-label="guide" aria-label="${t("guide")}" hidden>
        <div class="guide-heading"><h2 data-i18n="guide">${t("guide")}</h2><button id="guide-close" class="icon-button" data-i18n-label="closeGuide" aria-label="${t("closeGuide")}">${icon("close")}</button></div>
        <section id="detail" class="detail" hidden aria-live="polite"></section>
        <section class="session-section"><div class="section-title"><h2 data-i18n="visitors">${t("visitors")}</h2><span id="session-total">${t("activeSessions", { count: 0 })}</span></div><div class="summary"><span><strong id="main-count">0</strong><span data-i18n="mainFish">${t("mainFish")}</span></span><span><strong id="activity-count">0</strong><span data-i18n="followerFish">${t("followerFish")}</span></span></div><div id="session-list" class="session-list"></div><p id="session-empty" class="quiet-note" data-i18n="emptySessions">${t("emptySessions")}</p></section>
        <section class="scenery-settings"><fieldset id="scenery-presets"><legend data-i18n="scenery">${t("scenery")}</legend><div class="scenery-grid">${(Object.keys(SCENERY_PRESETS) as SceneryStyle[]).map(sceneryCard).join("")}</div></fieldset><p id="scenery-status" class="quiet-note" role="status" hidden></p></section>
        <section class="appearance-settings"><div class="section-title"><h2 data-i18n="appearance">${t("appearance")}</h2></div>
          <fieldset id="player-models"><legend data-i18n="player">${t("player")}</legend><div class="character-grid player-grid">${Object.keys(PLAYER_MODELS).filter(isPlayerId).map(id => characterCard("player", id, playerName(id, locale))).join("")}</div></fieldset>
          <fieldset id="companion-models"><legend data-i18n="companion">${t("companion")}</legend>
            <div class="companion-filters"><label for="companion-search" data-i18n="searchCompanions">${t("searchCompanions")}</label><input id="companion-search" type="search" data-i18n-placeholder="searchPlaceholder" placeholder="${t("searchPlaceholder")}" aria-controls="companion-grid"><label for="companion-species" data-i18n="species">${t("species")}</label><select id="companion-species" aria-controls="companion-grid"><option value="" data-i18n="allSpecies">${t("allSpecies")}</option>${companionSpecies.map(species => `<option value="${escapeHtml(species)}">${escapeHtml(companionSpeciesName(species, locale))}</option>`).join("")}</select></div>
            <p id="companion-current" class="quiet-note"></p><p id="companion-results" class="quiet-note" role="status"></p>
            <div id="companion-grid" class="character-grid"></div><button id="companion-more" class="companion-more" type="button" aria-controls="companion-grid" data-i18n="loadMore" hidden>${t("loadMore")}</button>
          </fieldset>
          <p id="appearance-status" class="quiet-note" role="status" hidden></p>
        </section>
        <section class="settings"><div class="section-title"><h2 data-i18n="atmosphere">${t("atmosphere")}</h2></div><label for="light"><span data-i18n="light">${t("light")}</span><span id="light-value">100%</span></label><input id="light" type="range" min="45" max="140" value="100"><label for="flow"><span data-i18n="flow">${t("flow")}</span><span id="flow-value">${t("gentle")}</span></label><input id="flow" type="range" min="0" max="180" value="80"></section>
        <section class="field-guide"><div class="section-title"><h2 data-i18n="fieldGuide">${t("fieldGuide")}</h2><span id="fish-total">${t("fishTotal", { count: FISH_TYPES.length })}</span></div><div class="fish-guide">${fishGuide()}</div></section>
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
  const species = mode === "demo" ? speciesForExhibit(session.id) : speciesForSession(session.id);
  detail.innerHTML = `<div class="detail-heading"><span style="color:${MUSEUM_SPECIES[species].color}">${escapeHtml(fishName(species, locale))}</span><button id="close-detail" class="icon-button" aria-label="${t("closeDetail")}">${icon("close")}</button></div><h3>${escapeHtml(session.label)}</h3><p class="detail-status"><span class="status-dot status-${session.status}"></span>${t(session.status)}</p><div class="activity-list">${session.activities.length ? session.activities.map((activity) => `<div class="activity-row">${fishIcon(ACTIVITY_FISH[activity.category])}<span>${escapeHtml(activity.label)}<small>${t(activity.kind === "agent" ? "agent" : "tool")} · ${t(activity.status === "waiting" ? "activityWaiting" : "activityRunning")}</small></span></div>`).join("") : `<p class="quiet-note">${t("noActivities")}</p>`}</div>`;
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
  const element = required<HTMLElement>("#connection");
  element.className = `connection ${mode === "demo" ? "demo" : connection}`;
  element.innerHTML = `<span class="status-dot"></span><span>${t(mode === "demo" ? "demoConnection" : connection)}</span>`;
  required<HTMLElement>("#offline-note").hidden = mode === "demo" || connection !== "offline";
  aquarium?.setDisconnected(mode === "live" && connection !== "connected");
}

function renderSnapshot(value: AquariumSnapshot) {
  const sessions = value.sessions.filter(isActiveSession);
  shownSnapshot = { ...value, sessions };
  renderAquariumSessions();
  renderSessionList();
}

function renderAquariumSessions() {
  aquarium?.setSessions(shownSnapshot.sessions, mode === "demo");
}

function renderSessionList() {
  const { sessions } = shownSnapshot;
  const activities = sessions.reduce((total, session) => total + session.activities.length, 0);
  required<HTMLElement>("#main-count").textContent = String(sessions.length);
  required<HTMLElement>("#activity-count").textContent = String(activities);
  required<HTMLElement>("#session-total").textContent = t(sessions.length === 1 ? "activeSession" : "activeSessions", { count: sessions.length });
  required<HTMLElement>("#session-empty").hidden = sessions.length > 0;
  const list = required<HTMLElement>("#session-list");
  const focusedId = document.activeElement instanceof HTMLButtonElement ? document.activeElement.dataset.session : undefined;
  list.innerHTML = sessions.map((session) => `<button class="session-row" data-session="${escapeHtml(session.id)}" aria-pressed="${session.id === selectedId}">${fishIcon((mode === "demo" ? speciesForExhibit : speciesForSession)(session.id))}<span class="session-copy"><strong>${escapeHtml(session.label)}</strong><span><i class="status-dot status-${session.status}"></i>${t(session.status)}${session.activities.length ? `<span class="follower-count">${t("followers", { count: session.activities.length })}</span>` : ""}</span></span>${icon("arrow")}</button>`).join("");
  for (const button of list.querySelectorAll<HTMLButtonElement>(".session-row")) button.addEventListener("click", () => selectSession(button.dataset.session ?? null));
  if (focusedId) [...list.querySelectorAll<HTMLButtonElement>(".session-row")].find((button) => button.dataset.session === focusedId)?.focus({ preventScroll: true });
  if (selectedId && !selectedSession()) selectSession(null);
  renderDetail();
}

function renderDemo() {
  renderDemoGroup();
  renderSnapshot(demoSnapshot(demoTick, locale));
}

function renderDemoGroup() {
  required<HTMLButtonElement>("#demo-next").textContent = t("nextGroup", { group: demoGroup(demoTick) + 1, total: DEMO_GROUP_COUNT });
}

function setMode(value: "live" | "demo") {
  mode = value;
  clearInterval(demoTimer);
  demoTimer = undefined;
  selectSession(null);
  for (const name of ["live", "demo"] as const) {
    const button = required<HTMLButtonElement>(`#${name}-mode`);
    button.classList.toggle("active", mode === name);
    button.setAttribute("aria-pressed", String(mode === name));
  }
  renderConnection();
  required<HTMLButtonElement>("#demo-next").hidden = mode !== "demo";
  if (mode === "live") {
    renderSnapshot(snapshot);
    return;
  }
  renderDemo();
  demoTimer = setInterval(() => {
    if (paused) return;
    demoTick += 1;
    renderDemo();
  }, 2400);
}

function renderPause() {
  const button = required<HTMLButtonElement>("#pause");
  button.innerHTML = icon(paused ? "play" : "pause");
  button.setAttribute("aria-pressed", String(paused));
  button.setAttribute("aria-label", t(paused ? "resume" : "pause"));
  button.title = t(paused ? "resume" : "pause");
  aquarium?.setPaused(paused);
}

async function initializeAquarium() {
  try {
    required<HTMLElement>("#viewport").innerHTML = `<div class="render-error" role="status"><p data-i18n="loadingModels">${t("loadingModels")}</p></div>`;
    await initSwimming();
    const assets = await loadMuseumAssets(appearance);
    if (destroyed) { assets.dispose(); return; }
    required<HTMLElement>("#viewport").replaceChildren();
    try {
      aquarium = createAquarium(required<HTMLElement>("#viewport"), selectSession, assets, sceneryStyle);
    } catch (error) {
      assets.dispose();
      throw error;
    }
    aquarium.setLight(required<HTMLInputElement>("#light").valueAsNumber / 100);
    aquarium.setFlow(required<HTMLInputElement>("#flow").valueAsNumber / 100);
    aquarium.resetView(nearView);
    try {
      const previews = createSceneryPreviews(assets.scenery);
      for (const image of document.querySelectorAll<HTMLImageElement>("[data-scenery-preview]")) {
        image.src = previews[parseSceneryStyle(image.dataset.sceneryPreview)];
        image.hidden = false;
      }
    } catch (error) {
      console.error("无法生成造景预览", error);
    }
  } catch (error) {
    required<HTMLElement>("#viewport").innerHTML = `<div class="render-error"><h2 data-i18n="renderFailed">${t("renderFailed")}</h2><p data-i18n="renderHelp">${t("renderHelp")}</p></div>`;
    console.error("鱼缸初始化失败", error);
  }
}

required<HTMLButtonElement>("#live-mode").addEventListener("click", () => setMode("live"));
required<HTMLButtonElement>("#demo-mode").addEventListener("click", () => setMode("demo"));
let nearView = false;
const nearButton = required<HTMLButtonElement>("#near-view");
function setNearView(value: boolean) {
  nearView = value;
  aquarium?.resetView(value);
  renderNearView();
}
function renderNearView() {
  nearButton.setAttribute("aria-pressed", String(nearView));
  nearButton.setAttribute("aria-label", t(nearView ? "wideView" : "nearView"));
  nearButton.title = t(nearView ? "wideView" : "nearView");
}
required<HTMLButtonElement>("#reset-view").addEventListener("click", () => setNearView(false));
nearButton.addEventListener("click", () => setNearView(!nearView));
required<HTMLButtonElement>("#walk-left").addEventListener("click", () => aquarium?.walk(-1));
required<HTMLButtonElement>("#walk-right").addEventListener("click", () => aquarium?.walk(1));
const sceneryChoices = required<HTMLFieldSetElement>("#scenery-presets");
function renderScenerySelection() {
  for (const input of sceneryChoices.querySelectorAll<HTMLInputElement>("input")) input.checked = input.value === sceneryStyle;
}
sceneryChoices.addEventListener("change", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.type !== "radio") return;
  if (!aquarium) { renderScenerySelection(); return; }
  const next = parseSceneryStyle(input.value);
  if (next === sceneryStyle) return;
  const status = required<HTMLElement>("#scenery-status");
  status.hidden = true;
  try {
    aquarium.setScenery(next);
    sceneryStyle = next;
    try { localStorage.setItem(SCENERY_KEY, sceneryStyle); }
    catch { showStatus(status, "sceneryNotSaved"); }
  } catch (error) {
    showStatus(status, "sceneryFailed");
    console.error("切换水箱造景失败", error);
  }
  renderScenerySelection();
});
const playerChoices = required<HTMLFieldSetElement>("#player-models");
const companionChoices = required<HTMLFieldSetElement>("#companion-models");
const companionSearch = required<HTMLInputElement>("#companion-search");
const companionSpeciesSelect = required<HTMLSelectElement>("#companion-species");
const companionGrid = required<HTMLElement>("#companion-grid");
const companionMore = required<HTMLButtonElement>("#companion-more");
const COMPANION_BATCH_SIZE = 36;
let shownCompanions = 0;
function renderCompanionChoices(reset = false) {
  const models = filterCompanions(companionSearch.value, companionSpeciesSelect.value);
  const start = reset ? 0 : shownCompanions;
  shownCompanions = Math.min(start + COMPANION_BATCH_SIZE, models.length);
  const cards = models.slice(start, shownCompanions).map(model => characterCard("companion", model.id, companionName(model.id, locale), model.portrait)).join("");
  if (reset) companionGrid.innerHTML = characterCard("companion", "none", companionName("none", locale)) + cards;
  if (!reset) companionGrid.insertAdjacentHTML("beforeend", cards);
  companionMore.hidden = shownCompanions >= models.length;
  renderCompanionResults(models.length);
  return companionGrid.children[start + 1]?.querySelector<HTMLInputElement>("input");
}
function renderCompanionResults(count = filterCompanions(companionSearch.value, companionSpeciesSelect.value).length) {
  required<HTMLElement>("#companion-results").textContent = t(count ? "companionResults" : "noCompanions", { count, shown: shownCompanions });
}
function renderAppearanceSelection() {
  for (const [choices, selected] of [[playerChoices, appearance.player], [companionChoices, appearance.companion]] as const) {
    for (const input of choices.querySelectorAll<HTMLInputElement>("input")) input.checked = input.value === selected;
  }
  required<HTMLElement>("#companion-current").textContent = t("currentCompanion", { name: companionName(appearance.companion, locale) });
}
renderCompanionChoices(true);
renderAppearanceSelection();
companionSearch.addEventListener("input", () => renderCompanionChoices(true));
companionSpeciesSelect.addEventListener("change", () => renderCompanionChoices(true));
companionMore.addEventListener("click", () => {
  const keyboardFocus = companionMore.matches(":focus-visible");
  const firstAdded = renderCompanionChoices();
  if (keyboardFocus) firstAdded?.focus({ preventScroll: true });
});
async function changeAppearance(event: Event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.type !== "radio") return;
  if (playerChoices.disabled || companionChoices.disabled) return;
  if (!aquarium) { renderAppearanceSelection(); return; }
  const next: MuseumAppearance = { ...appearance };
  switch (input.name) {
    case "player":
      if (!isPlayerId(input.value)) return;
      next.player = input.value;
      break;
    case "companion":
      if (!isCompanionId(input.value)) return;
      next.companion = input.value;
      break;
    default: return;
  }
  if (next.player === appearance.player && next.companion === appearance.companion) return;
  const focused = document.activeElement;
  const keyboardFocus = focused instanceof HTMLInputElement && focused.matches(":focus-visible");
  const status = required<HTMLElement>("#appearance-status");
  playerChoices.disabled = companionChoices.disabled = true;
  renderAppearanceSelection();
  required<HTMLElement>(".appearance-settings").setAttribute("aria-busy", "true");
  showStatus(status, "loadingModels");
  try {
    if (!await aquarium.setAppearance(next) || destroyed) {
      showStatus(status, "appearanceIncomplete");
      return;
    }
    appearance = next;
    showStatus(status, "appearanceSaved");
    try { localStorage.setItem(APPEARANCE_KEY, JSON.stringify(appearance)); }
    catch { showStatus(status, "appearanceNotSaved"); }
  } catch {
    showStatus(status, "appearanceFailed");
  } finally {
    renderAppearanceSelection();
    playerChoices.disabled = companionChoices.disabled = false;
    required<HTMLElement>(".appearance-settings").setAttribute("aria-busy", "false");
    if (keyboardFocus && document.activeElement === document.body && !required<HTMLElement>("#museum-guide").hidden) {
      revealFullscreenControls();
      focused.focus({ preventScroll: true });
    }
  }
}
playerChoices.addEventListener("change", changeAppearance);
companionChoices.addEventListener("change", changeAppearance);
required<HTMLButtonElement>("#demo-next").addEventListener("click", () => {
  demoTick = (Math.floor(demoTick / DEMO_GROUP_TICKS) + 1) * DEMO_GROUP_TICKS;
  setMode("demo");
});
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
  renderFlow(value);
});
function renderFlow(value = required<HTMLInputElement>("#flow").valueAsNumber) {
  required<HTMLElement>("#flow-value").textContent = t(value === 0 ? "still" : value < 100 ? "gentle" : "lively");
}
const fullscreenPanel = required<HTMLElement>(".aquarium-panel");
const fullscreenButton = required<HTMLButtonElement>("#immersive");
const fullscreenNotice = required<HTMLElement>("#fullscreen-notice");
let controlsTimer: ReturnType<typeof setTimeout> | undefined;
function hideFullscreenControls() {
  clearTimeout(controlsTimer);
  const focused = document.activeElement;
  if (focused?.matches(":focus-visible") && focused.closest(".app-header, .scene-footer, .sidebar")) return;
  fullscreenPanel.classList.remove("controls-visible");
}
function revealFullscreenControls() {
  if (document.fullscreenElement !== fullscreenPanel) return;
  clearTimeout(controlsTimer);
  fullscreenPanel.classList.add("controls-visible");
  controlsTimer = setTimeout(hideFullscreenControls, 2400);
}
function revealKeyboardControls(event: KeyboardEvent) {
  if (event.key === "Tab") revealFullscreenControls();
}
fullscreenPanel.addEventListener("pointermove", revealFullscreenControls);
fullscreenPanel.addEventListener("pointerdown", revealFullscreenControls);
fullscreenPanel.addEventListener("pointerleave", hideFullscreenControls);
document.addEventListener("keydown", revealKeyboardControls);
function renderFullscreen() {
  const active = document.fullscreenElement === fullscreenPanel;
  document.body.classList.toggle("immersive", active);
  clearTimeout(controlsTimer);
  fullscreenPanel.classList.remove("controls-visible");
  renderFullscreenButton();
}
function renderFullscreenButton() {
  const active = document.fullscreenElement === fullscreenPanel;
  fullscreenButton.setAttribute("aria-pressed", String(active));
  fullscreenButton.setAttribute("aria-label", t(active ? "exitFullscreen" : "enterFullscreen"));
  fullscreenButton.title = t(active ? "exitFullscreenHint" : "enterFullscreen");
  fullscreenButton.innerHTML = icon(active ? "collapse" : "expand");
}
function showFullscreenNotice(key: MessageKey) {
  showStatus(fullscreenNotice, key);
}
async function toggleFullscreen() {
  if (fullscreenButton.disabled) return;
  const active = document.fullscreenElement === fullscreenPanel;
  if (!fullscreenPanel.requestFullscreen || !document.exitFullscreen || document.fullscreenEnabled === false) {
    showFullscreenNotice("fullscreenUnsupported");
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
    showFullscreenNotice(active ? "fullscreenExitFailed" : "fullscreenEnterFailed");
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

function renderLocale() {
  renderDocumentLanguage();
  const attributes = { "data-i18n": null, "data-i18n-label": "aria-label", "data-i18n-title": "title", "data-i18n-placeholder": "placeholder" };
  for (const [source, target] of Object.entries(attributes)) {
    for (const element of document.querySelectorAll<HTMLElement>(`[${source}]`)) {
      const key = element.getAttribute(source) as MessageKey;
      if (target) { element.setAttribute(target, t(key)); continue; }
      element.textContent = t(key);
    }
  }
  for (const style of Object.keys(SCENERY_PRESETS) as SceneryStyle[]) {
    const copy = sceneryCopy(style, locale);
    required<HTMLElement>(`[data-scenery-name="${style}"]`).textContent = copy.name;
    required<HTMLElement>(`[data-scenery-description="${style}"]`).textContent = copy.description;
  }
  for (const element of document.querySelectorAll<HTMLElement>("[data-character-id]")) {
    const id = element.dataset.characterId;
    if (element.dataset.characterGroup === "player" && isPlayerId(id)) element.textContent = playerName(id, locale);
    if (element.dataset.characterGroup === "companion" && isCompanionId(id)) element.textContent = companionName(id, locale);
  }
  for (const option of companionSpeciesSelect.options) {
    if (option.value) option.textContent = companionSpeciesName(option.value, locale);
  }
  required<HTMLElement>(".fish-guide").innerHTML = fishGuide();
  required<HTMLElement>("#fish-total").textContent = t("fishTotal", { count: FISH_TYPES.length });
  if (mode === "demo") shownSnapshot = demoSnapshot(demoTick, locale);
  renderSessionList();
  renderConnection();
  renderDemoGroup();
  renderCompanionResults();
  renderAppearanceSelection();
  renderFlow();
  renderNearView();
  renderPause();
  renderFullscreenButton();
}
required<HTMLSelectElement>("#language").addEventListener("change", event => {
  locale = resolveLocale((event.currentTarget as HTMLSelectElement).value, browserLanguages);
  try { localStorage.setItem(LOCALE_KEY, locale); }
  catch { /* 无法保存时，仍可切换本次访问的语言。 */ }
  renderLocale();
});
renderLocale();

function receiveSnapshot(data: string) {
  const value = JSON.parse(data) as AquariumSnapshot;
  if (value.version !== 1 || value.source !== "hooks" || !Array.isArray(value.sessions)) throw new Error("不支持的会话数据格式");
  snapshot = value;
  connection = "connected";
  renderConnection();
  required<HTMLButtonElement>("#demo-next").hidden = mode !== "demo";
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
  document.removeEventListener("keydown", revealKeyboardControls);
  clearTimeout(controlsTimer);
  reducedMotion.removeEventListener("change", motionPreferenceChanged);
  aquarium?.dispose();
}, { once: true });
window.addEventListener("pageshow", (event) => { if (event.persisted) window.location.reload(); });

await initializeAquarium();
if (!destroyed) {
  renderAquariumSessions();
  renderLocale();
}
