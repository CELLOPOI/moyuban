window.__ModuleLoader__.load({ id: "moyuban", factory(require) { const module = { exports: {} };
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.jsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);
var import_react14 = __toESM(require("react"), 1);

// src/sites/nga/boards.js
var board = {
  site: "nga",
  kind: "fid",
  id: "-447601",
  sessionId: "dsh-nga-reader-acg",
  name: "\u4E8C\u6B21\u5143\u56FD\u5BB6\u5730\u7406"
};
function forum(kind, id, name2) {
  if (kind !== "fid" && kind !== "stid") return null;
  if (typeof id !== "number" && typeof id !== "string") return null;
  id = String(id);
  if (!/^-?[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)) || kind === "stid" && id.startsWith("-")) return null;
  const legacy = kind === board.kind && id === board.id;
  return {
    site: "nga",
    kind,
    id,
    sessionId: legacy ? board.sessionId : "dsh-nga-reader-" + kind + "-" + id,
    name: typeof name2 === "string" && name2.trim().slice(0, 120) || (legacy ? board.name : (kind === "fid" ? "\u7248\u9762 " : "\u5408\u96C6 ") + id)
  };
}
function boardForSession(id) {
  if (typeof id !== "string") return null;
  if (id === board.sessionId) return board;
  const match = /^dsh-nga-reader-(fid|stid)-(-?\d+)$/.exec(id);
  const item = match && forum(match[1], match[2]);
  return item?.sessionId === id ? item : null;
}

// src/shared/boards.js
var legacySite = board.site;
var validSlug = (value) => typeof value === "string" && /^[a-z][a-z0-9-]{0,23}$/.test(value);
function entryForSite(site = legacySite) {
  if (!validSlug(site)) return null;
  return { site, sessionId: "dsh-nga-reader-start" + (site === legacySite ? "" : "-" + site), name: site === "xhs" ? "\u9605\u8BFB\u7D22\u5F15" : "\u9009\u62E9\u7248\u9762" };
}
var entry = entryForSite();
function encodeId(value) {
  return Array.from(new TextEncoder().encode(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function boardRef(site, kind, id, name2) {
  if (site === legacySite) return forum(kind, id, name2);
  if (!validSlug(site) || !validSlug(kind) || typeof id !== "string" && !Number.isSafeInteger(id)) return null;
  id = String(id);
  if (!id || !id.isWellFormed() || /[\u0000-\u001f]/.test(id)) return null;
  const encoded = encodeId(id);
  if (encoded.length > 128) return null;
  return {
    site,
    kind,
    id,
    name: typeof name2 === "string" && name2.trim().slice(0, 120) || id,
    sessionId: "dsh-nga-reader-site-" + site + "_" + kind + "_" + encoded
  };
}
function boardForSession2(id) {
  if (id === entry.sessionId) return entry;
  if (typeof id !== "string") return null;
  if (id.startsWith(entry.sessionId + "-")) {
    const ref2 = entryForSite(id.slice(entry.sessionId.length + 1));
    return ref2?.sessionId === id ? ref2 : null;
  }
  const match = /^dsh-nga-reader-site-([a-z][a-z0-9-]{0,23})_([a-z][a-z0-9-]{0,23})_((?:[a-f0-9]{2}){1,64})$/.exec(id);
  if (!match) return boardForSession(id);
  const bytes = Uint8Array.from(match[3].match(/../g), (byte) => parseInt(byte, 16));
  const ref = boardRef(match[1], match[2], new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes));
  return ref?.sessionId === id ? ref : null;
}
function readingPrefix(sessionId) {
  return "dsh-nga-reader.v1." + (sessionId === board.sessionId ? "" : sessionId + ".");
}

// src/shared/errors.js
var ReaderError = class extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
};
var unconfirmedReplyMessage = "\u53D1\u9001\u7ED3\u679C\u672A\u786E\u8BA4\uFF0C\u8BF7\u5237\u65B0\u5E16\u5B50\u6838\u5BF9\u540E\u518D\u51B3\u5B9A\u662F\u5426\u91CD\u53D1\u3002";
function requireReplyReceipt(receipt) {
  if (receipt?.sent !== true) throw new ReaderError("REPLY_UNKNOWN", unconfirmedReplyMessage, 502);
  return receipt;
}

// reader-settings.json
var reader_settings_default = {
  cacheDirectory: "",
  boardDataDirectory: "",
  mediaCacheMiB: 128,
  directoryCacheMinutes: 30,
  favoriteSyncMinutes: 5,
  renderSmiles: true,
  foldImages: true,
  showAuthorUid: true,
  promoteOnPick: true,
  openOnPick: true,
  defaultModel: "DeepSeek-V4.1-Flash",
  defaultEffort: "Low",
  defaultPermission: "\u5B8C\u5168\u6743\u9650"
};

// src/shared/settings.js
var appearanceChoices = {
  model: ["DeepSeek-V4.1-Flash", "DeepSeek-V4-Pro"],
  effort: ["Off", "Low", "High", "Max"],
  permission: ["\u4EC5\u53EF\u67E5\u770B", "\u5DE5\u4F5C\u533A\u5185\u4FEE\u6539", "\u5B8C\u5168\u6743\u9650"]
};
function readingAppearance(value, settings = reader_settings_default) {
  const initial = { model: settings.defaultModel, effort: settings.defaultEffort, permission: settings.defaultPermission };
  return Object.fromEntries(Object.entries(initial).map(([key, fallback]) => [key, appearanceChoices[key].includes(value?.[key]) ? value[key] : fallback]));
}
var sections = [
  ["\u5B58\u50A8", [
    { key: "cacheDirectory", label: "\u7F13\u5B58\u76EE\u5F55", path: true },
    { key: "boardDataDirectory", label: "\u7248\u9762\u6570\u636E\u76EE\u5F55", path: true },
    { key: "mediaCacheMiB", label: "\u56FE\u7247\u548C\u8868\u60C5\u7F13\u5B58\u4E0A\u9650\uFF08MiB\uFF09", min: 0, max: 8192, hint: "\u586B 0 \u65F6\uFF0C\u56FE\u7247\u7531\u9605\u8BFB\u7AEF\u76F4\u63A5\u52A0\u8F7D\u3002" },
    { key: "directoryCacheMinutes", label: "\u516C\u5F00\u76EE\u5F55\u7F13\u5B58\u65F6\u95F4\uFF08\u5206\u949F\uFF09", min: 0, max: 10080 },
    { key: "favoriteSyncMinutes", label: "\u6536\u85CF\u540C\u6B65\u95F4\u9694\uFF08\u5206\u949F\uFF09", min: 1, max: 1440 }
  ]],
  ["\u9605\u8BFB\u663E\u793A", [
    { key: "renderSmiles", label: "\u628A\u8868\u60C5\u663E\u793A\u4E3A\u56FE\u7247", hint: "\u5173\u95ED\u540E\u663E\u793A\u8868\u60C5\u540D\u79F0\u3002" },
    { key: "foldImages", label: "\u628A\u697C\u5C42\u914D\u56FE\u6298\u53E0\u5728\u601D\u8003\u884C\u5185", hint: "\u5173\u95ED\u540E\u914D\u56FE\u968F\u6B63\u6587\u663E\u793A\u3002" },
    { key: "showAuthorUid", label: "\u5728\u4F5C\u8005\u540D\u65C1\u663E\u793A\u516C\u5F00 UID" }
  ]],
  ["\u6311\u9009\u7248\u9762", [
    { key: "promoteOnPick", label: "\u5C06\u521A\u9009\u7684\u7248\u9762\u653E\u5728\u5DE5\u4F5C\u533A\u6700\u4E0A\u65B9", hint: "\u4FDD\u7559\u5168\u90E8\u6536\u85CF\u5165\u53E3\u3002\u5173\u95ED\u540E\u7531\u6536\u85CF\u7248\u9762\u5360\u636E\u7F6E\u9876\u533A\u3002" },
    { key: "openOnPick", label: "\u9009\u597D\u540E\u76F4\u63A5\u6253\u5F00\u7248\u9762", hint: "\u5173\u95ED\u540E\u53EF\u4EE5\u7559\u5728\u76EE\u5F55\u91CC\u8FDE\u7EED\u6311\u9009\u3002" }
  ]],
  ["\u65B0\u9605\u8BFB\u4F1A\u8BDD\u7684\u9ED8\u8BA4\u503C", [
    { key: "defaultModel", label: "\u6A21\u578B\u5916\u89C2", choices: appearanceChoices.model },
    { key: "defaultEffort", label: "\u601D\u8003\u5F3A\u5EA6\u5916\u89C2", choices: appearanceChoices.effort },
    { key: "defaultPermission", label: "\u6743\u9650\u5916\u89C2", choices: appearanceChoices.permission }
  ]]
];

// src/client/reader.js
var blank = () => ({ text: "", quote: null });
function clearStoredReading(storage, sessionId, memoryKeys = []) {
  const prefix = readingPrefix(sessionId);
  const readingKey = /^(?:nav|page|draft|scroll|expanded)\.(?:live|example)(?:\.|$)/;
  try {
    const keys = new Set(Array.from(memoryKeys, (key) => prefix + key));
    for (let index = 0; index < storage.length; index++) keys.add(storage.key(index));
    for (const key of keys) {
      if (key?.startsWith(prefix) && readingKey.test(key.slice(prefix.length))) storage.removeItem(key);
    }
  } catch (error) {
    if (error.name !== "SecurityError") throw error;
  }
}
function createReader(request, storage, board2, site, settings = reader_settings_default) {
  if (!site || board2.site !== site.id) throw new Error("Reader site does not match its board");
  const prefix = readingPrefix(board2.sessionId);
  const entryOnly = !board2.kind;
  const { capabilities } = site;
  const api = (action, fields, signal) => request(action, { ...fields, site: site.id, board: board2.sessionId }, signal);
  const memory = /* @__PURE__ */ new Map();
  let retired = false;
  function read(key, fallback) {
    if (memory.has(key)) return memory.get(key);
    try {
      return JSON.parse(storage.getItem(prefix + key)) ?? fallback;
    } catch {
      return fallback;
    }
  }
  function write(key, value) {
    if (retired) return;
    memory.set(key, value);
    try {
      if (value === null) storage.removeItem(prefix + key);
      else storage.setItem(prefix + key, JSON.stringify(value));
    } catch {
    }
  }
  const listeners = /* @__PURE__ */ new Set();
  const sending = /* @__PURE__ */ new Set();
  let listVersion = 0;
  let threadVersion = 0;
  let accountVersion = 0;
  let initialized = false;
  const initialNav = read("nav.live", {});
  let state = {
    listPage: initialNav.listPage || 1,
    id: initialNav.id || 0,
    page: initialNav.page || 1,
    targetId: initialNav.targetId || 0,
    list: null,
    thread: null,
    listError: "",
    threadError: "",
    notice: "",
    noticeError: false,
    query: "",
    account: { connected: false },
    loadingList: false,
    loadingThread: false,
    sending: false,
    draft: blank(),
    appearance: readingAppearance(read("appearance", null), settings)
  };
  const set = (patch) => {
    state = { ...state, ...patch };
    for (const notify of listeners) notify();
  };
  const draftKey = (id) => "draft.live." + id;
  const draftOf2 = (id) => read(draftKey(id), null) || blank();
  function clearSentDraft(key, submitted) {
    if (retired) return;
    const sent = JSON.stringify(submitted);
    if (memory.has(key) && JSON.stringify(memory.get(key)) !== sent) return;
    memory.delete(key);
    if (JSON.stringify(read(key, null)) === sent) write(key, null);
  }
  const saveNav = () => write("nav.live", { listPage: state.listPage, id: state.id, targetId: state.targetId, page: state.page });
  const current = (id) => !retired && state.id === id;
  async function loadList(page = state.listPage) {
    const version = ++listVersion;
    set({ listPage: page, list: null, listError: "", loadingList: true, ...page !== state.listPage && { query: "" } });
    saveNav();
    try {
      const list = await api("topics", { mode: "live", page });
      if (version === listVersion) {
        set({ list, loadingList: false });
        if (state.targetId === state.id && list.items?.some((item) => item.entryId === state.id)) {
          void open(state.id, state.page, { keepNotice: true });
        }
      }
    } catch (error) {
      if (version === listVersion) set({ listError: error.message, loadingList: false });
    }
  }
  async function open(id, page, { keepNotice = false } = {}) {
    const version = ++threadVersion;
    page ??= read("page.live." + id, 1);
    const item = state.list?.items?.find((row2) => (row2.entryId ?? row2.id) === id);
    const targetId = item?.id ?? (state.id === id && state.targetId || id);
    set({
      id,
      targetId,
      page,
      thread: null,
      threadError: "",
      loadingThread: true,
      draft: draftOf2(id),
      sending: sending.has(draftKey(id)),
      ...keepNotice ? {} : { notice: "" }
    });
    saveNav();
    try {
      const thread = await api("thread", { mode: "live", id: targetId, page });
      if (version === threadVersion) {
        set({ thread, targetId: thread.id, page: thread.page, loadingThread: false });
        write("page.live." + id, thread.page);
        saveNav();
      }
    } catch (error) {
      if (version === threadVersion) set({ threadError: error.message, loadingThread: false });
    }
  }
  async function syncAccount() {
    if (!capabilities.login || capabilities.followed) return;
    const version = ++accountVersion;
    try {
      const account = await api("account");
      if (version === accountVersion) set({ account });
    } catch (error) {
      if (version === accountVersion) set({ notice: error.message, noticeError: true });
    }
  }
  function reload() {
    const { id, page, targetId } = state;
    const listing = loadList();
    if (!id) return listing;
    if (targetId) return open(id, page, { keepNotice: true });
    const version = ++threadVersion;
    set({ loadingThread: true, draft: draftOf2(id) });
    return listing.then(() => {
      if (version === threadVersion && current(id)) return open(id, page, { keepNotice: true });
    });
  }
  function showList() {
    ++threadVersion;
    set({ id: 0, targetId: 0, page: 1, thread: null, loadingThread: false, threadError: "", draft: blank(), sending: false, notice: "" });
    saveNav();
  }
  function draft(patch) {
    if (!state.id) return;
    const value = { ...state.draft, ...patch };
    write(draftKey(state.id), value.text || value.quote ? value : null);
    set({ draft: value });
  }
  async function submit() {
    const { id, draft: original, thread } = state;
    const key = draftKey(id);
    if (!capabilities.reply || !thread || !original.text.trim() || sending.has(key)) return;
    sending.add(key);
    set({ sending: true, notice: "", noticeError: false });
    try {
      const result = await api("reply", { mode: "live", id: thread.id, text: original.text, quote: capabilities.quote ? original.quote : null, requestId: crypto.randomUUID() });
      requireReplyReceipt(result);
      clearSentDraft(key, original);
      if (!current(id)) return;
      set({ draft: draftOf2(id), notice: site.name + " \u5DF2\u786E\u8BA4\u56DE\u5E16\u3002", noticeError: false });
      void loadList();
      let page = result.page;
      if (!page) {
        try {
          page = (await api("thread", { mode: "live", id: thread.id, page: 1 })).pages;
        } catch {
          page = thread.pages;
        }
      }
      if (current(id)) await open(id, page, { keepNotice: true });
    } catch (error) {
      if (current(id)) set({ notice: error.message, noticeError: true });
    } finally {
      sending.delete(key);
      if (current(id)) set({ sending: false });
    }
  }
  return {
    site,
    api,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    snapshot: () => state,
    clearReading(clearStorage = true) {
      retired = true;
      ++listVersion;
      ++threadVersion;
      ++accountVersion;
      try {
        if (clearStorage) clearStoredReading(storage, board2.sessionId, memory.keys());
      } finally {
        memory.clear();
        set({ id: 0, targetId: 0, list: null, thread: null, draft: blank(), sending: false });
      }
    },
    activate() {
      void syncAccount();
      if (!initialized && !entryOnly) {
        initialized = true;
        return reload();
      }
    },
    invalidateAccount() {
      ++accountVersion;
      ++listVersion;
      ++threadVersion;
      initialized = false;
      set({
        list: null,
        thread: null,
        listError: "",
        threadError: "",
        notice: "",
        account: { connected: false },
        loadingList: false,
        loadingThread: false
      });
    },
    reload,
    loadList,
    open,
    showList,
    draft,
    submit,
    setAppearance(key, value) {
      if (!Object.hasOwn(appearanceChoices, key) || !appearanceChoices[key].includes(value)) return;
      const next = { ...state.appearance, [key]: value };
      write("appearance", next);
      set({ appearance: next });
    },
    filter: (query) => set({ query }),
    expanded(id, page, next) {
      const key = "expanded.live." + id + "." + page;
      if (next === void 0) return read(key, []);
      write(key, next);
    },
    async authChanged() {
      await syncAccount();
      if (entryOnly) return;
      initialized = true;
      reload();
    },
    scroll(id, page, top) {
      const key = "scroll.live." + id + "." + page;
      if (top === void 0) return read(key, 0);
      write(key, Math.round(top));
    }
  };
}

// src/client/host-api.js
var route = "/api/dsh-nga-reader";
function mediaAddress(site, url) {
  return route + ".media?" + new URLSearchParams({ site, url });
}
async function call(action, fields = {}, signal) {
  let response;
  try {
    response = await fetch(route, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...fields, action }),
      signal
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error(action === "reply" ? unconfirmedReplyMessage : "\u4E0E DSH \u7684\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u8BF7\u91CD\u8BD5\u3002");
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(action === "reply" ? unconfirmedReplyMessage : "\u65E0\u6CD5\u8FDE\u63A5\u9605\u8BFB\u63D2\u4EF6\uFF0C\u8BF7\u68C0\u67E5\u5B83\u662F\u5426\u5DF2\u5728\u5F53\u524D DSH \u542F\u7528\u3002");
  }
  if (!response.ok) {
    const message = result?.message || (action === "reply" ? unconfirmedReplyMessage : "\u8BF7\u6C42\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002");
    throw Object.assign(new Error(message), { code: result?.error });
  }
  return result;
}

// src/client/transcript.jsx
var import_react5 = __toESM(require("react"), 1);
var import_dsh_client_ui_primitives3 = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/floor.js
function sliceText(block, start, end) {
  const text = block.text.slice(start, end);
  if (!block.runs) return { ...block, text };
  let offset = 0;
  const runs = [];
  for (const run of block.runs) {
    const next = offset + run.text.length;
    if (next > start && offset < end) runs.push({ ...run, text: run.text.slice(Math.max(0, start - offset), end - offset) });
    offset = next;
  }
  return { ...block, text, runs };
}
function floorParts(blocks, foldImages = true) {
  const context = [], output = [];
  const firstText = blocks.findIndex((block) => block.kind === "text");
  const leadingQuote = firstText >= 0 && blocks.slice(0, firstText).some((block) => block.kind === "quote");
  for (const [index, block] of blocks.entries()) {
    if (block.kind === "image") {
      if (foldImages) context.push(block);
      else output.push(block);
      continue;
    }
    if (leadingQuote && index < firstText) {
      context.push(block);
      continue;
    }
    if (!leadingQuote && index === firstText) {
      const boundary = /\n[\t ]*\n+/.exec(block.text) ?? /\n/.exec(block.text);
      if (boundary && boundary.index > 0 && boundary.index + boundary[0].length < block.text.length) {
        context.push(sliceText(block, 0, boundary.index));
        output.push(sliceText(block, boundary.index + boundary[0].length, block.text.length));
        continue;
      }
    }
    output.push(block);
  }
  return { context, output };
}

// src/client/smile.jsx
var import_react2 = __toESM(require("react"), 1);

// src/client/preferences.jsx
var import_react = __toESM(require("react"), 1);
var ReadingOptions = (0, import_react.createContext)(reader_settings_default);
function WithSettings({ source, children }) {
  const state = (0, import_react.useSyncExternalStore)(source.subscribe, source.snapshot);
  (0, import_react.useEffect)(() => {
    void source.load();
  }, [source]);
  if (!state.revision) return /* @__PURE__ */ import_react.default.createElement("p", { className: "ngar ngar-hint", role: "status" }, state.warning || "\u6B63\u5728\u8BFB\u53D6\u9605\u8BFB\u8BBE\u7F6E\u2026", state.warning && /* @__PURE__ */ import_react.default.createElement("button", { onClick: () => void source.load(true) }, "\u91CD\u65B0\u8BFB\u53D6"));
  return /* @__PURE__ */ import_react.default.createElement(ReadingOptions.Provider, { value: state.values }, children(state.values));
}

// src/client/smile.jsx
function ForumImage({ site, url, alt, fallback, ...props }) {
  const { mediaCacheMiB } = (0, import_react2.useContext)(ReadingOptions);
  const first = mediaCacheMiB && site.capabilities.media ? mediaAddress(site.id, url) : url;
  const [miss, setMiss] = (0, import_react2.useState)(null);
  const [failed, setFailed] = (0, import_react2.useState)(null);
  const src = miss === first ? url : first;
  if (!url || failed === src) return fallback;
  return /* @__PURE__ */ import_react2.default.createElement(
    "img",
    {
      ...props,
      src,
      alt,
      loading: "lazy",
      decoding: "async",
      referrerPolicy: "no-referrer",
      onError: () => {
        if (src === url) setFailed(src);
        else setMiss(src);
      }
    }
  );
}
function Smile({ site, url, label }) {
  const { renderSmiles } = (0, import_react2.useContext)(ReadingOptions);
  return renderSmiles ? /* @__PURE__ */ import_react2.default.createElement(ForumImage, { className: "ngar-smile", site, url, alt: label, fallback: label }) : label;
}

// src/client/directory.jsx
var import_react4 = __toESM(require("react"), 1);
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

// src/sites/tieba/forum.js
var followedCategory = { key: "followed", name: "\u6211\u5173\u6CE8\u7684\u5427", kind: "followed", groups: [] };

// src/client/account.jsx
var import_react3 = __toESM(require("react"), 1);
function AccountDialog({ reader, account, onClose, onChange }) {
  const { api, site } = reader;
  const dialog = (0, import_react3.useRef)(null);
  const [revision, setRevision] = (0, import_react3.useState)(0);
  const [qr, setQr] = (0, import_react3.useState)("");
  const [error, setError] = (0, import_react3.useState)("");
  const [busy, setBusy] = (0, import_react3.useState)(false);
  const [scanned, setScanned] = (0, import_react3.useState)(false);
  (0, import_react3.useEffect)(() => {
    dialog.current.showModal();
  }, []);
  (0, import_react3.useEffect)(() => {
    if (account.connected) return;
    const controller = new AbortController();
    const signal = controller.signal;
    let timer, ticketId;
    setQr("");
    setError("");
    setScanned(false);
    async function start() {
      const ticket = await api("login", {}, signal);
      if (signal.aborted) return;
      ticketId = ticket.id;
      setQr(ticket.image);
      async function poll() {
        try {
          if (Date.now() >= ticket.expiresAt) throw new Error("\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u83B7\u53D6\u3002");
          const result = await api("poll", { id: ticket.id }, signal);
          if (signal.aborted) return;
          if (result.state === "connected") {
            ticketId = null;
            await onChange();
            onClose();
            return;
          }
          if (result.state === "scanned") setScanned(true);
          timer = setTimeout(poll, 2400);
        } catch (err) {
          if (!signal.aborted) {
            setError(err.message);
            setQr("");
          }
        }
      }
      timer = setTimeout(poll, 2200);
    }
    void start().catch((err) => {
      if (!signal.aborted) setError(err.message);
    });
    return () => {
      controller.abort();
      clearTimeout(timer);
      if (site.capabilities?.followed && ticketId) void api("cancelLogin", { id: ticketId }).catch(() => {
      });
    };
  }, [revision, account.connected, api]);
  async function logout() {
    setBusy(true);
    try {
      await api("logout");
      await onChange();
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }
  return /* @__PURE__ */ import_react3.default.createElement("dialog", { ref: dialog, className: "ngar-dialog", "aria-label": site.name + " \u8D26\u53F7", onCancel: onClose }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "ngar-dialog-head" }, /* @__PURE__ */ import_react3.default.createElement("h2", null, account.connected ? site.name + " \u8D26\u53F7" : "\u8FDE\u63A5 " + site.name), /* @__PURE__ */ import_react3.default.createElement("button", { onClick: onClose, "aria-label": "\u5173\u95ED\u8D26\u53F7\u7A97\u53E3" }, "\xD7")), account.connected ? /* @__PURE__ */ import_react3.default.createElement(import_react3.default.Fragment, null, /* @__PURE__ */ import_react3.default.createElement("p", null, "\u5F53\u524D\u8D26\u53F7\u3000", /* @__PURE__ */ import_react3.default.createElement("strong", null, account.name)), /* @__PURE__ */ import_react3.default.createElement("button", { className: "ngar-btn", onClick: logout, disabled: busy }, "\u65AD\u5F00\u8D26\u53F7")) : /* @__PURE__ */ import_react3.default.createElement(import_react3.default.Fragment, null, (!error || !site.capabilities?.followed) && /* @__PURE__ */ import_react3.default.createElement("p", null, scanned ? "\u5DF2\u626B\u7801\uFF0C\u8BF7\u5728\u624B\u673A\u4E0A\u786E\u8BA4\u767B\u5F55\u3002" : "\u7528" + (site.capabilities?.followed ? "\u767E\u5EA6 App" : site.name + " \u5BA2\u6237\u7AEF") + "\u626B\u7801\uFF0C\u5E76\u5728\u624B\u673A\u4E0A\u786E\u8BA4\u767B\u5F55\u3002"), qr ? /* @__PURE__ */ import_react3.default.createElement("img", { className: "ngar-qr", alt: site.name + " \u767B\u5F55\u4E8C\u7EF4\u7801", src: qr }) : !error && /* @__PURE__ */ import_react3.default.createElement("p", { role: "status" }, "\u6B63\u5728\u83B7\u53D6\u4E8C\u7EF4\u7801\u2026"), error && /* @__PURE__ */ import_react3.default.createElement("button", { className: "ngar-btn", onClick: () => setRevision(revision + 1) }, "\u91CD\u65B0\u83B7\u53D6\u4E8C\u7EF4\u7801")), error && /* @__PURE__ */ import_react3.default.createElement("p", { role: "alert" }, error));
}

// src/client/directory.jsx
var directoryKind = "dsh-nga-reader-category";
var addressPrefix = "dsh-resource://dsh-nga-reader/category/";
var fileName = (category) => category.name + ".ts";
function categoryAddress(site, category) {
  const scope = site === legacySite ? "" : site + "/";
  return addressPrefix + scope + encodeURIComponent(category.key) + "/" + encodeURIComponent(fileName(category));
}
var categoryTab = {
  id: directoryKind,
  kind: directoryKind,
  patterns: [addressPrefix + "**"],
  title: (address) => decodeURIComponent(address.split("/").at(-1))
};
function directorySource(fetchDirectory, settings = () => ({ values: { directoryCacheMinutes: 30 }, revision: "" }), disk = false) {
  const listeners = /* @__PURE__ */ new Set();
  let state = { categories: [], error: "", loading: false, ready: false }, pending, loadedAt = 0, lastRevision;
  function set(patch) {
    state = { ...state, ...patch };
    for (const notify of listeners) notify();
  }
  let version = 0, watching = 0, timer;
  function accept(result) {
    ++version;
    set({ ...result, ready: true, loading: false, error: "" });
  }
  function load() {
    const { values, revision } = settings();
    if (pending || !disk && lastRevision === revision && Date.now() - loadedAt < values.directoryCacheMinutes * 6e4) return pending;
    const id = version;
    if (!state.ready) set({ loading: true, error: "" });
    pending = fetchDirectory().then((result) => {
      if (version !== id) return;
      loadedAt = Date.now();
      lastRevision = revision;
      if (!disk || state.revision !== result.revision || state.error) accept(result);
    }).catch((error) => {
      if (id === version) set({ error: error.message, loading: false });
    }).finally(() => {
      pending = void 0;
    });
    return pending;
  }
  function watch() {
    void load();
    if (!disk) return;
    function refresh() {
      if (!document.hidden) void load();
    }
    if (++watching === 1) {
      timer = setInterval(refresh, 2500);
      window.addEventListener("focus", load);
    }
    return () => {
      if (--watching === 0) {
        clearInterval(timer);
        window.removeEventListener("focus", load);
      }
    };
  }
  return { load, accept, watch, snapshot: () => state, subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  } };
}
function useDirectory(source) {
  const state = (0, import_react4.useSyncExternalStore)(source.subscribe, source.snapshot);
  (0, import_react4.useEffect)(() => source.watch(), [source]);
  return state;
}
function ReadStatus({ state, retry }) {
  if (state.error) return /* @__PURE__ */ import_react4.default.createElement("p", { className: "ngar-hint", role: "alert" }, state.error, " ", /* @__PURE__ */ import_react4.default.createElement("button", { type: "button", onClick: retry }, "\u91CD\u65B0\u8BFB\u53D6"));
  if (!state.categories.length) return /* @__PURE__ */ import_react4.default.createElement("p", { className: "ngar-hint", role: "status" }, state.ready && !state.loading ? "\u8FD9\u4E2A\u7AD9\u70B9\u5F53\u524D\u6CA1\u6709\u53EF\u9009\u5206\u7C7B\u3002" : "\u6B63\u5728\u8BFB\u53D6\u5206\u7C7B\u2026");
  return null;
}
function CategoryCards({ library, site }) {
  return /* @__PURE__ */ import_react4.default.createElement("section", { className: "ngar ngar-directory", "aria-label": "\u7248\u9762\u5206\u7C7B" }, /* @__PURE__ */ import_react4.default.createElement("div", { className: "ngar-prompt" }, /* @__PURE__ */ import_react4.default.createElement("div", { className: "ngar-bubble" }, "\u6574\u7406\u4E00\u4E0B\u8D44\u6599\u76EE\u5F55\u3002")), site.capabilities.directory && /* @__PURE__ */ import_react4.default.createElement(SiteCards, { key: site.id, site, library }));
}
function SiteCards({ site, library }) {
  const source = library.directory(site.id);
  const state = useDirectory(source);
  const categories = site.capabilities.followed && !state.categories.some((c) => c.kind === "followed") ? [followedCategory, ...state.categories] : state.categories;
  return /* @__PURE__ */ import_react4.default.createElement(import_react4.default.Fragment, null, /* @__PURE__ */ import_react4.default.createElement(ReadStatus, { state, retry: source.load }), /* @__PURE__ */ import_react4.default.createElement("div", { className: "ngar-files" }, categories.map((category) => /* @__PURE__ */ import_react4.default.createElement(
    "button",
    {
      type: "button",
      key: category.key,
      className: "ngar-file",
      onClick: () => library.preview(site.id, category),
      "aria-label": "\u5728\u4FA7\u680F\u9884\u89C8" + category.name
    },
    /* @__PURE__ */ import_react4.default.createElement(import_dsh_client_ui_primitives.FileTypeIcon, { path: fileName(category), size: 28 }),
    /* @__PURE__ */ import_react4.default.createElement("span", null, /* @__PURE__ */ import_react4.default.createElement("strong", null, fileName(category)), /* @__PURE__ */ import_react4.default.createElement("small", null, category.kind === "followed" ? "\u67E5\u770B\u5F53\u524D\u767E\u5EA6\u8D26\u53F7\u5173\u6CE8\u7684\u5427" : category.error ? "\u6587\u4EF6\u683C\u5F0F\u6709\u8BEF" : category.groups.length + " \u4E2A\u5206\u7EC4 \xB7 " + category.groups.reduce((sum, group) => sum + group.boards.length, 0) + " \u4E2A\u6761\u76EE")),
    /* @__PURE__ */ import_react4.default.createElement(import_dsh_client_ui_primitives.IconChevronRightOutlineRegular, { size: 15 })
  ))));
}
function CategoryListing({ category, library, generation }) {
  const catalog = (0, import_react4.useSyncExternalStore)(library.subscribe, library.snapshot);
  const [query, setQuery] = (0, import_react4.useState)(""), [adding, setAdding] = (0, import_react4.useState)(""), [message, setMessage] = (0, import_react4.useState)("");
  const pending = (0, import_react4.useRef)(null);
  (0, import_react4.useEffect)(() => () => pending.current?.abort(), []);
  const term = query.trim().toLocaleLowerCase();
  const groups = category.groups.map((group) => {
    if (!term || group.name.toLocaleLowerCase().includes(term)) return group;
    return { ...group, boards: group.boards.filter((ref) => (ref.name + " " + ref.kind + "=" + ref.id).toLocaleLowerCase().includes(term)) };
  }).filter((group) => group.boards.length);
  const favorites = new Set(catalog.favorites), included = new Set(catalog.boards.map((ref) => ref.sessionId));
  async function add(ref) {
    const controller = new AbortController();
    pending.current = controller;
    setAdding(ref.sessionId);
    setMessage("");
    try {
      await library.add(ref, controller.signal, generation);
      if (!controller.signal.aborted) setMessage(ref.name + "\u5DF2\u52A0\u5165\u5DE5\u4F5C\u533A\u3002");
    } catch (error) {
      if (!controller.signal.aborted) setMessage(error.message);
    } finally {
      if (!controller.signal.aborted) setAdding("");
    }
  }
  return /* @__PURE__ */ import_react4.default.createElement(import_react4.default.Fragment, null, /* @__PURE__ */ import_react4.default.createElement("label", { className: "ngar-source-search" }, /* @__PURE__ */ import_react4.default.createElement(
    "input",
    {
      type: "search",
      placeholder: "\u7B5B\u9009\u5B50\u7248\u9762\u2026",
      "aria-label": "\u7B5B\u9009\u5F53\u524D\u5206\u7C7B\u7684\u5B50\u7248\u9762",
      value: query,
      onChange: (event) => setQuery(event.target.value)
    }
  )), /* @__PURE__ */ import_react4.default.createElement("div", { className: "ngar-code", "aria-label": category.name + "\u7684\u5B50\u7248\u9762" }, /* @__PURE__ */ import_react4.default.createElement("div", { className: "ngar-code-line" }, /* @__PURE__ */ import_react4.default.createElement("code", null, /* @__PURE__ */ import_react4.default.createElement("em", null, "export const"), " sections = ", "{")), groups.map((group) => /* @__PURE__ */ import_react4.default.createElement("details", { key: group.name, open: true, className: "ngar-code-group" }, /* @__PURE__ */ import_react4.default.createElement("summary", { className: "ngar-code-line" }, /* @__PURE__ */ import_react4.default.createElement("code", null, /* @__PURE__ */ import_react4.default.createElement(import_dsh_client_ui_primitives.IconFolderOpenRegular, { size: 14 }), " ", JSON.stringify(group.name), ": [")), group.boards.map((ref) => {
    const saved = included.has(ref.sessionId);
    const status = favorites.has(ref.sessionId) ? "\u5DF2\u6536\u85CF" : saved ? "\u5DF2\u5728\u5DE5\u4F5C\u533A" : "\u6DFB\u52A0\u5230\u5DE5\u4F5C\u533A";
    return /* @__PURE__ */ import_react4.default.createElement(
      "button",
      {
        key: ref.sessionId,
        type: "button",
        className: "ngar-code-line ngar-board-line",
        disabled: Boolean(adding),
        title: ref.name + " \xB7 " + status,
        "aria-label": ref.name + "\uFF0C" + status,
        onClick: () => void add(ref)
      },
      /* @__PURE__ */ import_react4.default.createElement("code", null, /* @__PURE__ */ import_react4.default.createElement("span", null, JSON.stringify(ref.name)), ","),
      saved && /* @__PURE__ */ import_react4.default.createElement(import_dsh_client_ui_primitives.IconCheckOutlineRegular, { size: 14 }),
      adding === ref.sessionId && /* @__PURE__ */ import_react4.default.createElement("small", null, "\u6DFB\u52A0\u4E2D\u2026")
    );
  }), /* @__PURE__ */ import_react4.default.createElement("div", { className: "ngar-code-line ngar-bracket" }, /* @__PURE__ */ import_react4.default.createElement("code", null, "],")))), /* @__PURE__ */ import_react4.default.createElement("div", { className: "ngar-code-line" }, /* @__PURE__ */ import_react4.default.createElement("code", null, "}")), !groups.length && /* @__PURE__ */ import_react4.default.createElement("p", { className: "ngar-hint" }, "\u8FD9\u4E2A\u5206\u7C7B\u91CC\u6CA1\u6709\u5339\u914D\u7684\u5B50\u7248\u9762\u3002")), /* @__PURE__ */ import_react4.default.createElement("div", { className: "ngar-directory-status", role: "status" }, message || (catalog.settings?.openOnPick === false ? "\u70B9\u5B50\u7248\u9762\u52A0\u5165\u5DE5\u4F5C\u533A" : "\u70B9\u5B50\u7248\u9762\u52A0\u5165\u5DE5\u4F5C\u533A\u5E76\u6253\u5F00")));
}
function FollowedPreview({ library, site }) {
  const source = library.followed;
  const state = (0, import_react4.useSyncExternalStore)(source.subscribe, source.snapshot);
  (0, import_react4.useEffect)(() => {
    const check = () => {
      if (!document.hidden) void source.check();
    };
    const timer = setInterval(check, 3e3);
    function visibility() {
      const phase = source.snapshot().phase;
      if (document.hidden && ["loading", "ready", "error", "reauth"].includes(phase)) source.clear("hidden");
      if (!document.hidden && phase === "hidden") void source.open(false);
    }
    function focus() {
      if (["ready", "error", "signedOut", "hidden"].includes(source.snapshot().phase)) void source.open(false);
    }
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", visibility);
      source.clear();
    };
  }, [source]);
  const again = () => void source.open(true);
  return /* @__PURE__ */ import_react4.default.createElement(import_react4.default.Fragment, null, /* @__PURE__ */ import_react4.default.createElement("div", { className: "ngar-followed-controls" }, state.account && /* @__PURE__ */ import_react4.default.createElement("strong", null, state.account.name), state.phase === "ready" && /* @__PURE__ */ import_react4.default.createElement("button", { onClick: again }, "\u91CD\u65B0\u540C\u6B65"), state.account && /* @__PURE__ */ import_react4.default.createElement(import_react4.default.Fragment, null, /* @__PURE__ */ import_react4.default.createElement("button", { onClick: () => void source.logout(true, library.notifyAccount) }, "\u5207\u6362\u8D26\u53F7"), /* @__PURE__ */ import_react4.default.createElement("button", { onClick: () => void source.logout(false, library.notifyAccount) }, "\u9000\u51FA\u767B\u5F55"))), state.phase === "ready" && (state.boards.length ? /* @__PURE__ */ import_react4.default.createElement(
    CategoryListing,
    {
      key: state.account.generation,
      library,
      generation: state.account.generation,
      category: { name: "\u6211\u5173\u6CE8\u7684\u5427", groups: [{ name: "\u6211\u5173\u6CE8\u7684\u5427", boards: state.boards }] }
    }
  ) : /* @__PURE__ */ import_react4.default.createElement("p", { className: "ngar-hint" }, "\u5F53\u524D\u8D26\u53F7\u8FD8\u6CA1\u6709\u5173\u6CE8\u7684\u5427\u3002")), ["loading", "hidden"].includes(state.phase) && /* @__PURE__ */ import_react4.default.createElement("p", { className: "ngar-hint", role: "status" }, "\u6B63\u5728\u8BFB\u53D6\u5173\u6CE8\u5217\u8868\u2026"), state.phase === "error" && /* @__PURE__ */ import_react4.default.createElement("p", { className: "ngar-hint", role: "alert" }, state.account && "\u5DF2\u767B\u5F55\u3002", state.error, " ", /* @__PURE__ */ import_react4.default.createElement("button", { onClick: again }, state.account ? "\u91CD\u65B0\u540C\u6B65" : "\u91CD\u65B0\u8BFB\u53D6")), state.phase === "reauth" && /* @__PURE__ */ import_react4.default.createElement("p", { className: "ngar-hint", role: "status" }, "\u8D34\u5427\u672A\u63A5\u53D7\u5F53\u524D\u767B\u5F55\u3002 ", /* @__PURE__ */ import_react4.default.createElement("button", { onClick: again }, "\u91CD\u8BD5\u540C\u6B65"), " ", /* @__PURE__ */ import_react4.default.createElement("button", { onClick: () => source.clear("login") }, "\u91CD\u65B0\u626B\u7801\u767B\u5F55")), ["idle", "signedOut"].includes(state.phase) && /* @__PURE__ */ import_react4.default.createElement("p", { className: "ngar-hint" }, /* @__PURE__ */ import_react4.default.createElement("button", { className: "ngar-setting-button", onClick: again }, state.phase === "signedOut" ? "\u626B\u7801\u767B\u5F55\u767E\u5EA6\u8D34\u5427" : "\u67E5\u770B\u6211\u5173\u6CE8\u7684\u5427")), state.phase === "login" && /* @__PURE__ */ import_react4.default.createElement(
    AccountDialog,
    {
      reader: { api: source.api, site },
      account: { connected: false },
      onClose: () => {
        if (source.snapshot().phase === "login") source.clear("signedOut");
      },
      onChange: () => {
        library.notifyAccount();
        return source.open(false);
      }
    }
  ));
}
function CategoryPreview({ useTabInfo, library }) {
  const { tab } = useTabInfo();
  const parts = tab.navigation.address.slice(addressPrefix.length).split("/");
  const site = parts.length === 2 ? legacySite : parts[0];
  const key = parts.at(-2);
  if (site === "tieba" && key === followedCategory.key) return /* @__PURE__ */ import_react4.default.createElement("section", { className: "ngar ngar-category-preview", "aria-label": "\u5206\u7C7B\u9884\u89C8" }, /* @__PURE__ */ import_react4.default.createElement(FollowedPreview, { library, site: library.preferences.snapshot().sites.find((item) => item.id === site) }));
  return /* @__PURE__ */ import_react4.default.createElement(OrdinaryPreview, { site, categoryKey: key, library });
}
function OrdinaryPreview({ site, categoryKey, library }) {
  const source = library.directory(site);
  const state = useDirectory(source);
  const category = state.categories.find((item) => encodeURIComponent(item.key) === categoryKey);
  return /* @__PURE__ */ import_react4.default.createElement("section", { className: "ngar ngar-category-preview", "aria-label": "\u5206\u7C7B\u9884\u89C8" }, /* @__PURE__ */ import_react4.default.createElement(ReadStatus, { state, retry: source.load }), category?.error ? /* @__PURE__ */ import_react4.default.createElement("p", { className: "ngar-hint", role: "alert" }, category.error) : category ? /* @__PURE__ */ import_react4.default.createElement(CategoryListing, { key: site + "/" + categoryKey, category, library }) : state.categories.length > 0 && /* @__PURE__ */ import_react4.default.createElement("p", { className: "ngar-hint" }, "\u8FD9\u4E2A\u5206\u7C7B\u5DF2\u79FB\u51FA\u76EE\u5F55\uFF0C\u8BF7\u4ECE\u4E3B\u5BF9\u8BDD\u91CD\u65B0\u9009\u62E9\u3002"));
}

// src/client/activity.jsx
var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");
var activities = [
  { title: "\u601D\u8003", icon: import_dsh_client_ui_primitives2.IconThinkOutlineRegular },
  { title: "\u5DF2\u641C\u7D22\u7F51\u9875", icon: import_dsh_client_ui_primitives2.IconGlobeOutlineRegular },
  { title: "\u6267\u884C\u4E86\u547D\u4EE4", icon: import_dsh_client_ui_primitives2.IconApiOutlineRegular },
  { title: "\u5DF2\u8C03\u7528\u5DE5\u5177", icon: import_dsh_client_ui_primitives2.IconSparkleRegular }
];
function activityFor(key) {
  let hash = 2166136261;
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const mixed = Math.imul(hash ^ hash >>> 16, 2246822507);
  return activities[((mixed ^ mixed >>> 13) >>> 0) % activities.length];
}

// src/client/transcript.jsx
var clock = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
var timeOf = (value) => value ? clock.format(new Date(value * 1e3)) : "";
function Pager({ page, last, next, change, label }) {
  if (page === 1 && !next) return null;
  return /* @__PURE__ */ import_react5.default.createElement("nav", { "aria-label": label, className: "ngar-pager" }, /* @__PURE__ */ import_react5.default.createElement("button", { "aria-label": label + "\u4E0A\u4E00\u9875", disabled: page <= 1, onClick: () => change(page - 1) }, /* @__PURE__ */ import_react5.default.createElement(import_dsh_client_ui_primitives3.IconChevronLeftOutlineRegular, { size: 15 })), /* @__PURE__ */ import_react5.default.createElement("span", null, last ? page + " / " + last : "\u7B2C " + page + " \u9875"), /* @__PURE__ */ import_react5.default.createElement("button", { "aria-label": label + "\u4E0B\u4E00\u9875", disabled: !next, onClick: () => change(page + 1) }, /* @__PURE__ */ import_react5.default.createElement(import_dsh_client_ui_primitives3.IconChevronRightOutlineRegular, { size: 15 })));
}
function Picture({ site, url }) {
  return /* @__PURE__ */ import_react5.default.createElement("div", { className: "ngar-picture" }, /* @__PURE__ */ import_react5.default.createElement("a", { href: url, target: "_blank", rel: "noreferrer", title: "\u67E5\u770B\u539F\u56FE" }, /* @__PURE__ */ import_react5.default.createElement(ForumImage, { site, url, alt: "\u5E16\u5B50\u914D\u56FE", fallback: "\u56FE\u7247\u672A\u80FD\u52A0\u8F7D\uFF0C\u67E5\u770B\u539F\u56FE" })));
}
function TopicRows({ list, query, reader }) {
  const term = query.trim().toLocaleLowerCase();
  const topics = list.items.filter((item) => (item.title + " " + item.author).toLocaleLowerCase().includes(term));
  return /* @__PURE__ */ import_react5.default.createElement(import_react5.default.Fragment, null, topics.map((item) => /* @__PURE__ */ import_react5.default.createElement("button", { className: "ngar-topic", key: item.entryId ?? item.id, onClick: () => reader.open(item.entryId ?? item.id), title: item.title }, /* @__PURE__ */ import_react5.default.createElement(import_dsh_client_ui_primitives3.IconThinkOutlineRegular, { size: 14 }), /* @__PURE__ */ import_react5.default.createElement("span", null, "\u67E5\u770B"), /* @__PURE__ */ import_react5.default.createElement("i", { "aria-hidden": "true" }), /* @__PURE__ */ import_react5.default.createElement("span", { className: "ngar-preview" }, item.title))), !topics.length && /* @__PURE__ */ import_react5.default.createElement("p", { className: "ngar-hint" }, term ? "\u672C\u9875\u6CA1\u6709\u5339\u914D\u7684\u8BA8\u8BBA\u3002" : "\u8FD9\u4E00\u9875\u6CA1\u6709\u8BA8\u8BBA\u3002"));
}
function Blocks({ site, blocks }) {
  return blocks.map((block, index) => {
    if (block.kind === "image") return /* @__PURE__ */ import_react5.default.createElement(Picture, { key: index, site, url: block.url });
    const Tag = block.kind === "quote" ? "blockquote" : "p";
    return /* @__PURE__ */ import_react5.default.createElement(Tag, { key: index }, block.runs ? block.runs.map((run, i) => {
      let value = run.smile ? /* @__PURE__ */ import_react5.default.createElement(Smile, { site, url: run.smile, label: run.text }) : run.text;
      if (run.bold) value = /* @__PURE__ */ import_react5.default.createElement("strong", null, value);
      if (run.strike) value = /* @__PURE__ */ import_react5.default.createElement("del", null, value);
      return run.href ? /* @__PURE__ */ import_react5.default.createElement("a", { key: i, href: run.href, target: "_blank", rel: "noreferrer" }, value) : /* @__PURE__ */ import_react5.default.createElement(import_react5.default.Fragment, { key: i }, value);
    }) : block.text);
  });
}
function FloorReplies({ reader, threadId, post }) {
  const [open, setOpen] = (0, import_react5.useState)(false), [page, setPage] = (0, import_react5.useState)(1);
  const [result, setResult] = (0, import_react5.useState)(null), [error, setError] = (0, import_react5.useState)(""), [retry, setRetry] = (0, import_react5.useState)(0);
  (0, import_react5.useEffect)(() => {
    if (!open || result?.page === page) return;
    const request = new AbortController();
    setError("");
    reader.api("replies", { mode: "live", id: threadId, postId: post.id, page }, request.signal).then((value) => {
      if (!request.signal.aborted) setResult(value);
    }).catch((err) => {
      if (!request.signal.aborted) setError(err.message);
    });
    return () => request.abort();
  }, [open, page, retry, reader, threadId, post.id, result?.page]);
  function change(next) {
    setError("");
    setPage(next);
  }
  return /* @__PURE__ */ import_react5.default.createElement("details", { className: "ngar-subposts", onToggle: (event) => setOpen(event.currentTarget.open) }, /* @__PURE__ */ import_react5.default.createElement("summary", null, "\u697C\u4E2D\u697C\uFF08" + post.replyCount + "\uFF09"), open && (result?.page === page ? /* @__PURE__ */ import_react5.default.createElement(import_react5.default.Fragment, null, result.items.map((item) => /* @__PURE__ */ import_react5.default.createElement("div", { className: "ngar-subpost", key: item.id }, /* @__PURE__ */ import_react5.default.createElement("strong", null, item.author), /* @__PURE__ */ import_react5.default.createElement(Blocks, { site: reader.site, blocks: item.blocks }))), !result.items.length && /* @__PURE__ */ import_react5.default.createElement("p", { className: "ngar-hint" }, "\u672C\u9875\u6CA1\u6709\u53EF\u89C1\u56DE\u590D\u3002"), /* @__PURE__ */ import_react5.default.createElement(Pager, { label: "\u697C\u4E2D\u697C", page, last: result.pages, next: page < result.pages, change })) : /* @__PURE__ */ import_react5.default.createElement("p", { className: "ngar-hint", role: "status" }, error || "\u6B63\u5728\u8BFB\u53D6\u697C\u4E2D\u697C\u2026", " ", error && /* @__PURE__ */ import_react5.default.createElement(import_react5.default.Fragment, null, /* @__PURE__ */ import_react5.default.createElement("button", { onClick: () => setRetry((n) => n + 1) }, "\u91CD\u65B0\u8BFB\u53D6"), result && /* @__PURE__ */ import_react5.default.createElement("button", { onClick: () => change(result.page) }, "\u8FD4\u56DE\u4E0A\u4E00\u9875\u5185\u5BB9")))));
}
function Floors({ state, reader }) {
  const { id, thread } = state;
  const { foldImages, showAuthorUid } = (0, import_react5.useContext)(ReadingOptions);
  const [expanded, setExpanded] = (0, import_react5.useState)(() => reader.expanded(id, thread.page));
  function toggle(floor) {
    const next = expanded.includes(floor) ? expanded.filter((id2) => id2 !== floor) : [...expanded, floor];
    reader.expanded(id, thread.page, next);
    setExpanded(next);
  }
  if (!thread.posts.length) return /* @__PURE__ */ import_react5.default.createElement("p", { className: "ngar-hint" }, "\u8FD9\u4E00\u9875\u6CA1\u6709\u53EF\u89C1\u697C\u5C42\u3002");
  return thread.posts.map((post) => {
    const { context, output } = floorParts(post.blocks, foldImages);
    const count = context.filter((block) => block.kind === "image").length;
    const pictures = count ? count + " \u5F20\u56FE\u7247" : "";
    const preview = [pictures, context.find((block) => block.text)?.text].filter(Boolean).join(" \xB7 ");
    const excerpt = output.find((block) => block.kind === "text")?.text || output.find((block) => block.kind === "quote")?.text || pictures || (output.some((block) => block.kind === "image") ? "\u697C\u5C42\u914D\u56FE" : "\u6B64\u697C\u5C42\u6CA1\u6709\u6B63\u6587");
    const label = post.floor ? post.floor + " \u697C" : "\u4E3B\u697C";
    const uid = showAuthorUid && post.authorId ? "UID " + post.authorId : "";
    const byline = [label, post.author, uid !== post.author && uid].filter(Boolean).join(" \xB7 ");
    const { title, icon: ActivityIcon } = activityFor(thread.id + "/" + post.floor);
    const open = expanded.includes(post.floor);
    return /* @__PURE__ */ import_react5.default.createElement("article", { className: "ngar-floor", key: post.floor, "aria-label": label }, /* @__PURE__ */ import_react5.default.createElement(
      import_dsh_client_ui_primitives3.DisclosureRow,
      {
        title,
        icon: /* @__PURE__ */ import_react5.default.createElement(ActivityIcon, { size: 14 }),
        open,
        expandable: true,
        expandOnRowClick: true,
        keepContentWhenOpen: true,
        onToggle: () => toggle(post.floor),
        collapsedContent: /* @__PURE__ */ import_react5.default.createElement(import_react5.default.Fragment, null, /* @__PURE__ */ import_react5.default.createElement("i", { className: "ngar-dot" }), /* @__PURE__ */ import_react5.default.createElement("span", { className: "ngar-preview", title: byline }, byline, !open && preview && " \xB7 " + preview))
      },
      /* @__PURE__ */ import_react5.default.createElement("div", { className: "ngar-thought" }, post.time > 0 && /* @__PURE__ */ import_react5.default.createElement("time", { className: "ngar-byline" }, timeOf(post.time)), /* @__PURE__ */ import_react5.default.createElement(Blocks, { site: reader.site, blocks: context }))
    ), output.length > 0 ? /* @__PURE__ */ import_react5.default.createElement("div", { className: "ngar-output" }, /* @__PURE__ */ import_react5.default.createElement(Blocks, { site: reader.site, blocks: output })) : !count && /* @__PURE__ */ import_react5.default.createElement("p", null, "\u6B64\u697C\u5C42\u6CA1\u6709\u6B63\u6587\u3002"), reader.site.capabilities.replies && post.replyCount > 0 && /* @__PURE__ */ import_react5.default.createElement(FloorReplies, { reader, threadId: thread.id, post }), reader.site.capabilities.quote && /* @__PURE__ */ import_react5.default.createElement("button", { type: "button", className: "ngar-quote", disabled: state.sending, "aria-label": "\u5F15\u7528" + label, onClick: () => reader.draft({ quote: {
      postId: post.id,
      page: thread.page,
      floor: post.floor,
      excerpt: excerpt.slice(0, 140)
    } }) }, "\u5F15\u7528"));
  });
}
function Records({ state, reader }) {
  const { id, list, thread } = state;
  const page = id ? thread.page : state.listPage;
  const box = (0, import_react5.useRef)(null);
  const [visible, setVisible] = (0, import_react5.useState)(true);
  (0, import_react5.useLayoutEffect)(() => {
    const el = box.current;
    if (visible) el.scrollTop = reader.scroll(id, page);
  }, [visible, reader, id, page]);
  return /* @__PURE__ */ import_react5.default.createElement(import_react5.default.Fragment, null, !id && /* @__PURE__ */ import_react5.default.createElement("button", { className: "ngar-group", "aria-expanded": visible, onClick: () => setVisible(!visible) }, visible ? /* @__PURE__ */ import_react5.default.createElement(import_dsh_client_ui_primitives3.IconChevronUpOutlineRegular, { size: 14 }) : /* @__PURE__ */ import_react5.default.createElement(import_dsh_client_ui_primitives3.IconChevronDownOutlineRegular, { size: 14 }), /* @__PURE__ */ import_react5.default.createElement("span", null, "\u8BA8\u8BBA\u7D22\u5F15"), /* @__PURE__ */ import_react5.default.createElement("i", null), /* @__PURE__ */ import_react5.default.createElement("span", null, list.items.length, " \u6761\u8BB0\u5F55")), /* @__PURE__ */ import_react5.default.createElement(
    "div",
    {
      className: "ngar-records",
      ref: box,
      hidden: !visible,
      "aria-label": id ? "\u697C\u5C42\u8BB0\u5F55" : "\u7248\u9762\u5E16\u5B50",
      onScroll: (event) => reader.scroll(id, page, event.currentTarget.scrollTop)
    },
    id ? /* @__PURE__ */ import_react5.default.createElement(Floors, { state, reader }) : /* @__PURE__ */ import_react5.default.createElement(TopicRows, { list, query: state.query, reader })
  ), /* @__PURE__ */ import_react5.default.createElement(
    Pager,
    {
      label: id ? "\u697C\u5C42" : "\u5E16\u5B50\u5217\u8868",
      page,
      last: id ? thread.pages : void 0,
      next: id ? page < thread.pages : list.hasNext,
      change: id ? (page2) => reader.open(id, page2) : reader.loadList
    }
  ));
}
function BoardTranscript({ reader, entryOnly, library }) {
  const state = (0, import_react5.useSyncExternalStore)(reader.subscribe, reader.snapshot);
  (0, import_react5.useEffect)(() => {
    reader.activate();
    if (entryOnly) library.browse(entryForSite(reader.site.id).sessionId);
  }, [reader, entryOnly, library]);
  if (entryOnly) return /* @__PURE__ */ import_react5.default.createElement(CategoryCards, { site: reader.site, library });
  const { id, thread, list } = state;
  const data = id ? thread : list;
  const error = id ? state.threadError : state.listError;
  const title = id ? thread?.title || list?.items.find((item) => (item.entryId ?? item.id) === id)?.title : "\u6574\u7406\u4E00\u4E0B\u6700\u8FD1\u7684\u8BA8\u8BBA\u3002";
  const time = thread?.posts[0]?.time;
  return /* @__PURE__ */ import_react5.default.createElement("section", { className: "ngar ngar-transcript", "aria-label": "\u8BA8\u8BBA\u8BB0\u5F55" }, title && /* @__PURE__ */ import_react5.default.createElement("div", { className: "ngar-prompt" }, /* @__PURE__ */ import_react5.default.createElement("div", { className: "ngar-bubble" }, title), time > 0 && /* @__PURE__ */ import_react5.default.createElement("time", null, timeOf(time))), data ? /* @__PURE__ */ import_react5.default.createElement(Records, { key: [id, id ? thread.page : state.listPage].join("/"), state, reader }) : /* @__PURE__ */ import_react5.default.createElement("div", { className: "ngar-hint", role: "status" }, error || "\u6B63\u5728\u8BFB\u53D6\u2026", " ", error && /* @__PURE__ */ import_react5.default.createElement("button", { onClick: () => id ? reader.open(id, state.page) : reader.loadList() }, "\u91CD\u65B0\u8BFB\u53D6")), state.notice && /* @__PURE__ */ import_react5.default.createElement("p", { className: "ngar-hint", role: state.noticeError ? "alert" : "status" }, state.notice));
}

// src/client/composer.jsx
var import_react11 = __toESM(require("react"), 1);

// src/client/reply-toolbar.jsx
var import_react7 = __toESM(require("react"), 1);
var import_dsh_client_ui_primitives5 = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/smile-picker.jsx
var import_react6 = __toESM(require("react"), 1);
var import_dsh_client_ui_primitives4 = require("@deepseek-ai/dsh-client-ui-primitives");
var pageSize = 20;
function SmilePicker({ editor, site, insert, position }) {
  const { smileGroups: smileGroups2, smileUrl: smileUrl2 } = editor;
  const [pack, setPack] = (0, import_react6.useState)(() => smileGroups2.find((group) => group.id === position.current.pack) ?? smileGroups2[0]);
  const [page, setPage] = (0, import_react6.useState)(position.current.page);
  const box = (0, import_react6.useRef)(null);
  const pages = Math.ceil(pack.faces.length / pageSize);
  (0, import_react6.useLayoutEffect)(() => {
    const el = box.current;
    el.scrollTop = position.current.page * el.clientHeight;
  }, [pack, position]);
  function go(next) {
    const el = box.current;
    if (!el) return;
    el.scrollTop = Math.max(0, Math.min(pages - 1, next)) * el.clientHeight;
    const index = Math.round(el.scrollTop / el.clientHeight);
    position.current = { pack: pack.id, page: index };
    setPage(index);
  }
  function switchPack(id) {
    position.current = { pack: id, page: 0 };
    setPack(smileGroups2.find((group) => group.id === id));
    if (box.current) box.current.scrollTop = 0;
    setPage(0);
  }
  function keys(event) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -5, ArrowDown: 5, PageUp: -pageSize, PageDown: pageSize }[event.key];
    if (!step) return;
    const faces = [...box.current.querySelectorAll("button")];
    const index = faces.indexOf(event.target);
    if (index < 0) return;
    event.preventDefault();
    faces[Math.max(0, Math.min(faces.length - 1, index + step))].focus();
  }
  return /* @__PURE__ */ import_react6.default.createElement("div", { className: "ngar-face-picker" }, /* @__PURE__ */ import_react6.default.createElement("select", { "aria-label": "\u8868\u60C5\u5206\u7EC4", value: pack.id, onChange: (event) => switchPack(event.target.value) }, smileGroups2.map((group) => /* @__PURE__ */ import_react6.default.createElement("option", { key: group.id, value: group.id }, group.label, " \xB7 ", group.faces.length))), /* @__PURE__ */ import_react6.default.createElement(
    "div",
    {
      className: "ngar-face-scroll",
      ref: box,
      onKeyDown: keys,
      "aria-label": pack.label + "\u8868\u60C5",
      onScroll: (event) => {
        const el = event.currentTarget;
        if (!el.clientHeight) return;
        const next = Math.min(pages - 1, Math.round(el.scrollTop / el.clientHeight));
        position.current = { pack: pack.id, page: next };
        setPage(next);
      }
    },
    Array.from({ length: pages }, (_, index) => /* @__PURE__ */ import_react6.default.createElement("div", { className: "ngar-face-page", key: pack.id + index }, pack.faces.slice(index * pageSize, (index + 1) * pageSize).map((face) => /* @__PURE__ */ import_react6.default.createElement(
      "button",
      {
        key: face.code,
        type: "button",
        title: face.name,
        "aria-label": face.name,
        onClick: () => insert(face.code)
      },
      /* @__PURE__ */ import_react6.default.createElement(Smile, { site, url: smileUrl2(face.code), label: "" }),
      /* @__PURE__ */ import_react6.default.createElement("span", null, face.name)
    ))))
  ), /* @__PURE__ */ import_react6.default.createElement("nav", { className: "ngar-face-pager", "aria-label": "\u8868\u60C5\u7FFB\u9875" }, /* @__PURE__ */ import_react6.default.createElement("button", { type: "button", "aria-label": "\u4E0A\u4E00\u9875\u8868\u60C5", disabled: !page, onClick: () => go(page - 1) }, /* @__PURE__ */ import_react6.default.createElement(import_dsh_client_ui_primitives4.IconChevronLeftOutlineRegular, { size: 15 })), /* @__PURE__ */ import_react6.default.createElement("span", { "aria-live": "polite" }, page + 1, " / ", pages), /* @__PURE__ */ import_react6.default.createElement("button", { type: "button", "aria-label": "\u4E0B\u4E00\u9875\u8868\u60C5", disabled: page >= pages - 1, onClick: () => go(page + 1) }, /* @__PURE__ */ import_react6.default.createElement(import_dsh_client_ui_primitives4.IconChevronRightOutlineRegular, { size: 15 }))));
}

// src/sites/nga/markup-urls.js
function linkUrl(value) {
  try {
    if (!/^https?:\/\//i.test(value) || /[\s<>\[\]]/.test(value)) return null;
    const url = new URL(value);
    return url.username || url.password ? null : url.href;
  } catch {
    return null;
  }
}
function imageUrl(value) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || /[\s<>\[\]\\]/u.test(raw)) return null;
  try {
    let url;
    if (/^(?:https?:)?\/\//i.test(raw)) {
      url = new URL(raw, "https://bbs.nga.cn");
    } else if (/^img\d*\.(?:nga\.cn|nga\.178\.com|ngacn\.cc)\//i.test(raw)) {
      url = new URL("https://" + raw);
    } else if (/^\/?ngabbs\/post\/smile\//i.test(raw)) {
      url = new URL(raw, "https://img4.nga.cn");
    } else {
      const path = raw.replace(/^\.?\//, "").replace(/^attachments\//i, "");
      if (!/^mon(?:_\d+)?\//i.test(path)) return null;
      url = new URL("/attachments/" + path, "https://img.nga.cn");
      if (!url.pathname.startsWith("/attachments/")) return null;
    }
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.port) return null;
    if (!/(^|\.)(nga\.cn|nga\.178\.com|ngacn\.cc)$/.test(url.hostname)) return null;
    if (!/\.(?:avif|bmp|gif|jpe?g|png|webp)$/i.test(url.pathname)) return null;
    url.protocol = "https:";
    if (/^img\d*\.(?:nga\.cn|nga\.178\.com|ngacn\.cc)$/.test(url.hostname)) {
      if (url.pathname.startsWith("/attachments/")) {
        url.hostname = "img.nga.cn";
        url.pathname = url.pathname.replace(/(\.(?:gif|jpe?g|png|webp))\.(?:thumb(?:_ss?)?|medium)\.\w+$/i, "$1");
      } else if (url.pathname.startsWith("/ngabbs/post/smile/")) url.hostname = "img4.nga.cn";
    }
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

// src/sites/nga/smiles.js
var packs = {
  "0": {
    "1": "smile.gif",
    "2": "mrgreen.gif",
    "3": "question.gif",
    "4": "wink.gif",
    "5": "redface.gif",
    "6": "sad.gif",
    "7": "cool.gif",
    "8": "crazy.gif",
    "32": "12.gif",
    "33": "13.gif",
    "34": "14.gif",
    "30": "10.gif",
    "29": "09.gif",
    "28": "08.gif",
    "27": "07.gif",
    "26": "06.gif",
    "25": "05.gif",
    "24": "04.gif",
    "35": "15.gif",
    "36": "16.gif",
    "37": "17.gif",
    "38": "18.gif",
    "39": "19.gif",
    "40": "20.gif",
    "41": "21.gif",
    "42": "22.gif",
    "43": "23.gif"
  },
  "ac": {
    "blink": "ac0.png",
    "goodjob": "ac1.png",
    "\u4E0A": "ac2.png",
    "\u4E2D\u67AA": "ac3.png",
    "\u5077\u7B11": "ac4.png",
    "\u51B7": "ac5.png",
    "\u51CC\u4E71": "ac6.png",
    "\u5413": "ac8.png",
    "\u543B": "ac9.png",
    "\u5446": "ac10.png",
    "\u54A6": "ac11.png",
    "\u54E6": "ac12.png",
    "\u54ED": "ac13.png",
    "\u54ED1": "ac14.png",
    "\u54ED\u7B11": "ac15.png",
    "\u5598": "ac17.png",
    "\u5FC3": "ac23.png",
    "\u56E7": "ac21.png",
    "\u6655": "ac33.png",
    "\u6C57": "ac34.png",
    "\u778E": "ac35.png",
    "\u7F9E": "ac36.png",
    "\u7FA1\u6155": "ac37.png",
    "\u59D4\u5C48": "ac22.png",
    "\u5FE7\u4F24": "ac24.png",
    "\u6012": "ac25.png",
    "\u6015": "ac26.png",
    "\u60CA": "ac27.png",
    "\u6101": "ac28.png",
    "\u6293\u72C2": "ac29.png",
    "\u54FC": "ac16.png",
    "\u55B7": "ac18.png",
    "\u5632\u7B11": "ac19.png",
    "\u5632\u7B111": "ac20.png",
    "\u62A0\u9F3B": "ac30.png",
    "\u65E0\u8BED": "ac32.png",
    "\u8870": "ac40.png",
    "\u9ED1\u67AA": "ac44.png",
    "\u82B1\u75F4": "ac38.png",
    "\u95EA\u5149": "ac43.png",
    "\u64E6\u6C57": "ac31.png",
    "\u8336": "ac39.png",
    "\u8BA1\u5212\u901A": "ac41.png",
    "\u53CD\u5BF9": "ac7.png",
    "\u8D5E\u540C": "ac42.png"
  },
  "a2": {
    "goodjob": "a2_02.png",
    "\u8BF6\u563F": "a2_05.png",
    "\u5077\u7B11": "a2_03.png",
    "\u6012": "a2_04.png",
    "\u7B11": "a2_07.png",
    "\u90A3\u4E2A\u2026": "a2_08.png",
    "\u54E6\u55EC\u55EC\u55EC": "a2_09.png",
    "\u8214": "a2_10.png",
    "\u9B3C\u8138": "a2_14.png",
    "\u51B7": "a2_16.png",
    "\u5927\u54ED": "a2_15.png",
    "\u54ED": "a2_17.png",
    "\u6068": "a2_21.png",
    "\u4E2D\u67AA": "a2_23.png",
    "\u56E7": "a2_24.png",
    "\u4F60\u770B\u770B\u4F60": "a2_25.png",
    "doge": "a2_27.png",
    "\u81EA\u6233\u53CC\u76EE": "a2_28.png",
    "\u5077\u5403": "a2_30.png",
    "\u51B7\u7B11": "a2_31.png",
    "\u58C1\u549A": "a2_32.png",
    "\u4E0D\u6D3B\u4E86": "a2_33.png",
    "\u4E0D\u660E\u89C9\u5389": "a2_36.png",
    "\u662F\u5728\u4E0B\u8F93\u4E86": "a2_51.png",
    "\u4F60\u4E3A\u7334\u8FD9\u4E48": "a2_53.png",
    "\u5E72\u676F": "a2_54.png",
    "\u5E72\u676F2": "a2_55.png",
    "\u5F02\u8BAE": "a2_47.png",
    "\u8BA4\u771F": "a2_48.png",
    "\u4F60\u5DF2\u7ECF\u6B7B\u4E86": "a2_45.png",
    "\u4F60\u8FD9\u79CD\u4EBA\u2026": "a2_49.png",
    "\u59AE\u53EF\u59AE\u53EF\u59AE": "a2_18.png",
    "\u60CA": "a2_19.png",
    "\u62A2\u955C\u5934": "a2_52.png",
    "yes": "a2_26.png",
    "\u6709\u4F55\u8D35\u5E72": "a2_11.png",
    "\u75C5\u5A07": "a2_12.png",
    "lucky": "a2_13.png",
    "poi": "a2_20.png",
    "\u56E72": "a2_22.png",
    "\u5A01\u5413": "a2_42.png",
    "jojo\u7ACB": "a2_37.png",
    "jojo\u7ACB2": "a2_38.png",
    "jojo\u7ACB3": "a2_39.png",
    "jojo\u7ACB4": "a2_41.png",
    "jojo\u7ACB5": "a2_40.png"
  },
  "ng": {
    "\u5472\u7259\u7B11": "ng_1.png",
    "\u5978\u7B11": "ng_2.png",
    "\u95EE\u53F7": "ng_3.png",
    "\u8336": "ng_4.png",
    "\u7B11\u6307": "ng_5.png",
    "\u71C3\u5C3D": "ng_6.png",
    "\u6655": "ng_7.png",
    "\u6247\u7B11": "ng_8.png",
    "\u5BC4": "ng_9.png",
    "\u522B\u6025": "ng_10.png",
    "doge": "ng_11.png",
    "\u4E27": "ng_12.png",
    "\u6C57": "ng_13.png",
    "\u53F9\u6C14": "ng_15.png",
    "\u5403\u997C": "ng_16.png",
    "\u5403\u74DC": "ng_17.png",
    "\u5410\u820C": "ng_18.png",
    "\u54ED": "ng_19.png",
    "\u5598": "ng_20.png",
    "\u5FC3": "ng_21.png",
    "\u55B7": "ng_22.png",
    "\u56F0": "ng_24.png",
    "\u5927\u54ED": "ng_25.png",
    "\u5927\u60CA": "ng_26.png",
    "\u5BB3\u6015": "ng_27.png",
    "\u60CA": "ng_28.png",
    "\u66B4\u6012": "ng_30.png",
    "\u6C14\u6124": "ng_31.png",
    "\u70ED": "ng_32.png",
    "\u74DC\u4E0D\u719F": "ng_33.png",
    "\u778E": "ng_34.png",
    "\u8272": "ng_35.png",
    "\u659C\u773C": "ng_37.png",
    "\u95EE\u53F7\u5927": "ng_38.png"
  },
  "pst": {
    "\u4E3E\u624B": "pt00.png",
    "\u4EB2": "pt01.png",
    "\u5077\u7B11": "pt02.png",
    "\u5077\u7B112": "pt03.png",
    "\u5077\u7B113": "pt04.png",
    "\u50BB\u773C": "pt05.png",
    "\u50BB\u773C2": "pt06.png",
    "\u5154\u5B50": "pt07.png",
    "\u53D1\u5149": "pt08.png",
    "\u5446": "pt09.png",
    "\u54462": "pt10.png",
    "\u54463": "pt11.png",
    "\u5455": "pt12.png",
    "\u5475\u6B20": "pt13.png",
    "\u54ED": "pt14.png",
    "\u54ED2": "pt15.png",
    "\u54ED3": "pt16.png",
    "\u5632\u7B11": "pt17.png",
    "\u57FA": "pt18.png",
    "\u5B85": "pt19.png",
    "\u5B89\u6170": "pt20.png",
    "\u5E78\u798F": "pt21.png",
    "\u5F00\u5FC3": "pt22.png",
    "\u5F00\u5FC32": "pt23.png",
    "\u5F00\u5FC33": "pt24.png",
    "\u6000\u7591": "pt25.png",
    "\u6012": "pt26.png",
    "\u60122": "pt27.png",
    "\u6028": "pt28.png",
    "\u60CA\u5413": "pt29.png",
    "\u60CA\u54132": "pt30.png",
    "\u60CA\u5446": "pt31.png",
    "\u60CA\u54462": "pt32.png",
    "\u60CA\u54463": "pt33.png",
    "\u60E8": "pt34.png",
    "\u659C\u773C": "pt35.png",
    "\u6655": "pt36.png",
    "\u6C57": "pt37.png",
    "\u6CEA": "pt38.png",
    "\u6CEA2": "pt39.png",
    "\u6CEA3": "pt40.png",
    "\u6CEA4": "pt41.png",
    "\u6EE1\u8DB3": "pt42.png",
    "\u6EE1\u8DB32": "pt43.png",
    "\u706B\u661F": "pt44.png",
    "\u7259\u75BC": "pt45.png",
    "\u7535\u51FB": "pt46.png",
    "\u770B\u620F": "pt47.png",
    "\u773C\u888B": "pt48.png",
    "\u773C\u955C": "pt49.png",
    "\u7B11\u800C\u4E0D\u8BED": "pt50.png",
    "\u7D27\u5F20": "pt51.png",
    "\u7F8E\u5473": "pt52.png",
    "\u80CC": "pt53.png",
    "\u8138\u7EA2": "pt54.png",
    "\u8138\u7EA22": "pt55.png",
    "\u8150": "pt56.png",
    "\u661F\u661F\u773C": "pt57.png",
    "\u8C22": "pt58.png",
    "\u9189": "pt59.png",
    "\u95F7": "pt60.png",
    "\u95F72": "pt61.png",
    "\u97F3\u4E50": "pt62.png",
    "\u9ED1\u8138": "pt63.png",
    "\u9F3B\u8840": "pt64.png"
  },
  "dt": {
    "ROLL": "dt01.png",
    "\u4E0A": "dt02.png",
    "\u50B2\u5A07": "dt03.png",
    "\u53C9\u51FA\u53BB": "dt04.png",
    "\u53D1\u5149": "dt05.png",
    "\u5475\u6B20": "dt06.png",
    "\u54ED": "dt07.png",
    "\u5543\u53E4\u5934": "dt08.png",
    "\u5632\u7B11": "dt09.png",
    "\u5FC3": "dt10.png",
    "\u6012": "dt11.png",
    "\u60122": "dt12.png",
    "\u6028": "dt13.png",
    "\u60CA": "dt14.png",
    "\u60CA2": "dt15.png",
    "\u65E0\u8BED": "dt16.png",
    "\u661F\u661F\u773C": "dt17.png",
    "\u661F\u661F\u773C2": "dt18.png",
    "\u6655": "dt19.png",
    "\u6CE8\u610F": "dt20.png",
    "\u6CE8\u610F2": "dt21.png",
    "\u6CEA": "dt22.png",
    "\u6CEA2": "dt23.png",
    "\u70E7": "dt24.png",
    "\u7B11": "dt25.png",
    "\u7B112": "dt26.png",
    "\u7B113": "dt27.png",
    "\u8138\u7EA2": "dt28.png",
    "\u836F": "dt29.png",
    "\u8870": "dt30.png",
    "\u9119\u89C6": "dt31.png",
    "\u95F2": "dt32.png",
    "\u9ED1\u8138": "dt33.png"
  },
  "pg": {
    "\u6218\u6597\u529B": "pg01.png",
    "\u54C8\u5564": "pg02.png",
    "\u6EE1\u5206": "pg03.png",
    "\u8870": "pg04.png",
    "\u62D2\u7EDD": "pg05.png",
    "\u5FC3": "pg06.png",
    "\u4E25\u8083": "pg07.png",
    "\u5403\u74DC": "pg08.png",
    "\u5623": "pg09.png",
    "\u56232": "pg10.png",
    "\u51BB": "pg11.png",
    "\u8C22": "pg12.png",
    "\u54ED": "pg13.png",
    "\u54CD\u6307": "pg14.png",
    "\u8F6C\u8EAB": "pg15.png"
  }
};
var base = "https://img4.nga.cn/ngabbs/post/smile/";
var smileGroups = [
  ["ac", "AC\u5A18\uFF08v1\uFF09"],
  ["a2", "AC\u5A18\uFF08v2\uFF09"],
  ["ng", "NG\u5A18"],
  ["pst", "\u6F58\u65AF\u7279"],
  ["dt", "\u5916\u57DF\u4E09\u4EBA\u7EC4"],
  ["pg", "\u4F01\u9E45"],
  ["0", "\u9ED8\u8BA4"]
].map(([id, label]) => ({
  id,
  label,
  faces: Object.keys(packs[id]).map((name2) => ({ name: name2, code: id === "0" ? name2 : id + ":" + name2 }))
}));
var codesByFile = /* @__PURE__ */ new Map();
for (const [pack, names] of Object.entries(packs)) {
  for (const [name2, file] of Object.entries(names)) codesByFile.set(file, pack + ":" + name2);
}
function smileUrl(code) {
  if (typeof code !== "string" || !code) return null;
  const colon = code.indexOf(":");
  const pack = colon < 0 ? "0" : code.slice(0, colon).toLowerCase() || "0";
  const name2 = code.slice(colon + 1);
  if (!Object.hasOwn(packs, pack) || !Object.hasOwn(packs[pack], name2)) return null;
  return base + packs[pack][name2];
}

// src/sites/nga/editor.js
var ngaEditor = { editReply, imageUrl, linkUrl, smileGroups, smileUrl };
var tags = { bold: "b", strike: "del", quote: "quote" };
function editReply(text, [start, end], kind, value = "") {
  const selected = text.slice(start, end);
  let replacement, from, to;
  if (Object.hasOwn(tags, kind)) {
    const tag = tags[kind];
    replacement = "[" + tag + "]" + selected + "[/" + tag + "]";
    from = start + tag.length + 2;
    to = from + selected.length;
  } else if (kind === "face") {
    if (typeof value !== "string") return { error: "\u8BF7\u9009\u62E9\u4E00\u4E2A\u8868\u60C5\u3002" };
    const code = smileUrl(value) ? value : "ac:" + value;
    if (!smileUrl(code)) return { error: "\u8BF7\u9009\u62E9\u4E00\u4E2A\u8868\u60C5\u3002" };
    replacement = "[s:" + code + "]";
  } else if (kind === "link" || kind === "image") {
    const url = value.trim();
    if (kind === "link") {
      if (!linkUrl(url)) return { error: "\u8BF7\u8F93\u5165\u5B8C\u6574\u7684 http \u6216 https \u94FE\u63A5\u3002" };
      const label = selected.trim();
      replacement = label && label !== url ? "[url=" + url + "]" + label + "[/url]" : "[url]" + url + "[/url]";
    } else {
      const image = imageUrl(url);
      if (!image) return { error: "\u8BF7\u8F93\u5165 NGA \u9644\u4EF6\u7684\u56FE\u7247\u5730\u5740\u3002" };
      replacement = "[img]" + (/^\.\/mon_/i.test(url) ? url : image) + "[/img]";
    }
  } else throw new Error("Unknown reply tool");
  const next = text.slice(0, start) + replacement + text.slice(end);
  if (next.length > 8e3) return { error: "\u63D2\u5165\u540E\u4F1A\u8D85\u8FC7 8000 \u5B57\uFF0C\u8BF7\u5148\u7F29\u77ED\u8349\u7A3F\u3002" };
  return { text: next, selection: [from ?? start + replacement.length, to ?? start + replacement.length] };
}

// src/client/reply-toolbar.jsx
var editors = /* @__PURE__ */ new Map([["nga-bbcode", ngaEditor]]);
var labels = { options: "\u4F1A\u8BDD\u9009\u9879", permission: "\u6743\u9650\u6A21\u5F0F", face: "\u8868\u60C5", link: "\u63D2\u5165\u94FE\u63A5", image: "\u63D2\u5165\u56FE\u7247\u94FE\u63A5", picker: "\u6A21\u578B\u4E0E\u601D\u8003\u5F3A\u5EA6", model: "\u6A21\u578B", effort: "\u601D\u8003\u5F3A\u5EA6" };
var isUrl = (pane) => pane === "link" || pane === "image";
var isModel = (pane) => ["picker", "model", "effort"].includes(pane);
var permissionIcons = { "\u5B8C\u5168\u6743\u9650": import_dsh_client_ui_primitives5.PermissionIconFullAccessRegular, "\u4EC5\u53EF\u67E5\u770B": import_dsh_client_ui_primitives5.PermissionIconReadOnlyRegular, "\u5DE5\u4F5C\u533A\u5185\u4FEE\u6539": import_dsh_client_ui_primitives5.PermissionIconWorkspaceWriteRegular };
var firstMenuButton = (el) => el.querySelector('[aria-checked="true"]:not(:disabled)') ?? el.querySelector("select:not(:disabled),input:not(:disabled),button:not(:disabled)");
function Tool({ label, children, ...props }) {
  return /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", className: "ngar-tool", "aria-label": label, title: label, ...props }, children);
}
function LineIcon({ face }) {
  return /* @__PURE__ */ import_react7.default.createElement("svg", { className: "ngar-line-icon", width: "16", height: "16", viewBox: "0 0 18 18", "aria-hidden": "true" }, face ? /* @__PURE__ */ import_react7.default.createElement(import_react7.default.Fragment, null, /* @__PURE__ */ import_react7.default.createElement("circle", { cx: "9", cy: "9", r: "6.6" }), /* @__PURE__ */ import_react7.default.createElement("path", { d: "M6 10.5q3 3.8 6 0M6.5 6.5h.4m4.2 0h.4" })) : /* @__PURE__ */ import_react7.default.createElement(import_react7.default.Fragment, null, /* @__PURE__ */ import_react7.default.createElement("rect", { x: "2.5", y: "3", width: "13", height: "12", rx: "2" }), /* @__PURE__ */ import_react7.default.createElement("circle", { cx: "6.5", cy: "7", r: "1" }), /* @__PURE__ */ import_react7.default.createElement("path", { d: "m4 13 3.5-3 2 1.5 2.5-3 3 3" })));
}
function ReplyToolbar({ state, reader, input, back, connect, browseBoards, openBoards, openSettings, editDirectory, syncBoards, removeBoard, entryOnly, warning }) {
  const { id, account } = state;
  const { site } = reader;
  const caps = site.capabilities;
  const primary = entryOnly ? openBoards && { label: "\u6253\u5F00\u5176\u4ED6\u7248\u9762", icon: import_dsh_client_ui_primitives5.IconFlatListOutlineRegular, onClick: openBoards } : id ? { label: "\u8BA8\u8BBA\u7D22\u5F15", icon: import_dsh_client_ui_primitives5.IconFlatListOutlineRegular, onClick: reader.showList } : { label: "\u5237\u65B0\u5185\u5BB9", icon: import_dsh_client_ui_primitives5.IconRefreshOutlineRegular, onClick: reader.reload };
  return /* @__PURE__ */ import_react7.default.createElement(
    ReadingToolbar,
    {
      input,
      back,
      appearance: state.appearance,
      setAppearance: reader.setAppearance,
      primary,
      reply: id && caps.reply ? { state, reader, connect } : null,
      options: (item) => /* @__PURE__ */ import_react7.default.createElement(import_react7.default.Fragment, null, Boolean(id) && item("\u8BA8\u8BBA\u7D22\u5F15", reader.showList), !entryOnly && item("\u5237\u65B0\u5185\u5BB9", reader.reload), !entryOnly && item("\u6D4F\u89C8\u7248\u9762\u76EE\u5F55", browseBoards), openBoards && item(site.inputLabel ? "\u6309" + site.inputLabel + "\u67E5\u627E\u2026" : "\u6309\u540D\u79F0\u3001\u94FE\u63A5\u6216\u7F16\u53F7\u67E5\u627E\u2026", openBoards), item("\u9605\u8BFB\u8BBE\u7F6E\u2026", openSettings), editDirectory && item("\u7F16\u8F91\u9009\u5427\u76EE\u5F55\u2026", editDirectory), caps.favorites && account.connected && item("\u540C\u6B65\u6536\u85CF\u7248\u9762", syncBoards), removeBoard && item("\u5220\u9664\u624B\u52A8\u7248\u9762\u53CA\u672C\u5730\u9605\u8BFB\u8BB0\u5F55", removeBoard), warning && /* @__PURE__ */ import_react7.default.createElement("p", { className: "ngar-menu-note", role: "status" }, warning), /* @__PURE__ */ import_react7.default.createElement("hr", null), caps.login && !caps.followed && item(account.connected ? "\u8D26\u53F7 \xB7 " + account.name : "\u8FDE\u63A5 " + site.name + " \u8D26\u53F7", connect), item("\u8FD4\u56DE\u5DE5\u4F5C\u5BF9\u8BDD", back))
    }
  );
}
function ReadingToolbar({ input, back, appearance, setAppearance, primary, options, reply }) {
  const { state, reader, connect } = reply ?? {};
  const { draft, sending, account } = state ?? {};
  const site = reader?.site, editor = editors.get(site?.editor);
  const PrimaryIcon = primary?.icon;
  const [pane, setPane] = (0, import_react7.useState)("");
  const [url, setUrl] = (0, import_react7.useState)("");
  const [error, setError] = (0, import_react7.useState)("");
  const bar = (0, import_react7.useRef)(null), popup = (0, import_react7.useRef)(null), trigger = (0, import_react7.useRef)(null);
  const range = (0, import_react7.useRef)([0, 0]), restore = (0, import_react7.useRef)(null);
  const facePosition = (0, import_react7.useRef)({ pack: editor?.smileGroups[0]?.id, page: 0 });
  const disabled = sending || !state?.thread;
  const needLogin = site?.capabilities.replyRequiresLogin && !account.connected;
  const sendLabel = reply && "\u56DE\u5E16\u5230 " + site.name;
  const PermissionIcon = permissionIcons[appearance.permission];
  function close(focus = false) {
    setPane("");
    setError("");
    if (focus) trigger.current?.focus({ preventScroll: true });
  }
  function open(next, event) {
    if (pane === next || isModel(pane) && next === "picker") {
      close(true);
      return;
    }
    trigger.current = event.currentTarget;
    const field = input.current;
    if (field) range.current = [field.selectionStart, field.selectionEnd];
    const selected = field?.value.slice(...range.current).trim() ?? "";
    setUrl(next === "image" && editor?.imageUrl(selected) || next === "link" && editor?.linkUrl(selected) ? selected : "");
    setError("");
    setPane(next);
  }
  function edit(kind, value, selection = range.current) {
    if (disabled || !input.current) return;
    const next = editor.editReply(draft.text, selection, kind, value);
    if (next.error) {
      setError(next.error);
      return;
    }
    restore.current = next.selection;
    close();
    reader.draft({ text: next.text });
  }
  function wrap(kind) {
    const field = input.current;
    if (field) edit(kind, "", [field.selectionStart, field.selectionEnd]);
  }
  (0, import_react7.useLayoutEffect)(() => {
    if (!restore.current || !input.current) return;
    input.current.focus({ preventScroll: true });
    input.current.setSelectionRange(...restore.current);
    restore.current = null;
  });
  (0, import_react7.useLayoutEffect)(() => {
    if (pane && popup.current) firstMenuButton(popup.current)?.focus({ preventScroll: true });
  }, [pane]);
  (0, import_react7.useEffect)(() => {
    if (!pane) return;
    function outside(event) {
      if (!bar.current?.contains(event.target)) close();
    }
    function escape(event) {
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      if (pane === "model" || pane === "effort") setPane("picker");
      else close(true);
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape, true);
    };
  }, [pane]);
  function arrows(event) {
    if (isUrl(pane) || pane === "face" || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = [...popup.current.querySelectorAll("button:not(:disabled)")];
    if (!buttons.length) return;
    event.preventDefault();
    const n = buttons.indexOf(document.activeElement);
    const index = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (n + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[index].focus();
  }
  const triggerProps = (key) => ({ "aria-haspopup": isUrl(key) || key === "face" ? "dialog" : "menu", "aria-expanded": key === "picker" ? isModel(pane) : pane === key, onClick: (e) => open(key, e) });
  const action = (fn) => () => {
    close(true);
    fn();
  };
  const item = (name2, fn, selected, unavailable = false) => /* @__PURE__ */ import_react7.default.createElement(
    "button",
    {
      key: name2,
      type: "button",
      role: selected === void 0 ? "menuitem" : "menuitemradio",
      "aria-checked": selected,
      disabled: unavailable,
      onClick: action(fn)
    },
    name2,
    selected && /* @__PURE__ */ import_react7.default.createElement(import_dsh_client_ui_primitives5.IconCheckOutlineRegular, { size: 14 })
  );
  return /* @__PURE__ */ import_react7.default.createElement("div", { className: "ngar-tools", ref: bar }, /* @__PURE__ */ import_react7.default.createElement("div", { className: "ngar-tool-left" }, /* @__PURE__ */ import_react7.default.createElement(Tool, { label: "\u4F1A\u8BDD\u9009\u9879", className: "ngar-add", ...triggerProps("options") }, /* @__PURE__ */ import_react7.default.createElement(import_dsh_client_ui_primitives5.IconPlusOutlineRegular, { size: 16 })), /* @__PURE__ */ import_react7.default.createElement(Tool, { label: "\u6743\u9650\u6A21\u5F0F\uFF1A" + appearance.permission, className: "ngar-chip ngar-permission", ...triggerProps("permission") }, /* @__PURE__ */ import_react7.default.createElement(PermissionIcon, { size: 14 }), /* @__PURE__ */ import_react7.default.createElement("span", null, appearance.permission), /* @__PURE__ */ import_react7.default.createElement(import_dsh_client_ui_primitives5.IconChevronDownOutlineRegular, { size: 12 })), reply && editor && /* @__PURE__ */ import_react7.default.createElement("div", { className: "ngar-formats", role: "group", "aria-label": "\u56DE\u5E16\u5DE5\u5177" }, /* @__PURE__ */ import_react7.default.createElement(Tool, { label: "\u8868\u60C5", disabled, ...triggerProps("face") }, /* @__PURE__ */ import_react7.default.createElement(LineIcon, { face: true })), /* @__PURE__ */ import_react7.default.createElement(Tool, { label: "\u52A0\u7C97", disabled, onClick: () => wrap("bold") }, /* @__PURE__ */ import_react7.default.createElement("b", { "aria-hidden": "true" }, "B")), /* @__PURE__ */ import_react7.default.createElement(Tool, { label: "\u5220\u9664\u7EBF", disabled, onClick: () => wrap("strike") }, /* @__PURE__ */ import_react7.default.createElement("s", { "aria-hidden": "true" }, "S")), /* @__PURE__ */ import_react7.default.createElement(Tool, { label: "\u5F15\u7528\u6587\u5B57", disabled, onClick: () => wrap("quote") }, /* @__PURE__ */ import_react7.default.createElement("span", { className: "ngar-quote-glyph", "aria-hidden": "true" }, "\u275D")), /* @__PURE__ */ import_react7.default.createElement(Tool, { label: "\u63D2\u5165\u94FE\u63A5", disabled, ...triggerProps("link") }, /* @__PURE__ */ import_react7.default.createElement(import_dsh_client_ui_primitives5.IconLinkOutlineRegular, { size: 16 })), /* @__PURE__ */ import_react7.default.createElement(Tool, { label: "\u63D2\u5165\u56FE\u7247\u94FE\u63A5", disabled, ...triggerProps("image") }, /* @__PURE__ */ import_react7.default.createElement(LineIcon, null))), primary && /* @__PURE__ */ import_react7.default.createElement(Tool, { label: primary.label, disabled: primary.disabled, onClick: primary.onClick }, /* @__PURE__ */ import_react7.default.createElement(PrimaryIcon, { size: 15 }))), /* @__PURE__ */ import_react7.default.createElement("div", { className: "ngar-send" }, reply && draft.text.trim() && /* @__PURE__ */ import_react7.default.createElement("span", { className: "ngar-send-note" }, needLogin ? "\u8FDE\u63A5\u8D26\u53F7\u540E\u56DE\u5E16" : sendLabel), /* @__PURE__ */ import_react7.default.createElement(Tool, { label: "\u9009\u62E9\u6A21\u578B\uFF1A" + appearance.model + "\uFF0C\u601D\u8003\u5F3A\u5EA6 " + appearance.effort, className: "ngar-chip ngar-model", ...triggerProps("picker") }, /* @__PURE__ */ import_react7.default.createElement(import_dsh_client_ui_primitives5.IconAgentPresetOutlineRegular, { className: "ngar-model-icon", size: 16 }), /* @__PURE__ */ import_react7.default.createElement("span", null, appearance.model), /* @__PURE__ */ import_react7.default.createElement("span", { className: "ngar-effort" }, appearance.effort), /* @__PURE__ */ import_react7.default.createElement(import_dsh_client_ui_primitives5.IconChevronDownOutlineRegular, { size: 12 })), reply ? /* @__PURE__ */ import_react7.default.createElement(
    Tool,
    {
      label: sendLabel,
      className: "ngar-send-btn",
      "aria-busy": sending,
      disabled: disabled || !draft.text.trim(),
      onClick: () => {
        close();
        if (needLogin) connect();
        else void reader.submit();
      }
    },
    sending ? /* @__PURE__ */ import_react7.default.createElement(import_dsh_client_ui_primitives5.IconLoadingOutlineRegular, { size: 16 }) : /* @__PURE__ */ import_react7.default.createElement("svg", { viewBox: "0 0 16 16", width: "16", height: "16", "aria-hidden": "true" }, /* @__PURE__ */ import_react7.default.createElement("path", { d: "M8 15V2M2 8l6-6 6 6", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinejoin: "round" }))
  ) : /* @__PURE__ */ import_react7.default.createElement(Tool, { label: "\u8FD4\u56DE\u5DE5\u4F5C\u5BF9\u8BDD", className: "ngar-round", onClick: back }, /* @__PURE__ */ import_react7.default.createElement(import_dsh_client_ui_primitives5.IconChevronLeftOutlineRegular, { size: 15 }))), pane && /* @__PURE__ */ import_react7.default.createElement(
    import_dsh_client_ui_primitives5.MenuSurface,
    {
      ref: popup,
      compact: true,
      className: "ngar-menu" + (isModel(pane) ? " ngar-menu-right" : ""),
      role: isUrl(pane) || pane === "face" ? "dialog" : "menu",
      "aria-label": labels[pane],
      onKeyDown: arrows
    },
    pane === "options" && options(item),
    pane === "face" && /* @__PURE__ */ import_react7.default.createElement(SmilePicker, { editor, site, position: facePosition, insert: (code) => edit("face", code) }),
    isUrl(pane) && /* @__PURE__ */ import_react7.default.createElement("form", { className: "ngar-url", onSubmit: (e) => {
      e.preventDefault();
      edit(pane, url);
    } }, /* @__PURE__ */ import_react7.default.createElement("label", null, pane === "image" ? site.name + " \u56FE\u7247\u5730\u5740" : "\u94FE\u63A5\u5730\u5740", /* @__PURE__ */ import_react7.default.createElement("input", { value: url, onChange: (e) => {
      setUrl(e.target.value);
      setError("");
    }, placeholder: "https://\u2026" })), error && /* @__PURE__ */ import_react7.default.createElement("p", { role: "alert" }, error), /* @__PURE__ */ import_react7.default.createElement("button", { type: "submit", disabled: !url.trim() }, "\u63D2\u5165")),
    pane === "picker" && ["model", "effort"].map((key) => /* @__PURE__ */ import_react7.default.createElement("button", { key, role: "menuitem", type: "button", onClick: () => setPane(key) }, labels[key], /* @__PURE__ */ import_react7.default.createElement("span", null, appearance[key]), /* @__PURE__ */ import_react7.default.createElement(import_dsh_client_ui_primitives5.IconChevronRightOutlineRegular, { size: 12 }))),
    Object.hasOwn(appearanceChoices, pane) && /* @__PURE__ */ import_react7.default.createElement(import_react7.default.Fragment, null, isModel(pane) && /* @__PURE__ */ import_react7.default.createElement("button", { className: "ngar-menu-back", type: "button", role: "menuitem", onClick: () => setPane("picker") }, /* @__PURE__ */ import_react7.default.createElement(import_dsh_client_ui_primitives5.IconChevronLeftOutlineRegular, { size: 12 }), labels[pane]), appearanceChoices[pane].map((choice) => item(choice, () => setAppearance(pane, choice), appearance[pane] === choice)))
  ), error && !isUrl(pane) && /* @__PURE__ */ import_react7.default.createElement("span", { role: "alert", className: "ngar-tool-error" }, error));
}

// src/client/board-dialog.jsx
var import_react8 = __toESM(require("react"), 1);
function BoardDialog({ library, site, onClose }) {
  const dialog = (0, import_react8.useRef)(null), pending = (0, import_react8.useRef)(null);
  const [value, setValue] = (0, import_react8.useState)(""), [results, setResults] = (0, import_react8.useState)(null);
  const [busy, setBusy] = (0, import_react8.useState)(false), [error, setError] = (0, import_react8.useState)("");
  const [notice, setNotice] = (0, import_react8.useState)("");
  const { openOnPick } = (0, import_react8.useContext)(ReadingOptions);
  (0, import_react8.useEffect)(() => {
    dialog.current.showModal();
    return () => pending.current?.abort();
  }, []);
  function close() {
    pending.current?.abort();
    onClose();
  }
  async function findOrOpen(selected) {
    const input = value.trim();
    if (!input || busy) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = selected ? { board: selected } : await library.findBoards(site.id, input, controller.signal);
      if (controller.signal.aborted) return;
      const ref = data.board;
      if (ref) {
        const result = await library.open(ref, controller.signal);
        if (controller.signal.aborted) return;
        if (result.settings.openOnPick) close();
        else setNotice("\u5DF2\u52A0\u5165\u5DE5\u4F5C\u533A\uFF0C\u53EF\u4EE5\u7EE7\u7EED\u67E5\u627E\u3002");
      } else {
        setResults(data.boards);
      }
    } catch (err) {
      if (!controller.signal.aborted) setError(err.message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return /* @__PURE__ */ import_react8.default.createElement("dialog", { ref: dialog, className: "ngar-dialog ngar-board-dialog", "aria-label": "\u6253\u5F00\u5176\u4ED6\u7248\u9762", onCancel: close }, /* @__PURE__ */ import_react8.default.createElement("div", { className: "ngar-dialog-head" }, /* @__PURE__ */ import_react8.default.createElement("h2", null, "\u6253\u5F00\u5176\u4ED6\u7248\u9762"), /* @__PURE__ */ import_react8.default.createElement("button", { type: "button", onClick: close, "aria-label": "\u5173\u95ED\u7248\u9762\u7A97\u53E3" }, "\xD7")), /* @__PURE__ */ import_react8.default.createElement("form", { onSubmit: (event) => {
    event.preventDefault();
    void findOrOpen();
  } }, /* @__PURE__ */ import_react8.default.createElement("label", null, site.inputLabel || "\u7248\u9762\u540D\u79F0\u3001\u94FE\u63A5\u6216\u7F16\u53F7", /* @__PURE__ */ import_react8.default.createElement(
    "input",
    {
      autoFocus: true,
      value,
      maxLength: 2048,
      disabled: busy,
      placeholder: site.inputHint,
      onChange: (event) => {
        setValue(event.target.value);
        setResults(null);
        setError("");
      }
    }
  )), /* @__PURE__ */ import_react8.default.createElement("button", { type: "submit", className: "ngar-btn", disabled: !value.trim() || busy }, busy ? "\u6B63\u5728\u8BFB\u53D6\u2026" : openOnPick ? "\u67E5\u627E\u5E76\u6253\u5F00" : "\u67E5\u627E\u7248\u9762")), results && (results.length ? /* @__PURE__ */ import_react8.default.createElement("ul", { "aria-label": "\u7248\u9762\u641C\u7D22\u7ED3\u679C" }, results.map((item) => /* @__PURE__ */ import_react8.default.createElement("li", { key: item.sessionId }, /* @__PURE__ */ import_react8.default.createElement("button", { type: "button", disabled: busy, onClick: () => void findOrOpen(item) }, item.name, /* @__PURE__ */ import_react8.default.createElement("small", null, item.kind, "=", item.id))))) : /* @__PURE__ */ import_react8.default.createElement("p", { role: "status" }, "\u6CA1\u6709\u627E\u5230\u5339\u914D\u7684\u7248\u9762\uFF0C\u53EF\u4EE5\u7C98\u8D34\u7248\u9762\u94FE\u63A5\u6253\u5F00\u3002")), error && /* @__PURE__ */ import_react8.default.createElement("p", { role: "alert" }, error), notice && /* @__PURE__ */ import_react8.default.createElement("p", { role: "status" }, notice));
}

// src/client/settings.jsx
var import_react9 = __toESM(require("react"), 1);
function DirectoryChooser({ workspace, value, onPick, onClose }) {
  const [path, setPath] = (0, import_react9.useState)(value || void 0), [listing, setListing] = (0, import_react9.useState)(null), [error, setError] = (0, import_react9.useState)("");
  (0, import_react9.useEffect)(() => {
    const controller = new AbortController();
    setListing(null);
    setError("");
    workspace.listDirectory(path, controller.signal).then((result) => {
      if (!controller.signal.aborted) setListing(result);
    }).catch((reason) => {
      if (!controller.signal.aborted) setError(reason.message);
    });
    return () => controller.abort();
  }, [workspace, path]);
  return /* @__PURE__ */ import_react9.default.createElement("div", { className: "ngar-folder-picker", role: "group", "aria-label": "\u9009\u62E9\u5BBF\u4E3B\u76EE\u5F55" }, listing && /* @__PURE__ */ import_react9.default.createElement(import_react9.default.Fragment, null, /* @__PURE__ */ import_react9.default.createElement("nav", { "aria-label": "\u76EE\u5F55\u8DEF\u5F84" }, listing.crumbs.map((crumb) => /* @__PURE__ */ import_react9.default.createElement(
    "button",
    {
      type: "button",
      key: crumb.path,
      disabled: crumb.path === listing.path,
      onClick: () => setPath(crumb.path)
    },
    crumb.name
  ))), /* @__PURE__ */ import_react9.default.createElement("div", { className: "ngar-folder-list" }, listing.entries.map((dir) => /* @__PURE__ */ import_react9.default.createElement(
    "button",
    {
      type: "button",
      key: dir.path,
      onClick: () => setPath(dir.path)
    },
    dir.name
  ))), /* @__PURE__ */ import_react9.default.createElement("button", { type: "button", className: "ngar-setting-button", onClick: () => onPick(listing.path) }, "\u9009\u62E9\u6B64\u76EE\u5F55")), error ? /* @__PURE__ */ import_react9.default.createElement("p", { role: "alert" }, error, "\u3000\u4E5F\u53EF\u4EE5\u76F4\u63A5\u8F93\u5165\u5BBF\u4E3B\u4E0A\u7684\u8DEF\u5F84\u3002") : !listing && /* @__PURE__ */ import_react9.default.createElement("p", { role: "status" }, "\u6B63\u5728\u8BFB\u53D6\u76EE\u5F55\u2026"), error && path && /* @__PURE__ */ import_react9.default.createElement("button", { type: "button", onClick: () => setPath(void 0) }, "\u56DE\u5230\u4E3B\u76EE\u5F55"), error && /* @__PURE__ */ import_react9.default.createElement("button", { type: "button", className: "ngar-setting-button", onClick: async () => {
    try {
      const dir = await workspace.pickDirectory();
      if (dir) onPick(dir);
    } catch (reason) {
      setError(reason.message);
    }
  } }, "\u7CFB\u7EDF\u76EE\u5F55\u9009\u62E9\u5668"), /* @__PURE__ */ import_react9.default.createElement("button", { type: "button", className: "ngar-setting-button", onClick: onClose }, "\u53D6\u6D88"));
}
function ReaderSettings({ library }) {
  const source = library.preferences;
  const current = (0, import_react9.useSyncExternalStore)(source.subscribe, source.snapshot);
  const [base2, setBase] = (0, import_react9.useState)(null), [draft, setDraft] = (0, import_react9.useState)(null), [folder, setFolder] = (0, import_react9.useState)("");
  const [message, setMessage] = (0, import_react9.useState)(""), [busy, setBusy] = (0, import_react9.useState)(false);
  (0, import_react9.useEffect)(() => {
    void source.load(true);
  }, [source]);
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(base2?.values);
  (0, import_react9.useEffect)(() => {
    if (current.revision && !dirty) {
      setBase(current);
      setDraft(current.values);
    }
  }, [current, dirty]);
  const change = (key, value) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setMessage("");
  };
  async function reload() {
    await source.load(true);
    const latest = source.snapshot();
    if (latest.revision) {
      setBase(latest);
      setDraft(latest.values);
    }
    setFolder("");
    setMessage("");
  }
  async function browse(field) {
    const native = window.__DSH_DIRECTORY_PICKER__;
    if (!native?.pick) {
      setFolder(field);
      return;
    }
    try {
      const path = await native.pick();
      if (path) change(field, path);
    } catch {
      setFolder(field);
    }
  }
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = await source.save(draft, base2.revision);
      setBase(result);
      setDraft(result.values);
      setFolder("");
      setMessage("\u5DF2\u4FDD\u5B58\u3002");
      try {
        await library.syncSettings();
      } catch (error) {
        setMessage("\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\uFF0C\u5DE5\u4F5C\u533A\u6682\u672A\u5237\u65B0\u3002" + error.message);
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }
  if (!draft) return /* @__PURE__ */ import_react9.default.createElement("p", { className: "ngar-hint", role: "status" }, current.warning || "\u6B63\u5728\u8BFB\u53D6\u8BBE\u7F6E\u2026", current.warning && /* @__PURE__ */ import_react9.default.createElement("button", { onClick: reload }, "\u91CD\u65B0\u8BFB\u53D6"));
  return /* @__PURE__ */ import_react9.default.createElement("form", { className: "ngar ngar-settings", "aria-label": "\u9605\u8BFB\u8BBE\u7F6E", onSubmit: save }, /* @__PURE__ */ import_react9.default.createElement("label", { className: "ngar-config-file" }, "\u914D\u7F6E\u6587\u4EF6", /* @__PURE__ */ import_react9.default.createElement("input", { "aria-label": "\u914D\u7F6E\u6587\u4EF6\u8DEF\u5F84", readOnly: true, value: base2.path, onFocus: (event) => event.target.select() })), current.warning && /* @__PURE__ */ import_react9.default.createElement("p", { role: "alert" }, current.warning), sections.map(([group, fields]) => /* @__PURE__ */ import_react9.default.createElement("fieldset", { key: group, disabled: busy }, /* @__PURE__ */ import_react9.default.createElement("legend", null, group), fields.map((field) => {
    const key = field.key, id = "ngar-pref-" + key;
    return /* @__PURE__ */ import_react9.default.createElement("div", { key, className: "ngar-pref" + (field.path ? " ngar-pref-path" : "") }, /* @__PURE__ */ import_react9.default.createElement("label", { htmlFor: id }, field.label), field.path ? /* @__PURE__ */ import_react9.default.createElement(import_react9.default.Fragment, null, /* @__PURE__ */ import_react9.default.createElement("div", null, /* @__PURE__ */ import_react9.default.createElement("input", { id, type: "text", value: draft[key], placeholder: "\u4F7F\u7528 DSH \u9ED8\u8BA4\u76EE\u5F55", onChange: (event) => change(key, event.target.value) }), /* @__PURE__ */ import_react9.default.createElement("button", { type: "button", className: "ngar-setting-button", onClick: () => void browse(key) }, "\u6D4F\u89C8\u2026")), /* @__PURE__ */ import_react9.default.createElement("small", null, "\u5F53\u524D\u4F7F\u7528 ", key === "cacheDirectory" ? base2.cachePath : base2.boardPath), folder === key && /* @__PURE__ */ import_react9.default.createElement(
      DirectoryChooser,
      {
        workspace: library.workspace,
        value: draft[key],
        onClose: () => setFolder(""),
        onPick: (path) => {
          change(key, path);
          setFolder("");
        }
      }
    )) : field.choices ? /* @__PURE__ */ import_react9.default.createElement("select", { id, value: draft[key], onChange: (event) => change(key, event.target.value) }, field.choices.map((choice) => /* @__PURE__ */ import_react9.default.createElement("option", { key: choice, value: choice }, choice))) : field.min !== void 0 ? /* @__PURE__ */ import_react9.default.createElement(
      "input",
      {
        id,
        type: "number",
        min: field.min,
        max: field.max,
        step: "1",
        required: true,
        value: draft[key],
        onChange: (event) => change(key, event.target.value === "" ? "" : Number(event.target.value))
      }
    ) : /* @__PURE__ */ import_react9.default.createElement("input", { id, type: "checkbox", checked: draft[key], onChange: (event) => change(key, event.target.checked) }), field.hint && /* @__PURE__ */ import_react9.default.createElement("small", null, field.hint));
  }))), /* @__PURE__ */ import_react9.default.createElement("div", { className: "ngar-settings-actions" }, /* @__PURE__ */ import_react9.default.createElement("button", { type: "submit", className: "ngar-setting-button", disabled: busy || !dirty && !current.warning }, "\u4FDD\u5B58\u8BBE\u7F6E"), /* @__PURE__ */ import_react9.default.createElement("button", { type: "button", className: "ngar-setting-button", disabled: busy, onClick: () => void reload() }, "\u91CD\u65B0\u8BFB\u53D6"), /* @__PURE__ */ import_react9.default.createElement("button", { type: "button", className: "ngar-setting-button", disabled: busy, onClick: () => {
    setDraft({ ...reader_settings_default });
    setMessage("\u4FDD\u5B58\u540E\u6062\u590D\u9ED8\u8BA4\u8BBE\u7F6E\u3002");
  } }, "\u6062\u590D\u9ED8\u8BA4"), /* @__PURE__ */ import_react9.default.createElement("span", { role: "status" }, message)));
}
function SettingsDialog({ library, onClose }) {
  const ref = (0, import_react9.useRef)(null);
  (0, import_react9.useEffect)(() => {
    ref.current.showModal();
  }, []);
  return /* @__PURE__ */ import_react9.default.createElement("dialog", { ref, className: "ngar ngar-dialog ngar-settings-dialog", "aria-label": "\u9605\u8BFB\u8BBE\u7F6E", onCancel: onClose }, /* @__PURE__ */ import_react9.default.createElement("div", { className: "ngar-dialog-head" }, /* @__PURE__ */ import_react9.default.createElement("h2", null, "\u9605\u8BFB\u8BBE\u7F6E"), /* @__PURE__ */ import_react9.default.createElement("button", { type: "button", "aria-label": "\u5173\u95ED\u9605\u8BFB\u8BBE\u7F6E", onClick: onClose }, "\xD7")), /* @__PURE__ */ import_react9.default.createElement(ReaderSettings, { library }));
}

// src/client/directory-editor.jsx
var import_react10 = __toESM(require("react"), 1);
var nextId = 0;
var row = (name2 = "", fields = {}) => ({ id: ++nextId, name: name2, ...fields });
function draftOf(categories) {
  return categories.filter((c) => !c.kind).map((c) => row(c.name, {
    key: c.key,
    error: c.error,
    groups: c.groups.map((g) => row(g.name, { boards: g.boards.map((b) => row(b.name)) }))
  }));
}
var update = (rows, id, fields) => rows.map((r) => r.id === id ? { ...r, ...fields } : r);
function move(rows, index, offset) {
  const next = [...rows];
  next.splice(index + offset, 0, ...next.splice(index, 1));
  return next;
}
function RowActions({ what, rows, index, change }) {
  return /* @__PURE__ */ import_react10.default.createElement("span", { className: "ngar-row-actions" }, /* @__PURE__ */ import_react10.default.createElement("button", { type: "button", "aria-label": "\u4E0A\u79FB" + what, title: "\u4E0A\u79FB" + what, disabled: index === 0, onClick: () => change(move(rows, index, -1)) }, "\u2191"), /* @__PURE__ */ import_react10.default.createElement("button", { type: "button", "aria-label": "\u4E0B\u79FB" + what, title: "\u4E0B\u79FB" + what, disabled: index === rows.length - 1, onClick: () => change(move(rows, index, 1)) }, "\u2193"), /* @__PURE__ */ import_react10.default.createElement("button", { type: "button", "aria-label": "\u5220\u9664" + what, onClick: () => change(rows.filter((_, i) => i !== index)) }, "\u5220\u9664"));
}
function DirectoryEditor({ library, onClose }) {
  const dialog = (0, import_react10.useRef)(null), source = library.directory("tieba");
  const [base2, setBase] = (0, import_react10.useState)(null), [rows, setRows] = (0, import_react10.useState)([]), [selected, select] = (0, import_react10.useState)(null);
  const [message, setMessage] = (0, import_react10.useState)(""), [busy, setBusy] = (0, import_react10.useState)(false);
  const active = rows.find((r) => r.id === selected) ?? rows[0];
  function changeCategory(fields) {
    setRows(update(rows, active.id, fields));
  }
  function changeGroup(group, fields) {
    changeCategory({ groups: update(active.groups, group.id, fields) });
  }
  async function reload() {
    setBusy(true);
    try {
      await source.load();
      const state = source.snapshot();
      if (state.error) throw new Error(state.error);
      setBase(state);
      setRows(draftOf(state.categories));
      select(null);
      setMessage("");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }
  (0, import_react10.useEffect)(() => {
    dialog.current.showModal();
    void reload();
  }, []);
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const categories = rows.map((c) => ({ key: c.key, name: c.name, groups: c.error ? null : c.groups.map((g) => ({ name: g.name, boards: g.boards.map((b) => b.name) })) }));
      await library.saveDirectory(categories, base2.revision);
      onClose();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }
  function newCategory() {
    const next = row("", { groups: [] });
    setRows([...rows, next]);
    select(next.id);
  }
  return /* @__PURE__ */ import_react10.default.createElement(
    "dialog",
    {
      ref: dialog,
      className: "ngar ngar-dialog ngar-directory-editor",
      "aria-label": "\u7F16\u8F91\u9009\u5427\u76EE\u5F55",
      onCancel: (event) => {
        if (busy) event.preventDefault();
        else onClose();
      }
    },
    /* @__PURE__ */ import_react10.default.createElement("div", { className: "ngar-dialog-head" }, /* @__PURE__ */ import_react10.default.createElement("h2", null, "\u7F16\u8F91\u9009\u5427\u76EE\u5F55"), /* @__PURE__ */ import_react10.default.createElement("button", { type: "button", "aria-label": "\u5173\u95ED\u76EE\u5F55\u7F16\u8F91\u5668", disabled: busy, onClick: onClose }, "\xD7")),
    base2 && /* @__PURE__ */ import_react10.default.createElement("p", { className: "ngar-directory-path" }, "\u5206\u7C7B\u6587\u4EF6\u4FDD\u5B58\u5728 ", /* @__PURE__ */ import_react10.default.createElement("code", null, base2.path)),
    /* @__PURE__ */ import_react10.default.createElement("form", { onSubmit: save }, /* @__PURE__ */ import_react10.default.createElement("fieldset", { disabled: !base2 || busy }, /* @__PURE__ */ import_react10.default.createElement("div", { className: "ngar-editor-row" }, /* @__PURE__ */ import_react10.default.createElement("select", { "aria-label": "\u9009\u62E9\u666E\u901A\u5206\u7C7B", value: active?.id ?? "", onChange: (e) => select(Number(e.target.value)) }, !rows.length && /* @__PURE__ */ import_react10.default.createElement("option", { value: "" }, "\u6682\u65E0\u666E\u901A\u5206\u7C7B"), rows.map((c) => /* @__PURE__ */ import_react10.default.createElement("option", { value: c.id, key: c.id }, c.name ? c.name + ".ts" : "\u672A\u547D\u540D\u5206\u7C7B"))), /* @__PURE__ */ import_react10.default.createElement("button", { type: "button", onClick: newCategory }, "\u65B0\u5EFA\u5206\u7C7B")), active && /* @__PURE__ */ import_react10.default.createElement("div", { key: active.id }, /* @__PURE__ */ import_react10.default.createElement("div", { className: "ngar-editor-row" }, /* @__PURE__ */ import_react10.default.createElement("label", null, "\u5206\u7C7B\u6587\u4EF6\u540D", /* @__PURE__ */ import_react10.default.createElement("input", { value: active.name, required: true, onChange: (e) => changeCategory({ name: e.target.value }) })), /* @__PURE__ */ import_react10.default.createElement("span", null, ".ts"), /* @__PURE__ */ import_react10.default.createElement(RowActions, { what: "\u5206\u7C7B", rows, index: rows.indexOf(active), change: setRows })), active.error ? /* @__PURE__ */ import_react10.default.createElement("p", { role: "alert" }, active.error, " \u8BF7\u5728\u6587\u4EF6\u4E2D\u4FEE\u6B63\u540E\u91CD\u65B0\u8BFB\u53D6\u3002") : /* @__PURE__ */ import_react10.default.createElement(import_react10.default.Fragment, null, active.groups.map((group, index) => /* @__PURE__ */ import_react10.default.createElement("div", { key: group.id, className: "ngar-editor-group" }, /* @__PURE__ */ import_react10.default.createElement("div", { className: "ngar-editor-row" }, /* @__PURE__ */ import_react10.default.createElement("label", null, "\u5206\u7EC4\u540D\u79F0", /* @__PURE__ */ import_react10.default.createElement(
      "input",
      {
        required: true,
        value: group.name,
        onChange: (e) => changeGroup(group, { name: e.target.value })
      }
    )), /* @__PURE__ */ import_react10.default.createElement(RowActions, { what: "\u5206\u7EC4", rows: active.groups, index, change: (groups) => changeCategory({ groups }) })), group.boards.map((board2, i) => /* @__PURE__ */ import_react10.default.createElement("div", { className: "ngar-editor-row", key: board2.id }, /* @__PURE__ */ import_react10.default.createElement(
      "input",
      {
        "aria-label": "\u5427\u540D " + (i + 1),
        placeholder: "\u5427\u540D",
        required: true,
        value: board2.name,
        onChange: (e) => changeGroup(group, { boards: update(group.boards, board2.id, { name: e.target.value }) })
      }
    ), /* @__PURE__ */ import_react10.default.createElement(RowActions, { what: "\u5427\u6761\u76EE", rows: group.boards, index: i, change: (boards) => changeGroup(group, { boards }) }))), /* @__PURE__ */ import_react10.default.createElement("button", { type: "button", onClick: () => changeGroup(group, { boards: [...group.boards, row()] }) }, "\u6DFB\u52A0\u5427"))), /* @__PURE__ */ import_react10.default.createElement("button", { type: "button", onClick: () => changeCategory({ groups: [...active.groups, row("", { boards: [] })] }) }, "\u65B0\u5EFA\u5206\u7EC4")))), message && /* @__PURE__ */ import_react10.default.createElement("p", { role: "alert" }, message), /* @__PURE__ */ import_react10.default.createElement("div", { className: "ngar-editor-footer" }, /* @__PURE__ */ import_react10.default.createElement("button", { type: "button", disabled: busy, onClick: reload }, "\u91CD\u65B0\u8BFB\u53D6\u6587\u4EF6"), /* @__PURE__ */ import_react10.default.createElement("button", { type: "button", disabled: busy, onClick: onClose }, "\u53D6\u6D88"), /* @__PURE__ */ import_react10.default.createElement("button", { type: "submit", disabled: busy || !base2 }, "\u4FDD\u5B58\u76EE\u5F55")))
  );
}

// src/client/composer.jsx
function BoardComposer({ reader, board: board2, directoryBlank, library, back }) {
  const state = (0, import_react11.useSyncExternalStore)(reader.subscribe, reader.snapshot);
  const catalog = (0, import_react11.useSyncExternalStore)(library.subscribe, library.snapshot);
  const [accountOpen, setAccountOpen] = (0, import_react11.useState)(false);
  const [settingsOpen, setSettingsOpen] = (0, import_react11.useState)(false);
  const [directoryOpen, setDirectoryOpen] = (0, import_react11.useState)(false);
  const [boardOpen, setBoardOpen] = (0, import_react11.useState)(false), [status, setStatus] = (0, import_react11.useState)("");
  const input = (0, import_react11.useRef)(null);
  const { id, draft, sending } = state;
  const { site } = reader;
  const { reply, quote, login } = site.capabilities;
  const lookup = site.capabilities.lookup;
  async function sync() {
    setStatus("\u6B63\u5728\u540C\u6B65\u6536\u85CF\u7248\u9762\u2026");
    try {
      const result = await library.sync(site.id);
      setStatus(result.warning || "\u5DF2\u540C\u6B65 " + result.favoriteCount + " \u4E2A\u6536\u85CF\u7248\u9762\u3002");
    } catch (error) {
      setStatus(error.message);
    }
  }
  async function remove() {
    try {
      await library.remove(board2);
      setStatus("\u5DF2\u79FB\u9664\u624B\u52A8\u5165\u53E3\u3002");
    } catch (error) {
      setStatus(error.message);
    }
  }
  (0, import_react11.useEffect)(() => {
    if (draft.quote) input.current?.focus({ preventScroll: true });
  }, [draft.quote]);
  (0, import_react11.useEffect)(() => {
    if (directoryBlank) reader.activate();
  }, [directoryBlank, reader]);
  return /* @__PURE__ */ import_react11.default.createElement("div", { className: "ngar ngar-composer-seat" }, directoryBlank && /* @__PURE__ */ import_react11.default.createElement(CategoryCards, { site, library }), /* @__PURE__ */ import_react11.default.createElement("div", { className: "ngar-composer" }, Boolean(id) && quote && draft.quote && /* @__PURE__ */ import_react11.default.createElement("div", { className: "ngar-target" }, /* @__PURE__ */ import_react11.default.createElement("span", null, "\u5F15\u7528 ", draft.quote.floor ? draft.quote.floor + " \u697C" : "\u4E3B\u697C", " \xB7 ", draft.quote.excerpt), /* @__PURE__ */ import_react11.default.createElement("button", { type: "button", disabled: sending, "aria-label": "\u53D6\u6D88\u5F15\u7528", onClick: () => reader.draft({ quote: null }) }, "\xD7")), !board2.kind ? lookup && /* @__PURE__ */ import_react11.default.createElement("button", { type: "button", className: "ngar-entry-input", onClick: () => setBoardOpen(true) }, "\u67E5\u627E\u7248\u9762\u2026") : id ? /* @__PURE__ */ import_react11.default.createElement(
    "textarea",
    {
      ref: input,
      "aria-label": reply ? "\u56DE\u5E16\u8349\u7A3F" : "\u672C\u5730\u8349\u7A3F",
      placeholder: reply ? "\u5199\u4E00\u6761\u56DE\u590D\u2026" : "\u5199\u4E0B\u672C\u5730\u8349\u7A3F\u2026",
      maxLength: 8e3,
      value: draft.text,
      disabled: sending || !state.thread,
      onChange: (event) => reader.draft({ text: event.target.value })
    }
  ) : /* @__PURE__ */ import_react11.default.createElement("input", { "aria-label": "\u7B5B\u9009\u672C\u9875\u8BA8\u8BBA", placeholder: "\u67E5\u627E\u672C\u9875\u8BA8\u8BBA\u2026", value: state.query, onChange: (event) => reader.filter(event.target.value) }), /* @__PURE__ */ import_react11.default.createElement(
    ReplyToolbar,
    {
      key: id,
      state,
      reader,
      input,
      back,
      connect: () => setAccountOpen(true),
      browseBoards: library.browse,
      openBoards: lookup ? () => setBoardOpen(true) : null,
      openSettings: () => setSettingsOpen(true),
      editDirectory: site.id === "tieba" && site.capabilities.editDirectory ? () => setDirectoryOpen(true) : null,
      syncBoards: sync,
      removeBoard: catalog.manual.includes(board2.sessionId) ? remove : null,
      entryOnly: !board2.kind,
      warning: catalog.warnings?.[site.id]
    }
  )), status && /* @__PURE__ */ import_react11.default.createElement("p", { className: "ngar-library-status", role: "status" }, status), accountOpen && login && /* @__PURE__ */ import_react11.default.createElement(AccountDialog, { reader, account: state.account, onClose: () => setAccountOpen(false), onChange: async () => {
    setAccountOpen(false);
    try {
      await library.accountChanged(site);
    } catch (error) {
      setStatus(error.message);
    }
  } }), boardOpen && lookup && /* @__PURE__ */ import_react11.default.createElement(BoardDialog, { library, site, onClose: () => setBoardOpen(false) }), settingsOpen && /* @__PURE__ */ import_react11.default.createElement(SettingsDialog, { library, onClose: () => setSettingsOpen(false) }), directoryOpen && /* @__PURE__ */ import_react11.default.createElement(DirectoryEditor, { library, onClose: () => setDirectoryOpen(false) }));
}

// src/client/followed.js
function followedDirectory(api) {
  const listeners = /* @__PURE__ */ new Set();
  let state = { phase: "idle", boards: [] }, version = 0, checking = false;
  const set = (next) => {
    state = next;
    for (const fn of listeners) fn();
  };
  function clear(phase = "idle") {
    ++version;
    set({ phase, boards: [] });
  }
  async function open(prompt = true) {
    clear("loading");
    const id = version;
    try {
      const account = await api("account");
      if (id !== version) return;
      if (!account.connected) {
        set({ phase: prompt ? "login" : "signedOut", boards: [] });
        return;
      }
      set({ phase: "loading", account, boards: [] });
      const result = await api("followedBoards", { generation: account.generation });
      if (id === version && result.generation === account.generation) set({ phase: "ready", account, boards: result.boards });
    } catch (error) {
      if (id !== version) return;
      if (error.code === "LOGIN_REQUIRED") {
        if (state.account) set({ phase: "reauth", account: state.account, boards: [] });
        else set({ phase: prompt ? "login" : "signedOut", boards: [] });
        return;
      }
      set({ phase: "error", account: error.code === "ACCOUNT_CHANGED" ? null : state.account, boards: [], error: error.message });
    }
  }
  async function check() {
    if (checking || !["ready", "error", "signedOut", "reauth"].includes(state.phase)) return;
    const id = version;
    checking = true;
    try {
      const current = await api("account");
      if (id === version && (current.generation || "") !== (state.account?.generation || "")) await open(false);
    } catch (error) {
      if (id === version) {
        clear("error");
        set({ ...state, error: error.message });
      }
    } finally {
      checking = false;
    }
  }
  async function logout(switching, changed) {
    clear("loading");
    const id = version;
    try {
      await api("logout");
      changed();
      if (id === version) {
        if (switching) await open(true);
        else clear("signedOut");
      }
    } catch (error) {
      if (id === version) set({ phase: "error", boards: [], error: error.message });
    }
  }
  return {
    api,
    open,
    check,
    clear,
    logout,
    snapshot: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }
  };
}

// src/client/remove-board.jsx
var import_react12 = __toESM(require("react"), 1);
var import_dsh_client_ui_primitives6 = require("@deepseek-ai/dsh-client-ui-primitives");
function BoardRemoveAction({ sessionId, library, close }) {
  const catalog = (0, import_react12.useSyncExternalStore)(library.subscribe, library.snapshot);
  const [pending, setPending] = (0, import_react12.useState)(false), [error, setError] = (0, import_react12.useState)("");
  const label = "\u5220\u9664\u624B\u52A8\u7248\u9762\u53CA\u672C\u5730\u9605\u8BFB\u8BB0\u5F55";
  async function remove() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await library.remove(boardForSession2(sessionId));
      close?.();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setPending(false);
    }
  }
  const Wrapper = close ? "div" : "span";
  return /* @__PURE__ */ import_react12.default.createElement(Wrapper, { className: "ngar-managed-action" }, catalog.manual.includes(sessionId) && (close ? /* @__PURE__ */ import_react12.default.createElement(import_dsh_client_ui_primitives6.MenuItemButton, { danger: true, disabled: pending, icon: /* @__PURE__ */ import_react12.default.createElement(import_dsh_client_ui_primitives6.IconTrashOutlineRegular, { size: 14 }), onSelect: () => void remove() }, label) : /* @__PURE__ */ import_react12.default.createElement("button", { type: "button", className: "ngar-remove", title: label, "aria-label": label, disabled: pending, onClick: () => void remove() }, /* @__PURE__ */ import_react12.default.createElement(import_dsh_client_ui_primitives6.IconArchiveOutlineRegular, { size: 14 }))), error && /* @__PURE__ */ import_react12.default.createElement("span", { role: "alert", className: "ngar-remove-error" }, error));
}
function BoardRemoveMenu({ useMenuOpenState, ...props }) {
  const [, setOpen] = useMenuOpenState();
  return /* @__PURE__ */ import_react12.default.createElement(BoardRemoveAction, { ...props, close: () => setOpen(false) });
}

// src/client/settings-store.js
function preferences(api) {
  const listeners = /* @__PURE__ */ new Set();
  let state = { values: reader_settings_default, path: "", warning: "", revision: null }, pending, version = 0;
  function set(next) {
    state = next;
    for (const notify of listeners) notify();
  }
  function invalidateReads() {
    ++version;
    pending = void 0;
  }
  function load(force = false) {
    if (!pending && (force || state.revision === null)) {
      const ticket = version;
      pending = api("getSettings").then((next) => {
        if (ticket === version) set(next);
      }).catch((error) => {
        if (ticket === version) set({ ...state, warning: error.message });
      }).finally(() => {
        if (ticket === version) pending = void 0;
      });
    }
    return pending ?? Promise.resolve();
  }
  return {
    snapshot: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    load,
    async save(values, revision) {
      invalidateReads();
      const result = await api("saveSettings", { values, revision });
      invalidateReads();
      set(result);
      return result;
    }
  };
}

// src/client/workspace-navigation.js
function readTab(key) {
  try {
    return sessionStorage.getItem("dsh-nga-reader." + key);
  } catch {
    return null;
  }
}
function saveTab(key, value) {
  try {
    sessionStorage.setItem("dsh-nga-reader." + key, value);
  } catch {
  }
}
function workspaceNavigation(ctx, workspaces, loadWorkspaces) {
  let previous = readTab("previous"), lastBoard = readTab("last-board");
  let lastSite = readTab("last-site") || boardForSession2(lastBoard)?.site || legacySite;
  const current = () => ctx.sidebarRight.mounted.getSnapshot();
  const nativeWorkspaces = () => ctx.workspaces.list.getSnapshot().items;
  function workspaceSite(workspace) {
    return workspace && ([...workspaces.values()].find((item) => item.workspaceId === workspace.workspaceId)?.site ?? workspace.sessionIds.map(boardForSession2).find(Boolean)?.site);
  }
  function readingSession(id) {
    const ref = boardForSession2(id);
    if (ref) return ref;
    if (!id || !ctx.sessions.list.getSnapshot().byId[id]?.blank) return null;
    const site = workspaceSite(nativeWorkspaces().find((item) => item.sessionIds.includes(id)));
    return site ? entryForSite(site) : null;
  }
  function rememberCurrent() {
    const id = current();
    const ref = readingSession(id);
    if (ref) {
      if (ref.site !== lastSite) {
        lastSite = ref.site;
        saveTab("last-site", ref.site);
      }
      if (ref.kind && id !== lastBoard) {
        lastBoard = id;
        saveTab("last-board", id);
      }
    } else if (id && id !== previous) {
      const session = ctx.sessions.list.getSnapshot().byId[id];
      if (session && (!session.blank || nativeWorkspaces().some((item) => item.sessionIds.includes(id)))) {
        previous = id;
        saveTab("previous", id);
      }
    }
  }
  function forgetBoard(id) {
    if (lastBoard === id) {
      lastBoard = null;
      saveTab("last-board", "");
    }
  }
  function destination(result) {
    return result.boards.some((item) => item.sessionId === lastBoard) ? lastBoard : result.sessionId;
  }
  function browse(from) {
    if (from && from !== current()) return;
    const site = readingSession(current())?.site;
    const id = site && (workspaces.get(site)?.workspaceId ?? nativeWorkspaces().find((item) => workspaceSite(item) === site)?.workspaceId);
    if (id) ctx.uiWorkspace.startSession(id);
  }
  function back() {
    const sessions = ctx.sessions.list.getSnapshot().byId;
    if (previous && sessions[previous] && !readingSession(previous)) {
      ctx.uiWorkspace.openSession(previous);
    } else {
      const other = nativeWorkspaces().find((item) => !workspaceSite(item));
      ctx.uiWorkspace.startSession(other?.workspaceId);
    }
  }
  async function toggle() {
    if (readingSession(current())) return back();
    const navigation = ctx.layout.beginNavigation();
    if (!workspaces.has(lastSite)) await loadWorkspaces();
    const result = workspaces.get(lastSite) ?? workspaces.get(legacySite);
    if (result && !navigation.aborted) ctx.uiWorkspace.openSession(destination(result));
  }
  return { current, readingSession, rememberCurrent, forgetBoard, destination, browse, back, toggle };
}

// src/client/excerpt-store.js
var empty = () => ({
  rows: [],
  batch: -1,
  run: "",
  generation: null,
  more: true,
  loading: false,
  refreshing: false,
  refreshError: "",
  refreshErrorCode: "",
  error: "",
  errorCode: "",
  query: "",
  selected: "",
  note: null,
  noteError: "",
  noteErrorCode: "",
  media: false,
  index: 0,
  large: false,
  discussion: null,
  commentLoading: false,
  commentError: "",
  login: "",
  loginBusy: false,
  accountError: ""
});
function excerptStore(api, broadcast = () => {
}) {
  let state = empty(), epoch = 0, selection = 0, anchor, restore, poll, loginSeq = 0;
  const listeners = /* @__PURE__ */ new Set();
  function set(patch) {
    state = { ...state, ...patch };
    for (const fn of listeners) fn();
  }
  function reset(generation) {
    ++epoch;
    ++selection;
    ++loginSeq;
    clearTimeout(poll);
    anchor = null;
    set({ ...empty(), generation });
  }
  function acceptError(error, field) {
    if (error.code === "ACCOUNT_CHANGED") {
      reset(null);
      activate();
      return;
    }
    set({ [field]: error.message, ...["error", "noteError", "refreshError"].includes(field) ? { [field + "Code"]: error.code } : {} });
  }
  async function check() {
    const n = epoch, previous = state.generation;
    try {
      const { generation } = await api("feedStatus");
      if (n !== epoch) return;
      if (previous !== null && state.generation !== generation) {
        reset(generation);
        await load();
      } else if (state.generation === null) set({ generation });
    } catch {
    }
  }
  async function load() {
    if (state.loading || !state.more || state.loginBusy || state.login) return;
    const n = epoch, batch = state.batch + 1, run = state.run;
    set({ loading: true, error: "", errorCode: "", refreshError: "", refreshErrorCode: "" });
    try {
      const data = await api("homeFeed", { run, batch });
      if (n !== epoch) return;
      if (run && run !== data.run || state.generation !== null && state.generation !== data.generation) {
        reset(data.generation);
        return load();
      }
      const known = new Set(state.rows.map((x) => x.id));
      set({ run: data.run, generation: data.generation, rows: [...state.rows, ...data.items.filter((row2) => !known.has(row2.id))], batch, more: data.more });
    } catch (e) {
      if (n === epoch) acceptError(e, "error");
    } finally {
      if (n === epoch) set({ loading: false });
    }
  }
  function activate() {
    void check();
    if (state.batch < 0 && !state.error) void load();
  }
  function close(focus = true) {
    ++selection;
    set({ selected: "", note: null, noteError: "", noteErrorCode: "", media: false, large: false, index: 0, discussion: null, commentError: "", commentLoading: false });
    if (focus && anchor) restore?.(anchor, true);
  }
  async function select(id) {
    const n = ++selection;
    set({ selected: id, note: null, noteError: "", noteErrorCode: "", media: false, large: false, index: 0, discussion: null, commentLoading: false, commentError: "" });
    try {
      const note = await api("feedNote", { run: state.run, id });
      if (n === selection && note.id === id) set({ note });
    } catch (error) {
      if (n === selection) acceptError(error, "noteError");
    }
  }
  async function comments() {
    if (state.commentLoading || state.discussion?.more === false) return;
    const n = selection, prior = state.discussion, batch = prior ? prior.batch + 1 : 0;
    set({ commentLoading: true, commentError: "" });
    try {
      const result = await api("feedComments", { run: state.run, id: state.selected, batch });
      const seen = new Set(prior?.items.map((x) => x.id));
      if (n === selection) set({ discussion: { ...result, items: [...prior?.items ?? [], ...result.items.filter((c) => !seen.has(c.id))] } });
    } catch (e) {
      if (n === selection) acceptError(e, "commentError");
    } finally {
      if (n === selection) set({ commentLoading: false });
    }
  }
  function conceal() {
    if (state.media) set({ media: false, large: false });
  }
  async function connect() {
    if (state.loginBusy || state.login || state.refreshing) return;
    const seq = ++loginSeq;
    conceal();
    set({ loginBusy: true, accountError: "" });
    let ticket;
    try {
      ;
      ({ ticket } = await api("feedLogin"));
      if (seq !== loginSeq) {
        await api("feedCancel", { ticket }).catch(() => {
        });
        return;
      }
      set({ login: ticket, loginBusy: false });
      async function tick() {
        try {
          const result = await api("feedPoll", { ticket });
          if (seq !== loginSeq) return;
          if (result.pending) poll = setTimeout(tick, 1250);
          else {
            reset(result.generation);
            broadcast();
            void load();
          }
        } catch (e) {
          if (seq === loginSeq) set({ login: "", accountError: e.message });
        }
      }
      void tick();
    } catch (e) {
      if (seq === loginSeq) set({ login: "", loginBusy: false, accountError: e.message });
    }
  }
  async function cancelLogin() {
    const ticket = state.login;
    ++loginSeq;
    clearTimeout(poll);
    set({ login: "", loginBusy: false });
    if (ticket) await api("feedCancel", { ticket }).catch(() => {
    });
  }
  async function logout() {
    const generation = state.generation;
    reset(null);
    try {
      await api("feedLogout", { generation });
      reset("");
      broadcast();
      void load();
    } catch (e) {
      set({ accountError: e.message });
      void check();
    }
  }
  async function refresh() {
    if (state.loading || state.loginBusy || state.login) return false;
    const n = epoch;
    set({ loading: true, refreshing: true, refreshError: "", refreshErrorCode: "" });
    try {
      const data = await api("feedRefresh", { run: state.run, generation: state.generation });
      if (n !== epoch) return false;
      ++epoch;
      ++selection;
      anchor = null;
      set({ ...empty(), run: data.run, generation: data.generation, batch: data.batch, more: data.more, rows: data.items, query: state.query });
      return true;
    } catch (e) {
      if (n === epoch) acceptError(e, "refreshError");
      return false;
    } finally {
      if (n === epoch) set({ loading: false, refreshing: false });
    }
  }
  return {
    snapshot: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    activate,
    load,
    check,
    select,
    comments,
    close,
    conceal,
    connect,
    cancelLogin,
    logout,
    refresh,
    filter: (query) => set({ query }),
    remember: (id, offset) => {
      anchor = { id, offset };
    },
    onRestore(fn) {
      restore = fn;
      return () => {
        if (restore === fn) restore = null;
      };
    },
    reveal() {
      if (state.note) set({ media: true, large: false });
    },
    zoom() {
      if (state.media) set({ large: !state.large });
    },
    step(delta) {
      if (state.media && state.note?.type === "normal") set({ index: Math.max(0, Math.min(state.note.images.length - 1, state.index + delta)) });
    },
    dispose() {
      void cancelLogin();
      reset(null);
      listeners.clear();
    }
  };
}

// src/client/excerpts.jsx
var import_react13 = __toESM(require("react"), 1);
var import_dsh_client_ui_primitives7 = require("@deepseek-ai/dsh-client-ui-primitives");
var excerptAddress = "dsh-resource://dsh-nga-reader/excerpts/preview.md";
var excerptTab = { id: "dsh-nga-reader-excerpt", kind: "dsh-nga-reader-excerpt", patterns: [excerptAddress], title: () => "\u6458\u5F55.md" };
var useReader = (source) => (0, import_react13.useSyncExternalStore)(source.subscribe, source.snapshot);
var appearanceKey = readingPrefix(entryForSite("xhs").sessionId) + "appearance";
function ReadingStatus({ label }) {
  const whale = require.asset("plugins/@deepseek-ai/dsh-client-ui-chat/assets/running-whale%402x-06738fa29b2f.png");
  return /* @__PURE__ */ import_react13.default.createElement("div", { className: "ngar-reading-status", role: "status", "aria-label": label, style: { "--ngar-whale": 'url("' + whale + '")' } }, /* @__PURE__ */ import_react13.default.createElement("span", { className: "ngar-reading-icon", "aria-hidden": "true" }, /* @__PURE__ */ import_react13.default.createElement(import_dsh_client_ui_primitives7.IconThinkOutlineRegular, { size: 14 })), /* @__PURE__ */ import_react13.default.createElement(import_dsh_client_ui_primitives7.TextShimmer, { active: true }, "\u6DF1\u5EA6\u6C42\u7D22\u4E2D"));
}
function ExcerptIndex({ source, open, refresh, mounted, sessionId }) {
  const state = useReader(source);
  const active = (0, import_react13.useSyncExternalStore)(mounted.subscribe, mounted.getSnapshot) === sessionId;
  const [expanded, setExpanded] = (0, import_react13.useState)(true);
  const box = (0, import_react13.useRef)(null), end = (0, import_react13.useRef)(null), settle = (0, import_react13.useRef)(null);
  (0, import_react13.useEffect)(() => {
    if (!active) return;
    source.activate();
    const check = () => {
      if (!document.hidden) void source.check();
    };
    const timer = setInterval(check, 6e3);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", check);
      source.conceal();
    };
  }, [source, active]);
  (0, import_react13.useLayoutEffect)(() => {
    if (!active) return;
    function adjust(anchor, focus) {
      settle.current?.();
      const el = box.current;
      const row2 = Array.from(el.querySelectorAll("[data-note-id]")).find((node) => node.dataset.noteId === anchor.id);
      if (!row2) return;
      const align = () => {
        if (!row2.isConnected) return;
        el.scrollTop += row2.getBoundingClientRect().top - el.getBoundingClientRect().top - anchor.offset;
      };
      align();
      const frame = requestAnimationFrame(() => {
        align();
        if (focus) row2.focus({ preventScroll: true });
      });
      const observer = new ResizeObserver(align);
      observer.observe(el);
      const gestures = ["wheel", "touchstart", "pointerdown", "keydown"];
      const end2 = () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        clearTimeout(timer);
        for (const name2 of gestures) el.removeEventListener(name2, end2);
      };
      const timer = setTimeout(end2, 350);
      for (const name2 of gestures) el.addEventListener(name2, end2, { passive: true });
      settle.current = end2;
    }
    const off = source.onRestore(adjust);
    return () => {
      off();
      settle.current?.();
    };
  }, [source, active]);
  (0, import_react13.useLayoutEffect)(() => {
    settle.current?.();
    if (box.current) box.current.scrollTop = 0;
  }, [state.run]);
  const query = state.query.trim().toLocaleLowerCase();
  (0, import_react13.useEffect)(() => {
    if (!active || !expanded || query || state.error || state.loading || state.login || state.loginBusy || !state.more || state.batch < 0 || !end.current) return;
    let observing = true;
    const observer = new IntersectionObserver((entries) => {
      if (observing && entries.some((e) => e.isIntersecting)) void source.load();
    }, { root: box.current, rootMargin: "0px 0px 40px" });
    observer.observe(end.current);
    return () => {
      observing = false;
      observer.disconnect();
    };
  }, [active, expanded, query, state.error, state.loading, state.login, state.loginBusy, state.more, state.batch, source]);
  const rows = query ? state.rows.filter((x) => (x.title + " " + x.author).toLocaleLowerCase().includes(query)) : state.rows;
  const issue = state.refreshError || state.error, code = state.refreshError ? state.refreshErrorCode : state.errorCode;
  const reconnect = code === "LOGIN_REQUIRED" || code === "SOURCE_RESTRICTED" && state.generation === "";
  function pick(event, id) {
    source.remember(id, event.currentTarget.getBoundingClientRect().top - box.current.getBoundingClientRect().top);
    void source.select(id);
    open();
  }
  return /* @__PURE__ */ import_react13.default.createElement("section", { className: "ngar ngar-transcript", "aria-label": "\u9605\u8BFB\u7D22\u5F15" }, /* @__PURE__ */ import_react13.default.createElement("div", { className: "ngar-prompt" }, /* @__PURE__ */ import_react13.default.createElement("div", { className: "ngar-bubble" }, "\u6574\u7406\u4E00\u4E0B\u6700\u8FD1\u7684\u8D44\u6599\u3002")), /* @__PURE__ */ import_react13.default.createElement("button", { className: "ngar-group", "aria-expanded": expanded, onClick: () => setExpanded(!expanded) }, expanded ? /* @__PURE__ */ import_react13.default.createElement(import_dsh_client_ui_primitives7.IconChevronUpOutlineRegular, { size: 14 }) : /* @__PURE__ */ import_react13.default.createElement(import_dsh_client_ui_primitives7.IconChevronDownOutlineRegular, { size: 14 }), /* @__PURE__ */ import_react13.default.createElement("span", null, "\u9605\u8BFB\u7D22\u5F15"), /* @__PURE__ */ import_react13.default.createElement("i", null), /* @__PURE__ */ import_react13.default.createElement("span", null, state.rows.length, " \u6761\u8BB0\u5F55")), /* @__PURE__ */ import_react13.default.createElement("div", { className: "ngar-records ngar-excerpts", ref: box, "aria-label": "\u8D44\u6599\u6761\u76EE", hidden: !expanded }, rows.map((row2) => {
    const { title, icon: Icon } = activityFor(row2.id);
    return /* @__PURE__ */ import_react13.default.createElement(
      "button",
      {
        key: row2.id,
        type: "button",
        "data-note-id": row2.id,
        className: "ngar-topic",
        "aria-label": "\u9884\u89C8\uFF1A" + row2.title,
        "aria-current": state.selected === row2.id || void 0,
        title: row2.title,
        onClick: (e) => pick(e, row2.id)
      },
      /* @__PURE__ */ import_react13.default.createElement(Icon, { size: 14 }),
      /* @__PURE__ */ import_react13.default.createElement("span", null, title),
      /* @__PURE__ */ import_react13.default.createElement("i", { "aria-hidden": "true" }),
      /* @__PURE__ */ import_react13.default.createElement("span", { className: "ngar-preview" }, row2.title)
    );
  }), !rows.length && !state.loading && !issue && /* @__PURE__ */ import_react13.default.createElement("p", { className: "ngar-hint" }, query ? "\u6CA1\u6709\u5339\u914D\u7684\u6761\u76EE\u3002" : "\u6682\u65E0\u6761\u76EE\u3002"), /* @__PURE__ */ import_react13.default.createElement("div", { ref: end, className: "ngar-excerpt-end", "aria-hidden": "true" })), issue && /* @__PURE__ */ import_react13.default.createElement("p", { className: "ngar-hint", role: "alert" }, state.refreshError && "\u5237\u65B0\u5931\u8D25\uFF1A", issue, " ", reconnect && /* @__PURE__ */ import_react13.default.createElement("button", { disabled: Boolean(state.login || state.loginBusy || state.refreshing), onClick: source.connect }, state.generation ? "\u91CD\u65B0\u626B\u7801\uFF08\u6253\u5F00\u5B98\u7F51\u7A97\u53E3\uFF09" : "\u8FDE\u63A5\u6765\u6E90\uFF08\u6253\u5F00\u5B98\u7F51\u626B\u7801\u7A97\u53E3\uFF09"), state.refreshError ? /* @__PURE__ */ import_react13.default.createElement("button", { onClick: refresh }, "\u91CD\u8BD5\u5237\u65B0") : /* @__PURE__ */ import_react13.default.createElement(import_react13.default.Fragment, null, code !== "FEED_EXPIRED" && /* @__PURE__ */ import_react13.default.createElement("button", { onClick: source.load }, state.rows.length ? "\u91CD\u8BD5\u7EED\u8BFB" : "\u91CD\u8BD5"), (state.rows.length > 0 || code === "FEED_EXPIRED") && /* @__PURE__ */ import_react13.default.createElement("button", { onClick: refresh }, "\u5237\u65B0\u63A8\u8350"))), state.loading ? /* @__PURE__ */ import_react13.default.createElement(ReadingStatus, { label: state.refreshing ? "\u6B63\u5728\u5237\u65B0\u63A8\u8350" : "\u6B63\u5728\u8BFB\u53D6\u63A8\u8350" }) : expanded && !state.error && !query && state.batch >= 0 && !state.more && /* @__PURE__ */ import_react13.default.createElement("p", { className: "ngar-hint" }, "\u5DF2\u5230\u7D22\u5F15\u672B\u5C3E\u3002"));
}
function ExcerptComposer({ source, back, refresh, library }) {
  const state = useReader(source);
  const defaults = (0, import_react13.useContext)(ReadingOptions), input = (0, import_react13.useRef)(null);
  const [settingsOpen, setSettingsOpen] = (0, import_react13.useState)(false);
  const [appearance, changeAppearance] = (0, import_react13.useState)(() => {
    let saved;
    try {
      saved = JSON.parse(window.localStorage.getItem(appearanceKey));
    } catch {
    }
    return readingAppearance(saved, defaults);
  });
  function setAppearance(key, value) {
    const next = readingAppearance({ ...appearance, [key]: value }, defaults);
    changeAppearance(next);
    try {
      window.localStorage.setItem(appearanceKey, JSON.stringify(next));
    } catch {
    }
  }
  const signing = state.login || state.loginBusy, busy = state.loading || Boolean(signing);
  return /* @__PURE__ */ import_react13.default.createElement("div", { className: "ngar ngar-composer-seat" }, /* @__PURE__ */ import_react13.default.createElement("div", { className: "ngar-composer" }, /* @__PURE__ */ import_react13.default.createElement("input", { ref: input, "aria-label": "\u7B5B\u9009\u5DF2\u8BFB\u6761\u76EE", placeholder: "\u67E5\u627E\u7D22\u5F15\u4E2D\u7684\u6761\u76EE\u2026", value: state.query, onChange: (e) => source.filter(e.target.value) }), /* @__PURE__ */ import_react13.default.createElement(
    ReadingToolbar,
    {
      input,
      back,
      appearance,
      setAppearance,
      primary: { label: "\u5237\u65B0\u63A8\u8350", icon: import_dsh_client_ui_primitives7.IconRefreshOutlineRegular, onClick: refresh, disabled: busy },
      options: (item) => /* @__PURE__ */ import_react13.default.createElement(import_react13.default.Fragment, null, item("\u5237\u65B0\u63A8\u8350", refresh, void 0, busy), item("\u8BFB\u53D6\u4E0B\u4E00\u6279", source.load, void 0, busy || !state.more || state.batch < 0 || state.errorCode === "FEED_EXPIRED"), item("\u9605\u8BFB\u8BBE\u7F6E\u2026", () => setSettingsOpen(true)), /* @__PURE__ */ import_react13.default.createElement("hr", null), /* @__PURE__ */ import_react13.default.createElement("p", { className: "ngar-menu-note" }, "\u5C0F\u7EA2\u4E66 \xB7 ", state.generation === null ? "\u767B\u5F55\u72B6\u6001\u672A\u786E\u8BA4" : state.generation ? "\u5DF2\u8FDE\u63A5" : "\u6E38\u5BA2"), signing ? item("\u53D6\u6D88\u626B\u7801", source.cancelLogin) : item(state.generation ? "\u6362\u53F7\u626B\u7801\uFF08\u6253\u5F00\u5B98\u7F51\u7A97\u53E3\uFF09" : "\u8FDE\u63A5\u6765\u6E90\uFF08\u6253\u5F00\u5B98\u7F51\u626B\u7801\u7A97\u53E3\uFF09", source.connect, void 0, state.refreshing), !signing && state.generation && item("\u9000\u51FA\u767B\u5F55", source.logout), item("\u8FD4\u56DE\u5DE5\u4F5C\u5BF9\u8BDD", back))
    }
  ), (signing || state.accountError) && /* @__PURE__ */ import_react13.default.createElement("div", { className: "ngar-excerpt-options" }, signing && /* @__PURE__ */ import_react13.default.createElement(import_react13.default.Fragment, null, "\u8BF7\u5728\u5B98\u7F51\u7A97\u53E3\u626B\u7801\u3002 ", /* @__PURE__ */ import_react13.default.createElement("button", { onClick: source.cancelLogin }, "\u53D6\u6D88\u626B\u7801")), state.accountError && /* @__PURE__ */ import_react13.default.createElement("span", { role: "alert" }, state.accountError))), settingsOpen && /* @__PURE__ */ import_react13.default.createElement(SettingsDialog, { library, onClose: () => setSettingsOpen(false) }));
}
function OpenExcerptIndex({ open, sessionId }) {
  (0, import_react13.useEffect)(() => {
    open(sessionId);
  }, [open, sessionId]);
  return null;
}
function Attachment({ source, state }) {
  const { note, run, index, large } = state, video = note.type === "video";
  const [failed, setFailed] = (0, import_react13.useState)(""), [retry, setRetry] = (0, import_react13.useState)(0);
  const zone = (0, import_react13.useRef)(null), start = (0, import_react13.useRef)(null);
  const url = "/api/dsh-nga-reader.attachment?" + new URLSearchParams({ run, id: note.id, kind: video ? "video" : "image", index: String(index) });
  (0, import_react13.useEffect)(() => {
    zone.current?.focus({ preventScroll: true });
  }, []);
  function arrow(e) {
    if (video || e.altKey || e.ctrlKey || e.metaKey || !["ArrowLeft", "ArrowRight"].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    source.step(e.key === "ArrowLeft" ? -1 : 1);
  }
  return /* @__PURE__ */ import_react13.default.createElement("div", { className: "ngar-attachment" + (large ? " is-large" : ""), ref: zone, tabIndex: -1, "aria-label": video ? "\u89C6\u9891\u9644\u4EF6" : "\u56FE\u7247\u9644\u4EF6", onKeyDown: arrow }, /* @__PURE__ */ import_react13.default.createElement(
    "div",
    {
      className: "ngar-attachment-frame",
      onTouchStart: (e) => {
        start.current = [e.touches[0].clientX, e.touches[0].clientY];
      },
      onTouchEnd: (e) => {
        if (!start.current || video) return;
        const dx = e.changedTouches[0].clientX - start.current[0];
        if (Math.abs(dx) > 45 && Math.abs(dx) > 1.5 * Math.abs(e.changedTouches[0].clientY - start.current[1])) source.step(dx < 0 ? 1 : -1);
        start.current = null;
      }
    },
    failed === url || !video && !note.images[index]?.available ? /* @__PURE__ */ import_react13.default.createElement("p", { role: "status" }, "\u9644\u4EF6\u6682\u65F6\u4E0D\u53EF\u7528\u3002 ", /* @__PURE__ */ import_react13.default.createElement("button", { onClick: () => {
      setFailed("");
      setRetry((n) => n + 1);
    } }, "\u91CD\u8BD5")) : video ? /* @__PURE__ */ import_react13.default.createElement(
      "video",
      {
        key: url + retry,
        src: url,
        controls: true,
        muted: true,
        preload: "none",
        playsInline: true,
        disablePictureInPicture: true,
        controlsList: "nofullscreen noremoteplayback",
        onError: () => setFailed(url),
        "aria-label": "\u64AD\u653E\u89C6\u9891\u9644\u4EF6"
      }
    ) : /* @__PURE__ */ import_react13.default.createElement("img", { key: url + retry, src: url, alt: "\u9644\u4EF6\uFF0C\u7B2C " + (index + 1) + " \u5F20", onError: () => setFailed(url) })
  ), /* @__PURE__ */ import_react13.default.createElement("div", { className: "ngar-excerpt-tools" }, !video && /* @__PURE__ */ import_react13.default.createElement(import_react13.default.Fragment, null, /* @__PURE__ */ import_react13.default.createElement("button", { disabled: index === 0, onClick: () => source.step(-1) }, "\u4E0A\u4E00\u5F20"), /* @__PURE__ */ import_react13.default.createElement("span", { "aria-live": "polite" }, index + 1, " / ", note.images.length), /* @__PURE__ */ import_react13.default.createElement("button", { disabled: index + 1 >= note.images.length, onClick: () => source.step(1) }, "\u4E0B\u4E00\u5F20")), /* @__PURE__ */ import_react13.default.createElement("button", { onClick: source.zoom }, large ? "\u7F29\u5C0F" : "\u653E\u5927"), /* @__PURE__ */ import_react13.default.createElement("button", { onClick: source.conceal }, "\u6536\u8D77\u9644\u4EF6")));
}
function NoteBody({ source, state }) {
  const { note } = state;
  const [discuss, setDiscuss] = (0, import_react13.useState)(false);
  const isVideo = note.type === "video", count = note.images.length;
  return /* @__PURE__ */ import_react13.default.createElement(import_react13.default.Fragment, null, /* @__PURE__ */ import_react13.default.createElement("div", { className: "ngar-byline" }, note.author), note.body && /* @__PURE__ */ import_react13.default.createElement("p", { className: "ngar-excerpt-body" }, note.body), /* @__PURE__ */ import_react13.default.createElement("div", { className: "ngar-excerpt-section" }, state.media ? /* @__PURE__ */ import_react13.default.createElement(Attachment, { source, state }) : (isVideo ? note.video : count > 0) ? /* @__PURE__ */ import_react13.default.createElement("button", { "aria-expanded": false, onClick: source.reveal }, "\u203A\u2002", isVideo ? "\u67E5\u770B\u9644\u4EF6\uFF08\u89C6\u9891\uFF09" : "\u67E5\u770B\u9644\u4EF6\uFF08" + count + " \u5F20\uFF09") : /* @__PURE__ */ import_react13.default.createElement("span", { className: "ngar-hint" }, isVideo ? "\u6765\u6E90\u6CA1\u6709\u63D0\u4F9B\u53EF\u64AD\u653E\u7684\u89C6\u9891\u3002" : "\u6CA1\u6709\u53EF\u8BFB\u53D6\u7684\u9644\u4EF6\u3002")), /* @__PURE__ */ import_react13.default.createElement("div", { className: "ngar-excerpt-section" }, /* @__PURE__ */ import_react13.default.createElement("button", { "aria-expanded": discuss, onClick: () => {
    setDiscuss(!discuss);
    if (!discuss && !state.discussion) void source.comments();
  } }, discuss ? "\u2304" : "\u203A", "\u2002\u8BC4\u8BBA", note.commentCount !== "" && "\uFF08" + note.commentCount + "\uFF09"), discuss && /* @__PURE__ */ import_react13.default.createElement("div", { className: "ngar-thought" }, state.discussion?.items.map((c) => /* @__PURE__ */ import_react13.default.createElement("p", { className: "ngar-excerpt-comment", key: c.id }, /* @__PURE__ */ import_react13.default.createElement("strong", null, c.author), " ", c.text)), !state.discussion?.items.length && !state.commentError && !state.commentLoading && /* @__PURE__ */ import_react13.default.createElement("p", null, "\u6682\u65E0\u53EF\u89C1\u8BC4\u8BBA\u3002"), state.commentError && /* @__PURE__ */ import_react13.default.createElement("p", { role: "alert" }, state.commentError, " ", /* @__PURE__ */ import_react13.default.createElement("button", { onClick: source.comments }, "\u91CD\u8BD5")), state.commentLoading ? /* @__PURE__ */ import_react13.default.createElement("p", { role: "status" }, "\u6B63\u5728\u8BFB\u53D6\u8BC4\u8BBA\u2026") : state.discussion?.more && /* @__PURE__ */ import_react13.default.createElement("button", { onClick: source.comments }, "\u7EE7\u7EED\u8BFB\u53D6\u8BC4\u8BBA"))));
}
function ExcerptPreview({ source, useTabInfo, close, refresh }) {
  const { tab } = useTabInfo();
  const state = useReader(source);
  (0, import_react13.useLayoutEffect)(() => {
    if (!tab.visible) source.conceal();
    return () => source.conceal();
  }, [tab.visible, source]);
  (0, import_react13.useEffect)(() => {
    const hidden = () => {
      if (document.hidden) source.conceal();
    };
    window.addEventListener("blur", source.conceal);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("blur", source.conceal);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [source]);
  if (!tab.visible) return null;
  const row2 = state.rows.find((r) => r.id === state.selected);
  return /* @__PURE__ */ import_react13.default.createElement("article", { className: "ngar ngar-excerpt-pane", "aria-label": "\u6458\u5F55\u9884\u89C8" }, row2 ? /* @__PURE__ */ import_react13.default.createElement(import_react13.default.Fragment, null, /* @__PURE__ */ import_react13.default.createElement("h3", null, state.note?.title || row2.title), state.note ? /* @__PURE__ */ import_react13.default.createElement(NoteBody, { key: state.selected, source, state }) : /* @__PURE__ */ import_react13.default.createElement(import_react13.default.Fragment, null, row2.author && /* @__PURE__ */ import_react13.default.createElement("div", { className: "ngar-byline" }, row2.author), /* @__PURE__ */ import_react13.default.createElement("p", { className: "ngar-hint", role: "status" }, state.noteError || "\u6B63\u5728\u8BFB\u53D6\u6B63\u6587\u2026", " ", state.noteError && (state.noteErrorCode === "FEED_EXPIRED" ? /* @__PURE__ */ import_react13.default.createElement("button", { disabled: state.loading, onClick: refresh }, "\u5237\u65B0\u63A8\u8350") : state.noteErrorCode === "LOGIN_REQUIRED" ? /* @__PURE__ */ import_react13.default.createElement("button", { disabled: Boolean(state.login || state.loginBusy || state.refreshing), onClick: source.connect }, "\u8FDE\u63A5\u6765\u6E90\uFF08\u6253\u5F00\u5B98\u7F51\u626B\u7801\u7A97\u53E3\uFF09") : /* @__PURE__ */ import_react13.default.createElement("button", { onClick: () => source.select(row2.id) }, "\u91CD\u8BD5")))), /* @__PURE__ */ import_react13.default.createElement("button", { className: "ngar-excerpt-link", onClick: close }, "\u6536\u8D77\u9884\u89C8 ", /* @__PURE__ */ import_react13.default.createElement("kbd", null, "Esc"))) : /* @__PURE__ */ import_react13.default.createElement("p", { className: "ngar-hint" }, "\u4ECE\u9605\u8BFB\u7D22\u5F15\u9009\u62E9\u6761\u76EE\u3002"));
}

// src/client/reader.css
var reader_default = `/* \u8FD9\u4E2A\u672C\u5730\u8F6E\u6B21\u6302\u8F7D\u7684\u662F\u7D22\u5F15\uFF0C\u6CA1\u6709\u6A21\u578B\u6267\u884C\u8017\u65F6\u3002 */
[data-conversation-session^="dsh-nga-reader-"] [data-turn-process="1"][data-turn-process-messages="0"][data-turn-process-tool-calls="0"] { display: none; }
.ngar {
  --ng-text: var(--dsw-alias-label-primary);
  --ng-secondary: var(--dsw-alias-label-secondary);
  --ng-muted: var(--dsw-alias-label-tertiary);
  --ng-line: var(--dsw-alias-border-l2);
  --ng-hover: var(--dsw-alias-interactive-bg-hover);
  min-width: 0;
  color: var(--ng-text);
  font-size: var(--dsh-content-font-size, 14px);
}
.ngar, .ngar *, .ngar *::before, .ngar *::after { box-sizing: border-box; }
.ngar button, .ngar input, .ngar textarea { font: inherit; color: inherit; }
.ngar button { border: 0; background: transparent; cursor: pointer; }
.ngar button:disabled { opacity: .45; cursor: default; }
.ngar :is(button, [role=button], a):focus-visible { outline: 2px solid var(--dsw-static-deepseek-500, Highlight); outline-offset: 2px; }
.ngar svg { flex: none; fill: currentColor; }
.ngar-transcript { width: 100%; text-align: start; font-weight: 400; }
.ngar-prompt { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; margin-bottom: 22px; }
.ngar-bubble {
  max-width: min(calc(var(--dsh-chat-content-width, 748px) * .702), 82%);
  padding: 9px 16px; border-radius: 15px; background: var(--dsw-specific-bubble);
  color: var(--ng-text); line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere;
}
.ngar-prompt time, .ngar-byline { font-size: var(--dsh-content-font-size-secondary, 13px); color: var(--ng-muted); }
.ngar-prompt time { padding-right: 9px; font-variant-numeric: tabular-nums; }
.ngar .ngar-group, .ngar .ngar-topic {
  display: flex; align-items: center; width: 100%; min-width: 0; text-align: left;
  color: var(--ng-muted); font-size: var(--dsh-content-font-size-secondary, 13px);
}
.ngar .ngar-group { gap: 7px; padding: 3px 0; margin-bottom: 7px; }
.ngar .ngar-topic { gap: 7px; min-height: calc(27px + var(--dsh-content-font-delta, 0px)); padding: 2px 0; border-radius: 4px; }
.ngar .ngar-topic:hover, .ngar .ngar-group:hover { color: var(--ng-text); }
.ngar-topic > span:first-of-type { flex: none; }
.ngar i { display: inline-block; width: 2px; height: 2px; flex: none; border-radius: 50%; background: currentColor; opacity: .65; }
.ngar .ngar-dot { margin: 0 8px; }
.ngar-records { max-height: clamp(154px, calc(100dvh - 360px), 660px); overflow: auto; overscroll-behavior-y: contain; padding: 2px 5px 4px 2px; scrollbar-gutter: stable; }
.ngar-records[hidden] { display: none; }
.ngar-excerpts { overflow-anchor: none; }
.ngar-excerpt-end { height: 1px; }
.ngar-reading-status {
  --dsw-alias-label-shimmer: var(--dsw-alias-label-deep-diving-shimmer);
  display: flex; align-items: center; gap: 6px; min-height: 28px; margin-top: 8px;
  color: var(--dsw-alias-label-deep-diving); font-size: calc(var(--dsh-content-font-size, 14px) - 2px);
}
.ngar-reading-icon { display: inline-flex; width: 14px; height: 14px; }
@supports (mask-mode: alpha) and (mask-image: url('')) {
  @media (prefers-reduced-motion: no-preference) and (forced-colors: none) {
    .ngar-reading-icon { background: currentColor; mask: var(--ngar-whale) center / 100% 100% no-repeat; mask-mode: alpha; will-change: transform; }
    .ngar-reading-icon svg { display: none; }
  }
}
.ngar-excerpts .ngar-topic[aria-current=true] { color: var(--ng-text); background: var(--ng-hover); }
.ngar-excerpt-pane { height: 100%; overflow: auto; padding: 15px 18px; font-weight: 400; }
.ngar-excerpt-pane h3 { margin: 0 0 5px; font-size: 1.05em; font-weight: 600; overflow-wrap: anywhere; }
.ngar-excerpt-body, .ngar-excerpt-comment { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.65; }
.ngar-excerpt-body { margin: 14px 0; }
.ngar-excerpt-section { margin-top: 12px; padding: 7px 0; border-top: 1px solid var(--ng-line); }
.ngar-excerpt-section > button, .ngar .ngar-excerpt-link, .ngar-excerpt-tools, .ngar-excerpt-options {
  color: var(--ng-secondary); font-size: var(--dsh-content-font-size-secondary, 13px);
}
.ngar .ngar-excerpt-link { padding: 5px 0; margin: 8px 0; }
.ngar-excerpt-link kbd { color: var(--ng-muted); font: inherit; font-size: .9em; margin-left: 5px; }
.ngar-excerpt-tools, .ngar-excerpt-options { display: flex; align-items: center; flex-wrap: wrap; gap: 5px 12px; }
.ngar-excerpt-tools button, .ngar-excerpt-options button { padding: 3px 5px; border-radius: 4px; }
.ngar-excerpt-tools button:hover:enabled, .ngar-excerpt-options button:hover { background: var(--ng-hover); }
.ngar-excerpt-options { border-top: 1px solid var(--ng-line); padding: 7px 4px; }
.ngar-attachment { outline: none; }
.ngar-attachment-frame { max-width: 100%; margin: 3px 0 6px; touch-action: pan-y; }
.ngar-attachment-frame :is(img,video) { display: block; width: auto; height: auto; max-width: min(100%, 230px); max-height: min(240px, 38dvh); object-fit: contain; border-radius: 3px; }
.ngar-attachment-frame video { width: min(100%, 230px); }
.ngar-attachment.is-large .ngar-attachment-frame :is(img,video) { max-width: 100%; max-height: 68dvh; }
.ngar-attachment.is-large .ngar-attachment-frame video { width: 100%; }
.ngar-preview { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ngar-floor + .ngar-floor { margin-top: 15px; }
.ngar-thought { margin: 3px 0 8px 7px; padding-left: 14px; border-left: 1px solid var(--ng-line); color: var(--ng-secondary); font-size: var(--dsh-content-font-size-secondary, 13px); }
.ngar-output { margin-top: 4px; color: var(--ng-text); }
.ngar-subposts { margin: 6px 0; color: var(--ng-muted); font-size: 12px; }
.ngar-subposts summary { cursor: pointer; width: fit-content; }
.ngar-subpost { margin: 6px 0 0 8px; padding-left: 10px; border-left: 2px solid var(--ng-line); }
.ngar-subpost p { margin: 2px 0; color: var(--ng-text); white-space: pre-wrap; overflow-wrap: anywhere; }
.ngar-floor p, .ngar-floor blockquote { margin: 4px 0; line-height: 1.65; white-space: pre-wrap; overflow-wrap: anywhere; }
.ngar-floor blockquote { border-left: 2px solid var(--ng-line); padding-left: 10px; color: var(--ng-secondary); }
.ngar-thought blockquote { padding-left: 0; border: 0; }
.ngar-floor a { color: var(--dsw-static-deepseek-500, LinkText); text-decoration: underline; }
.ngar-byline { display: flex; align-items: center; gap: 9px; font-size: 12px; }
.ngar .ngar-quote { padding: 2px 5px; margin-left: -5px; border-radius: 4px; color: var(--ng-muted); font-size: 12px; }
.ngar-hint button { padding: 2px 5px; border-radius: 4px; color: var(--ng-secondary); }
.ngar .ngar-quote:hover, .ngar-hint button:hover { background: var(--ng-hover); }
@media (hover: hover) {
  .ngar-floor:not(:hover):not(:focus-within) .ngar-quote { opacity: 0; }
}
.ngar-picture img { display: block; max-width: 100%; max-height: 330px; object-fit: contain; margin: 7px 0; border-radius: 8px; }
.ngar-smile { display: inline-block; width: auto; height: 1.55em; max-width: 2.5em; object-fit: contain; margin: 0 .08em; vertical-align: -.35em; }
.ngar-pager { display: flex; align-items: center; gap: 8px; margin-top: 10px; color: var(--ng-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.ngar-pager button, .ngar-round, .ngar-send-btn { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; }
.ngar-pager button:hover:enabled, .ngar .ngar-round:hover { background: var(--ng-hover); }
.ngar-hint { margin: 8px 0; color: var(--ng-muted); line-height: 1.6; }
.ngar-composer-seat { width: 100%; padding: 8px var(--dsh-composer-side-clearance, 16px) 24px; }
.ngar-composer {
  position: relative; display: flex; flex-direction: column; gap: 12px; margin: 0 auto; container: reply-card / inline-size;
  max-width: var(--dsh-composer-card-max-width, 780px); padding: 10px 8px 6px;
  border-radius: var(--dsw-radius-panel, 18px); --dsw-elevation-stroke-color: var(--ng-line);
  background: var(--dsw-specific-input-major); box-shadow: var(--dsw-elevation-soft, 0 0 0 1px var(--ng-line));
}
.ngar-composer textarea, .ngar-composer input {
  display: block; width: 100%; padding: 0 7px; margin: 0; border: 0; outline: none;
  background: transparent; color: var(--ng-text); line-height: calc(24px + var(--dsh-content-font-delta, 0px));
}
.ngar-composer textarea { height: 36px; resize: none; }
@supports (field-sizing: content) {
  .ngar-composer textarea { field-sizing: content; height: auto; min-height: 36px; max-height: min(128px, 22dvh); }
}
.ngar-composer input { height: 36px; }
.ngar-composer :is(input,textarea)::placeholder { color: var(--dsw-alias-label-caption, var(--ng-muted)); }
.ngar-tools, .ngar-tool-left, .ngar-formats, .ngar-send, .ngar-target { display: flex; align-items: center; gap: 6px; min-width: 0; }
.ngar-tools { flex-wrap: wrap; gap: 4px 10px; }
.ngar-tool-left { flex-wrap: wrap; }
.ngar-formats { gap: 1px; padding-left: 5px; border-left: 1px solid var(--ng-line); }
.ngar .ngar-add, .ngar .ngar-round, .ngar .ngar-tool { display: inline-grid; place-items: center; width: 28px; height: 28px; padding: 0; border-radius: 6px; color: var(--ng-secondary); }
.ngar .ngar-add, .ngar .ngar-round { border-radius: 50%; corner-shape: round; background: var(--ng-hover); }
.ngar .ngar-chip { display: inline-flex; align-items: center; gap: 4px; height: 28px; padding: 0 4px; border-radius: 6px; color: var(--ng-secondary); white-space: nowrap; font-size: var(--dsh-content-font-size-secondary, 13px); }
.ngar :is(.ngar-tool,.ngar-chip):is(:hover:enabled,[aria-expanded=true]) { background: var(--ng-hover); color: var(--ng-text); }
.ngar .ngar-line-icon { fill: none; stroke: currentColor; stroke-width: 1.35; stroke-linecap: round; stroke-linejoin: round; }
.ngar-quote-glyph { font: 19px Georgia, serif; line-height: 1; transform: translateY(2px); }
.ngar-send { margin-left: auto; gap: 7px; color: var(--ng-muted); font-size: 12px; }
.ngar .ngar-model-icon { display: none; }
.ngar-permission > svg:first-child { fill: none; }
.ngar-effort { color: var(--ng-muted); }
.ngar .ngar-send-btn { width: 34px; height: 34px; padding: 0; border-radius: 50%; corner-shape: round; color: white; background: var(--dsw-alias-button-info-fill, var(--dsw-static-deepseek-500, #467af0)); }
.ngar .ngar-send-btn:disabled { opacity: .4; }
.ngar-target { margin: 0 6px; padding-left: 8px; border-left: 2px solid var(--ng-line); color: var(--ng-secondary); font-size: 12px; }
.ngar-target span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.ngar-target button { margin-left: auto; }
.ngar .ngar-menu { position: absolute; bottom: calc(100% + 5px); left: 8px; z-index: 5; width: max-content; min-width: 175px; max-width: calc(100% - 16px); max-height: min(300px, 48dvh); overflow: auto; padding: 5px; color: var(--ng-text); }
.ngar .ngar-menu-right { left: auto; right: 42px; }
.ngar-menu button { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; padding: 7px 9px; border-radius: 6px; font-size: 13px; }
.ngar-menu button:is(:hover,:focus-visible) { background: var(--ng-hover); }
.ngar-menu button > span, .ngar-menu button[role=menuitemradio] > svg { margin-left: auto; color: var(--ng-muted); }
.ngar-menu hr { margin: 4px; border: 0; border-top: 1px solid var(--ng-line); }
.ngar-face-picker { width: 310px; max-width: 100%; }
.ngar-face-picker select { width: 100%; padding: 5px 7px; border: 1px solid var(--ng-line); border-radius: 5px;
  color: var(--ng-text); background: var(--dsw-specific-input-major); font: inherit; }
.ngar-face-scroll { height: clamp(120px, 28dvh, 210px); overflow-y: auto; overscroll-behavior-y: contain; scrollbar-gutter: stable; }
.ngar-face-page { height: 100%; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); grid-template-rows: repeat(4, minmax(0, 1fr)); gap: 2px; padding-block: 5px; }
.ngar-face-page button { flex-direction: column; justify-content: center; gap: 2px; padding: 2px; min-width: 0; }
.ngar-face-page button span { margin: 0; max-width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 11px; }
.ngar-face-page .ngar-smile { height: 25px; max-width: 45px; margin: 0; }
.ngar-face-pager { display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--ng-line); padding-top: 3px; font-size: 12px; color: var(--ng-secondary); }
.ngar-face-pager button { width: 30px; padding: 4px; justify-content: center; }
.ngar-url { width: 230px; max-width: 100%; display: grid; gap: 7px; padding: 5px; font-size: 13px; }
.ngar-url label { display: grid; gap: 5px; }
.ngar-url input { height: 30px; border: 1px solid var(--ng-line); border-radius: 6px; }
.ngar-url button { width: auto; justify-self: end; background: var(--ng-hover); }
.ngar-url p, .ngar-tool-error { margin: 0; color: var(--ng-secondary); font-size: 12px; }
@container reply-card (max-width: 560px) {
  .ngar-permission > span { display: none; }
  .ngar-formats { gap: 0; }
  .ngar .ngar-tool { width: 25px; }
}
@container reply-card (max-width: 465px) {
  .ngar-tools, .ngar-tool-left, .ngar-send { column-gap: 3px; }
}
@container reply-card (max-width: 280px) {
  .ngar .ngar-model-icon { display: block; }
  .ngar-model > span:not(.ngar-effort) { display: none; }
}
.ngar-dialog { margin: auto; width: min(350px, 90vw); padding: 22px; border: 1px solid var(--ng-line); border-radius: 15px; background: var(--dsw-specific-input-major); color: var(--ng-text); box-shadow: var(--dsw-elevation-soft); }
.ngar-dialog::backdrop { background: #0005; }
.ngar-dialog-head { display: flex; align-items: center; justify-content: space-between; }
.ngar-dialog h2 { margin: 0; font-size: 18px; }
.ngar-dialog-head button { font-size: 20px; }
.ngar-dialog p { color: var(--ng-secondary); font-size: 13px; }
.ngar-dialog .ngar-btn { padding: 6px 10px; border: 1px solid var(--ng-line); border-radius: 7px; }
.ngar .ngar-entry-input { text-align: left; height: 36px; padding: 0 7px; color: var(--ng-muted); }
.ngar-library-status { max-width: var(--dsh-composer-card-max-width, 780px); margin: 6px auto 0; color: var(--ng-secondary); font-size: 12px; }
.ngar-menu-note { max-width: 240px; margin: 5px 9px; color: var(--ng-secondary); font-size: 12px; }
.ngar-board-dialog form { display: grid; gap: 10px; margin-top: 16px; }
.ngar-board-dialog label { display: grid; gap: 6px; font-size: 13px; }
.ngar-board-dialog input { width: 100%; padding: 7px 9px; border: 1px solid var(--ng-line); border-radius: 7px; background: transparent; }
.ngar-board-dialog form button { justify-self: end; }
.ngar-board-dialog ul { padding: 0; margin: 10px 0 0; list-style: none; max-height: 38dvh; overflow: auto; }
.ngar-board-dialog li button { display: flex; width: 100%; align-items: baseline; gap: 8px; padding: 7px; text-align: left; border-radius: 6px; }
.ngar-board-dialog li button:hover { background: var(--ng-hover); }
.ngar-board-dialog small { margin-left: auto; color: var(--ng-muted); }

.ngar-directory { width: 100%; max-width: var(--dsh-chat-content-width, 748px); margin-inline: auto; }
.ngar-composer-seat > .ngar-directory { max-height: min(64dvh, 620px); overflow-y: auto; padding: 4px 4px 16px; }
.ngar-files { display: grid; gap: 6px; }
.ngar .ngar-file { display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 14px; text-align: start;
  border-radius: 12px; background: var(--dsw-alias-interactive-bg-hover); }
.ngar .ngar-file:hover { box-shadow: inset 0 0 0 1px var(--ng-line); }
.ngar-file > span { flex: 1; min-width: 0; }
.ngar-file strong, .ngar-file small { display: block; overflow-wrap: anywhere; }
.ngar-file strong { font-weight: 550; }
.ngar-file small, .ngar-file > svg:last-child { color: var(--ng-muted); }
.ngar-file small { margin-top: 2px; }
.ngar-category-preview { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: hidden; }
.ngar-source-search { display: block; padding: 8px 12px; border-bottom: 1px solid var(--ng-line); }
.ngar-source-search input { width: 100%; padding: 5px 9px; border: 1px solid var(--ng-line); border-radius: 6px;
  background: var(--dsw-specific-input-major); }
.ngar-code { flex: 1; min-height: 0; overflow: auto; padding: 9px 6px 14px; counter-reset: ngar-line; }
.ngar-code-line { display: flex; align-items: baseline; min-height: 27px; width: 100%; padding: 3px 6px;
  gap: 8px; text-align: start; counter-increment: ngar-line; }
.ngar-code-line code, .ngar-code-line::before { font-family: var(--dsh-font-family-code, ui-monospace, monospace); font-size: max(14px, var(--dsh-content-font-size, 14px), var(--dsh-code-font-size, 14px)); line-height: 1.5; }
.ngar-code-line::before { content: counter(ngar-line); min-width: 3ch; flex: none; text-align: end; color: var(--ng-muted); font-variant-numeric: tabular-nums; }
.ngar-code-line code { white-space: pre-wrap; overflow-wrap: anywhere; }
.ngar-code-line em { color: var(--dsw-static-deepseek-500, LinkText); font-style: normal; }
.ngar-code-group > summary { list-style: none; cursor: pointer; border-radius: 4px; }
.ngar-code-group > summary::-webkit-details-marker { display: none; }
.ngar-code-group > summary code, .ngar-bracket code { padding-inline-start: 1ch; }
.ngar-code-group > summary svg { vertical-align: -.15em; color: var(--ng-muted); }
.ngar .ngar-board-line { font: inherit; border-radius: 4px; }
.ngar-board-line code { padding-inline-start: 4ch; }
.ngar-board-line code span { color: light-dark(#276347, #a6d5b4); }
.ngar-board-line svg, .ngar-board-line small { align-self: center; color: var(--ng-muted); }
.ngar .ngar-board-line:disabled { opacity: 1; }
.ngar-board-line:hover:enabled, .ngar-code-group > summary:hover { background: var(--ng-hover); }
.ngar-directory-status { min-height: 26px; padding: 4px 12px; border-top: 1px solid var(--ng-line); color: var(--ng-secondary); font-size: 12px; }
.ngar-managed-action { display: contents; }
/* \u5DE5\u4F5C\u533A\u7684\u539F\u751F\u5F52\u6863\u4F1A\u4FDD\u7559\u8349\u7A3F\u3002\u4EC5\u5728\u63D2\u4EF6\u63A5\u7BA1\u7684\u4F1A\u8BDD\u884C\u548C\u83DC\u5355\u5185\u6362\u6210\u5220\u9664\u5165\u53E3\u3002 */
:is([data-slot="sidebar.workspaces.session.row.action"], [data-context-menu]):has(.ngar-managed-action)
  button:not(.ngar-remove):has(:is([data-icon="dsw-icon-archive-outline-regular"], [data-icon="dsw-icon-pin-outline-regular"], [data-icon="dsw-icon-pin-fill-regular"])) { display: none; }
.ngar-remove { display: inline-grid; place-items: center; width: 24px; height: 24px; padding: 0; border: 0;
  border-radius: 6px; color: inherit; background: transparent; cursor: pointer; }
.ngar-remove:hover { background: var(--dsw-alias-interactive-bg-hover); }
.ngar-remove-error { font-size: 12px; }
.ngar-settings { max-width: 780px; margin-inline: auto; }
.ngar-settings fieldset { border: 0; padding: 0; margin: 24px 0; min-width: 0; }
.ngar-settings legend { font-size: 16px; font-weight: 600; margin-bottom: 10px; padding: 0; }
.ngar-config-file { display: grid; gap: 6px; font-size: 13px; }
.ngar-settings input:not([type="checkbox"]), .ngar-settings select { min-width: 0; padding: 7px 9px; border: 1px solid var(--ng-line); border-radius: 6px;
  background: var(--dsw-specific-input-major); color: inherit; font: inherit; }
.ngar-config-file input { width: 100%; font-size: 12px !important; }
.ngar-pref { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 6px 16px; padding: 10px 0; border-bottom: 1px solid var(--ng-line); }
.ngar-pref label { line-height: 1.5; }
.ngar-pref input[type="checkbox"] { width: 17px; height: 17px; accent-color: var(--dsw-static-deepseek-500, #467af0); }
.ngar-pref input[type="number"] { width: 88px; }
.ngar-pref select { max-width: 220px; }
.ngar-pref small { grid-column: 1 / -1; color: var(--ng-secondary); overflow-wrap: anywhere; line-height: 1.5; }
.ngar-pref-path { grid-template-columns: 1fr; }
.ngar-pref-path > div:not(.ngar-folder-picker) { display: flex; gap: 8px; }
.ngar-pref-path input { flex: 1; }
.ngar .ngar-setting-button { padding: 6px 10px; border: 1px solid var(--ng-line); border-radius: 6px; white-space: nowrap; }
.ngar .ngar-setting-button:hover:enabled { background: var(--ng-hover); }
.ngar-settings-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ngar-settings-actions span { font-size: 13px; color: var(--ng-secondary); }
.ngar-settings-dialog { width: min(700px, 94vw); max-height: 88dvh; overflow: auto; }
.ngar-settings-dialog .ngar-dialog-head { margin-bottom: 18px; }
.ngar-folder-picker { padding: 10px; border: 1px solid var(--ng-line); border-radius: 8px; overflow-wrap: anywhere; }
.ngar-folder-picker nav { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 6px; }
.ngar-folder-list { max-height: 180px; overflow-y: auto; margin-bottom: 8px; }
.ngar-folder-list button { display: block; width: 100%; padding: 6px; text-align: left; border-radius: 4px; }
.ngar-folder-list button:hover { background: var(--ng-hover); }
.ngar-qr { display: block; width: min(232px, 100%); margin: 16px auto 0; }
.ngar-directory-editor { width: min(620px, 94vw); max-height: 86dvh; overflow: auto; }
.ngar-directory-path { overflow-wrap: anywhere; }
.ngar-directory-editor fieldset { min-width: 0; margin: 16px 0; padding: 0; border: 0; }
.ngar-editor-row, .ngar-editor-footer, .ngar-row-actions, .ngar-followed-controls { display: flex; align-items: center; gap: 6px; }
.ngar-editor-row { margin: 7px 0; flex-wrap: wrap; }
.ngar-editor-row label { display: flex; align-items: center; gap: 6px; flex: 1; font-size: 13px; }
.ngar-editor-row input, .ngar-editor-row select { flex: 1; min-width: 6ch; padding: 5px 8px; border: 1px solid var(--ng-line);
  border-radius: 6px; background: var(--dsw-specific-input-major); color: inherit; }
.ngar-editor-group { margin: 12px 0; padding: 8px 12px; border: 1px solid var(--ng-line); border-radius: 8px; }
.ngar-directory-editor form button, .ngar-followed-controls button { padding: 4px 8px; border: 1px solid var(--ng-line); border-radius: 6px; }
.ngar-directory-editor form button:hover:enabled, .ngar-followed-controls button:hover { background: var(--ng-hover); }
.ngar-editor-footer { justify-content: flex-end; margin-top: 14px; }
.ngar-editor-footer button:first-child { margin-right: auto; }
.ngar-followed-controls:not(:empty) { padding: 8px 12px; flex-wrap: wrap; font-size: 13px; }
.ngar-followed-controls strong { margin-right: auto; }
@media (max-width: 600px) {
  .ngar-bubble { max-width: 90%; }
  .ngar-composer-seat { padding-bottom: 10px; }
  .ngar-records { max-height: max(145px, calc(100dvh - 330px)); }
}
`;

// src/client/index.jsx
var name = "moyuban";
var inject = ["slots", "shortcuts", "layout", "sessions", "uiWorkspace", "workspaces", "sidebarRight", "sidebarRightTabs"];
function apply(ctx) {
  const prefs = preferences(call);
  const storage = {
    get length() {
      return window.localStorage.length;
    },
    key: (index) => window.localStorage.key(index),
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
    removeItem: (key) => window.localStorage.removeItem(key)
  };
  const readers = /* @__PURE__ */ new Map();
  function readerFor(id) {
    if (!readers.has(id)) {
      const ref = boardForSession2(id);
      const { sites, values } = prefs.snapshot();
      const site = sites?.find((site2) => site2.id === ref?.site);
      if (!site) return null;
      readers.set(id, createReader(call, storage, ref, site, values));
    }
    return readers.get(id);
  }
  const listeners = /* @__PURE__ */ new Set();
  const workspaces = /* @__PURE__ */ new Map();
  const navigation = workspaceNavigation(ctx, workspaces, load);
  let catalog = { boards: [], manual: [], favorites: [], warnings: {} }, queue = Promise.resolve(), pending, lastSync = 0;
  const removalKey = "dsh-nga-reader.removed";
  function forgetReading(id, local) {
    const reader = readers.get(id);
    if (reader) reader.clearReading(local);
    else if (local) clearStoredReading(storage, id);
    readers.delete(id);
    navigation.forgetBoard(id);
    if (local) try {
      storage.setItem(removalKey, id);
      storage.removeItem(removalKey);
    } catch {
    }
  }
  function refresh(action = "workspace", fields, changedSite) {
    const origin = navigation.current();
    const task = queue.then(async () => {
      const result = await call(action, fields);
      if (result.removed) forgetReading(result.removed, true);
      let sessions = ctx.sessions.list.getSnapshot().byId;
      if (result.boards.some((item) => !sessions[item.sessionId])) {
        await ctx.sessions.refresh();
        sessions = ctx.sessions.list.getSnapshot().byId;
      }
      const missing = result.boards.filter((item) => !sessions[item.sessionId]?.title);
      for (let i = 0; i < missing.length; i += 6) {
        await Promise.all(missing.slice(i, i + 6).map((item) => ctx.sessions.refreshProjections(item.sessionId)));
      }
      const before = workspaces.get(result.site);
      const changed = changedSite || before && before.accountId !== result.accountId;
      workspaces.set(result.site, result);
      const all = [...workspaces.values()];
      catalog = {
        boards: all.flatMap((i) => i.boards),
        manual: all.flatMap((i) => i.manual),
        favorites: all.flatMap((i) => i.favorites),
        warnings: Object.fromEntries(all.map((i) => [i.site, i.warning])),
        settings: result.settings
      };
      lastSync = Date.now();
      if (changed) {
        for (const reader of readers.values()) if (reader.site.id === result.site) reader.invalidateAccount();
      }
      for (const notify of listeners) notify();
      const active = navigation.current();
      const ref = navigation.readingSession(active);
      const visible = result.boards.some((item) => item.sessionId === active);
      const removedActive = result.removed && result.removed === origin && !active && !ctx.layout.panelInfo.getSnapshot().activePanelId;
      if (removedActive || action !== "openBoard" && active === origin && ref?.site === result.site && ref.kind && !visible) {
        ctx.uiWorkspace.openSession(navigation.destination(result));
      } else if (changed && ref?.site === result.site) {
        await readers.get(ref.sessionId)?.authChanged();
      }
      return result;
    });
    queue = task.catch(() => {
    });
    return task;
  }
  function load() {
    pending ??= prefs.load().then(async () => {
      const { sites, warning } = prefs.snapshot();
      if (!sites) throw new Error(warning || "\u672A\u80FD\u8BFB\u53D6\u7AD9\u70B9\u5217\u8868\u3002");
      await Promise.all(sites.map(({ id }) => refresh("workspace", { site: id })));
    }).finally(() => {
      pending = void 0;
    });
    return pending;
  }
  async function pick(ref, signal, fromDirectory, generation) {
    const transition = ctx.layout.beginNavigation();
    const result = await refresh("openBoard", { site: ref.site, board: ref.sessionId, name: ref.name, fromDirectory, generation });
    if (result.opened && !transition.aborted && !signal?.aborted && result.settings.openOnPick) {
      ctx.uiWorkspace.openSession(result.opened);
    }
    return result;
  }
  const directories = /* @__PURE__ */ new Map();
  const followed = followedDirectory((action, fields, signal) => call(action, { ...fields, site: "tieba" }, signal));
  const accountKey = "dsh-nga-reader.tieba-account-changed";
  const excerptKey = "dsh-nga-reader.excerpt-account-changed";
  const excerpts = excerptStore(
    (action, fields) => call(action, { ...fields, site: "xhs" }),
    () => {
      try {
        storage.setItem(excerptKey, String(Date.now()));
      } catch {
      }
    }
  );
  const openExcerpt = () => ctx.sidebarRight.openResource(excerptAddress, { kind: excerptTab.kind, destination: "sidebar" });
  async function refreshExcerpt() {
    const session = navigation.current();
    if (await excerpts.refresh() && navigation.current() === session) {
      const tab = ctx.sidebarRight.active();
      if (tab?.kind === excerptTab.kind && ctx.sidebarRight.isExpanded()) ctx.sidebarRight.hide(tab.id);
    }
  }
  function closeExcerpt() {
    const tab = ctx.sidebarRight.active();
    if (tab?.kind === excerptTab.kind && ctx.sidebarRight.isExpanded()) ctx.sidebarRight.hide(tab.id);
    excerpts.close();
  }
  const showIndex = (id) => ctx.uiWorkspace.openSession(id);
  const library = {
    followed,
    notifyAccount() {
      try {
        storage.setItem(accountKey, String(Date.now()));
      } catch {
      }
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    snapshot: () => catalog,
    sync: (site) => refresh("syncBoards", { site }),
    accountChanged: (site) => refresh(site.capabilities.favorites ? "syncBoards" : "workspace", { site: site.id }, site.id),
    preferences: prefs,
    workspace: ctx.uiWorkspace,
    syncSettings: load,
    directory(site) {
      if (!directories.has(site)) directories.set(site, directorySource(() => call("boardDirectory", { site }), () => prefs.snapshot(), site === "tieba"));
      return directories.get(site);
    },
    async saveDirectory(categories, revision) {
      const source = library.directory("tieba");
      const active = ctx.sidebarRight.active();
      const before = source.snapshot().categories.find((c) => categoryAddress("tieba", c) === active?.contentId);
      const result = await call("saveBoardDirectory", { site: "tieba", categories, revision });
      source.accept(result);
      const after = before && result.categories.find((c) => c.key === before.key);
      if (after && before.name !== after.name && ctx.sidebarRight.active()?.id === active.id) {
        ctx.sidebarRight.openResource(categoryAddress("tieba", after), { kind: categoryTab.kind, replaceTab: active.id });
      }
    },
    findBoards: (site, query, signal) => call("findBoards", { site, query }, signal),
    browse: navigation.browse,
    preview(site, category) {
      ctx.sidebarRight.openResource(categoryAddress(site, category), { kind: categoryTab.kind, destination: "sidebar" });
      if (category.kind === "followed") void followed.open();
      else if (followed.snapshot().phase !== "idle") followed.clear();
    },
    add: (ref, signal, generation) => pick(ref, signal, !generation, generation),
    open: (ref, signal) => pick(ref, signal, false),
    remove: (ref) => refresh("removeBoard", { site: ref.site, board: ref.sessionId })
  };
  ctx.effect(() => {
    const style = document.createElement("style");
    style.textContent = reader_default;
    document.head.append(style);
    let attempted = false;
    let archived = "";
    function sync() {
      navigation.rememberCurrent();
      if (!attempted && ctx.sessions.list.getSnapshot().phase === "ready") {
        attempted = true;
        void load().catch((error) => console.warn("Reader workspace setup failed:", error.message));
      }
      const next = ctx.workspaces.list.getSnapshot().archivedSessionIds.filter((id) => catalog.boards.some((item) => item.sessionId === id)).join("/");
      if (next !== archived) {
        archived = next;
        if (next) void load().catch((error) => console.warn("Reader archive sync failed:", error.message));
      }
    }
    function escape(event) {
      if (event.key !== "Escape" || event.repeat || event.isComposing || event.defaultPrevented) return;
      if (!navigation.readingSession(navigation.current()) || document.querySelector("dialog[open], .ngar-menu, [data-context-menu]")) return;
      event.preventDefault();
      event.stopPropagation();
      const tab = ctx.sidebarRight.active();
      if (tab?.kind === excerptTab.kind && ctx.sidebarRight.isExpanded()) {
        closeExcerpt();
        return;
      }
      if (tab?.kind === categoryTab.kind && ctx.sidebarRight.isExpanded()) {
        ctx.sidebarRight.hide(tab.id);
        return;
      }
      navigation.back();
    }
    function focus() {
      void prefs.load(true);
      if (attempted && Date.now() - lastSync > 6e4) void load().catch((error) => console.warn("Reader workspace sync failed:", error.message));
    }
    function storageChanged(event) {
      if (event.key === removalKey && boardForSession2(event.newValue)?.kind) forgetReading(event.newValue, false);
      if (event.key === accountKey && followed.snapshot().phase !== "idle") void followed.open(false);
      if (event.key === excerptKey) {
        excerpts.conceal();
        void excerpts.check();
      }
    }
    const subscriptions = [ctx.sessions.list, ctx.workspaces.list, ctx.sidebarRight.mounted].map((source) => source.subscribe(sync));
    sync();
    window.addEventListener("keydown", escape, true);
    window.addEventListener("focus", focus);
    window.addEventListener("storage", storageChanged);
    return () => {
      for (const dispose of subscriptions) dispose();
      excerpts.dispose();
      style.remove();
      window.removeEventListener("storage", storageChanged);
      window.removeEventListener("focus", focus);
      window.removeEventListener("keydown", escape, true);
    };
  });
  ctx.effect(() => ctx.sidebarRightTabs.register(categoryTab));
  ctx.effect(() => ctx.sidebarRightTabs.register(excerptTab));
  ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
    name: "sidebar.right.pane.tab",
    key: excerptTab.id
  }, (props) => /* @__PURE__ */ import_react14.default.createElement(ExcerptPreview, { ...props, source: excerpts, close: closeExcerpt, refresh: refreshExcerpt })));
  ctx.slots.inject("plugins.bundle.config", () => ctx.slots.register({
    name: "plugins.bundle.config",
    key: name
  }, () => /* @__PURE__ */ import_react14.default.createElement(ReaderSettings, { library })));
  ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
    name: "sidebar.right.pane.tab",
    key: categoryTab.id
  }, (props) => /* @__PURE__ */ import_react14.default.createElement(WithSettings, { source: prefs }, () => /* @__PURE__ */ import_react14.default.createElement(CategoryPreview, { ...props, library }))));
  ctx.slots.inject("sidebar.workspaces.session.row.action", () => ctx.slots.register({
    name: "sidebar.workspaces.session.row.action",
    id: "nga-remove-board",
    order: 105
  }, ({ sessionId }) => boardForSession2(sessionId) ? /* @__PURE__ */ import_react14.default.createElement(BoardRemoveAction, { sessionId, library }) : null));
  ctx.slots.inject("sidebar.workspaces.session.menu.item", () => ctx.slots.register({
    name: "sidebar.workspaces.session.menu.item",
    id: "nga-remove-board",
    order: 500
  }, (props) => boardForSession2(props.sessionId) ? /* @__PURE__ */ import_react14.default.createElement(BoardRemoveMenu, { ...props, library }) : null));
  ctx.slots.inject("conversation.chat.turnTail", () => ctx.slots.register({
    name: "conversation.chat.turnTail",
    id: "nga-board-content",
    order: 10
  }, ({ sessionId, turn }) => boardForSession2(sessionId) && turn.turn === 1 ? /* @__PURE__ */ import_react14.default.createElement(WithSettings, { source: prefs }, () => {
    if (boardForSession2(sessionId).site === "xhs") return /* @__PURE__ */ import_react14.default.createElement(ExcerptIndex, { source: excerpts, mounted: ctx.sidebarRight.mounted, sessionId, open: openExcerpt, refresh: refreshExcerpt });
    const reader = readerFor(sessionId);
    return reader ? /* @__PURE__ */ import_react14.default.createElement(BoardTranscript, { key: sessionId, reader, library, entryOnly: !boardForSession2(sessionId).kind }) : /* @__PURE__ */ import_react14.default.createElement("p", { className: "ngar-hint", role: "status" }, "\u8FD9\u4E2A\u4F1A\u8BDD\u7684\u7AD9\u70B9\u5F53\u524D\u4E0D\u53EF\u7528\u3002");
  }) : null));
  ctx.slots.inject("conversation.composer", () => ctx.slots.register({
    name: "conversation.composer",
    priority: -10,
    select: (owner) => navigation.readingSession(owner.sessionId) ? owner.sessionId : null
  }, ({ matched }) => {
    return /* @__PURE__ */ import_react14.default.createElement(WithSettings, { source: prefs }, () => {
      const board2 = navigation.readingSession(matched);
      if (board2?.site === "xhs") return matched === board2.sessionId ? /* @__PURE__ */ import_react14.default.createElement(ExcerptComposer, { source: excerpts, back: navigation.back, refresh: refreshExcerpt, library }) : /* @__PURE__ */ import_react14.default.createElement(OpenExcerptIndex, { open: showIndex, sessionId: board2.sessionId });
      const reader = board2 && readerFor(board2.sessionId);
      return reader && /* @__PURE__ */ import_react14.default.createElement(BoardComposer, { key: matched, reader, board: board2, directoryBlank: matched !== board2.sessionId, library, back: navigation.back });
    });
  }));
  const binding = { code: "KeyJ", modifiers: ["primary", "alt", "shift"] };
  ctx.effect(() => ctx.shortcuts.register({
    id: "nga-reader.toggle",
    label: () => "\u5207\u6362\u8BA8\u8BBA\u8BB0\u5F55\u4E0E\u5DE5\u4F5C\u5BF9\u8BDD",
    aliases: ["\u6478\u9C7C", "\u5C0F\u7EA2\u4E66", "NGA", "\u8D34\u5427", "\u9605\u8BFB", "\u770B\u5E16"],
    defaults: { "desktop:windows": binding, "web:windows": binding, "desktop:linux": binding, "desktop:macos": binding, "web:macos": binding },
    regions: ["page", "editable"],
    resolve: () => ({ status: "handled", run: navigation.toggle })
  }));
}
return module.exports; } });
