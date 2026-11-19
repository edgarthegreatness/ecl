// Lead Desk front end. Talks only to /api/* (and /auth/* for sign-in).
// Open with ?demo to click through with made-up data (no Facebook needed).
import { demoApi } from "./demo.js";

const DEMO = new URLSearchParams(location.search).has("demo");
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const initials = (n) => (n || "?").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
const SRC = { form: "Lead form", message: "Page message", comment: "Post comment" };
const SAID = { form: "Form answers", message: "What they wrote", comment: "Their comment" };
const VIA = { form: "Email", message: "Messenger", comment: "Messenger private reply" };
const ST = { waiting: "Waiting", followup: "Follow-up", sent: "Replied", skipped: "Skipped", failed: "Failed", cold: "Cold" };
const TPL = { form: "Lead form", message: "Page message", comment: "Post comment", followup: "Follow-up" };

const S = { me: null, leads: [], settings: null, view: "all", tab: "queue", tplPage: null, editing: new Set() };

// ---------- api ----------
class AuthError extends Error {}
async function api(path, opts = {}) {
  if (DEMO) return demoApi(path, opts);
  const res = await fetch(path, {
    method: opts.method || "GET",
    headers: opts.body ? { "content-type": "application/json" } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
  });
  if (res.status === 401) throw new AuthError();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Something went wrong (${res.status})`);
  return data;
}

function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 3200);
}
function ago(t) {
  const m = Math.round((Date.now() - t) / 60e3);
  if (m < 60) return `${Math.max(m, 0)}m ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}
const show = (id) => ["loading", "connect", "app"].forEach((x) => $("#" + x).classList.toggle("hidden", x !== id));
const page = (id) => (S.me?.pages || []).find((p) => p.id === id) || { id, name: "Removed Page", color: "#666" };
const visible = () => S.leads.filter((l) => S.view === "all" || l.pageId === S.view);

// ---------- boot ----------
async function boot() {
  try {
    S.me = await api("/api/me");
  } catch (e) {
    if (e instanceof AuthError) { show("connect"); return; }
    show("connect"); toast(e.message); return;
  }
  const params = new URLSearchParams(location.search);
  if (params.has("connect") || !S.me.pages.length) return openPicker();
  await openApp();
}

async function openPicker() {
  show("connect"); $("#step1").classList.add("hidden"); $("#step2").classList.remove("hidden");
  $("#pagepick").innerHTML = `<p class="fine">Loading your Pages…</p>`;
  let pages;
  try { pages = await api("/api/pages/available"); }
  catch (e) { if (e instanceof AuthError) { $("#step2").classList.add("hidden"); $("#step1").classList.remove("hidden"); return; } toast(e.message); return; }
  const picked = new Set(pages.filter((p) => p.connected).map((p) => p.id));
  if (!picked.size && pages.length === 1) picked.add(pages[0].id);
  const render = () => {
    $("#pagepick").innerHTML = pages.length ? pages.map((p) => `<button class="page-opt ${picked.has(p.id) ? "on" : ""}" data-p="${esc(p.id)}">
      <span class="pav" style="color:var(--gold);background:rgba(216,183,122,.1)">${esc(initials(p.name)[0])}</span>
      <span class="txt"><b>${esc(p.name)}</b><small>${p.connected ? "Connected" : "Not connected"}</small></span><span class="check">✓</span></button>`).join("")
      : `<p class="fine">This Facebook account doesn't manage any Pages, or you didn't allow access to them. Sign in again and tick your Pages on Facebook's screen.</p>`;
    const go = $("#connectgo"), n = picked.size;
    go.textContent = n ? `Connect ${n} Page${n > 1 ? "s" : ""}` : "Pick at least one Page"; go.disabled = !n;
  };
  $("#pagepick").onclick = (e) => { const b = e.target.closest(".page-opt"); if (!b) return; const id = b.dataset.p; picked.has(id) ? picked.delete(id) : picked.add(id); render(); };
  $("#connectgo").onclick = async () => {
    $("#connectgo").disabled = true; $("#connectgo").textContent = "Connecting…";
    try {
      const r = await api("/api/pages", { method: "POST", body: { ids: [...picked] } });
      if (r.warnings?.length) toast(`Connected, with warnings: ${r.warnings.join("; ")}`);
      else toast(`Connected ${r.pages.length} Page${r.pages.length > 1 ? "s" : ""}`);
      history.replaceState(null, "", location.pathname + (DEMO ? "?demo" : ""));
      S.me = await api("/api/me"); S.view = "all";
      await openApp();
    } catch (e) { toast(e.message); render(); }
  };
  render();
}

async function openApp() {
  show("app");
  [S.leads, S.settings] = await Promise.all([api("/api/leads"), api("/api/settings")]);
  renderBanner(); render();
}

function renderBanner() {
  const exp = S.me?.dataAccessExpiresAt, days = exp ? Math.ceil((exp - Date.now()) / 864e5) : null;
  $("#banner").innerHTML = days !== null && days <= 7
    ? `<div class="banner"><span>Facebook access expires in ${Math.max(days, 0)} day${days === 1 ? "" : "s"}. Sign in again to keep leads coming.</span><a href="/auth/start">Sign in</a></div>` : "";
}

// ---------- rendering ----------
function renderSwitcher() {
  const ids = S.me.pages.map((p) => p.id);
  if (S.view !== "all" && !ids.includes(S.view)) S.view = "all";
  $("#pagesel").innerHTML = `<option value="all">All Pages (${ids.length})</option>` + S.me.pages.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
  $("#pagesel").value = S.view;
  const dots = S.view === "all" ? S.me.pages : [page(S.view)];
  $("#stack").innerHTML = dots.map((p) => `<span class="pdot" style="background:${esc(p.color)}"></span>`).join("");
}

function render() {
  renderSwitcher();
  $("#view").innerHTML = VIEWS[S.tab]();
  fit();
  const n = visible().filter((l) => l.status === "waiting" || l.status === "followup" || l.status === "failed").length, b = $("#qcount");
  b.textContent = n; b.style.display = n ? "" : "none";
  document.querySelectorAll("nav button").forEach((x) => x.classList.toggle("on", x.dataset.t === S.tab));
  AFTER[S.tab]?.();
}

function fit() {
  document.querySelectorAll("#view textarea").forEach((t) => { t.style.height = "auto"; t.style.height = t.scrollHeight + 2 + "px"; });
}

const ptag = (id) => `<span class="ptag"><span class="pdot" style="background:${esc(page(id).color)}"></span>${esc(page(id).name)}</span>`;
function contact(l) {
  const phone = l.phone
    ? `<span class="pill"><span class="k">Phone</span><span class="v">${esc(l.phone)}</span><a class="mini" href="tel:${esc(l.phone.replace(/[^\d+]/g, ""))}">Call</a><button class="mini" data-copy="${esc(l.phone)}">Copy</button></span>`
    : `<span class="pill none"><span class="k">Phone</span><span class="v">Not shared</span></span>`;
  const email = l.email ? `<span class="pill"><span class="k">Email</span><span class="v">${esc(l.email)}</span><button class="mini" data-copy="${esc(l.email)}">Copy</button></span>` : "";
  return phone + email;
}
function clockBadge(l) {
  const c = l.clock || {};
  if (c.level === "none") return `<span class="clock ok">No time limit</span>`;
  if (c.level === "closed") return `<span class="clock bad">Window closed</span>`;
  const txt = c.hoursLeft < 24 ? `${c.hoursLeft}h left` : `${Math.floor(c.hoursLeft / 24)} days left`;
  return `<span class="clock ${c.level === "warn" ? "warn" : "ok"}">${txt}</span>`;
}
function card(l) {
  const can = l.canSend?.ok, editing = S.editing.has(l.id);
  return `<div class="card" data-id="${esc(l.id)}">
    <div class="who"><div class="av">${esc(initials(l.name))}</div>
      <div class="meta"><div class="nm">${esc(l.name || "Someone")}</div><div class="sub"><span class="src">${SRC[l.source]}</span>· ${ago(l.receivedAt)}${l.followUps ? ` · follow-up ${l.followUps}` : ""}</div></div>
      ${ptag(l.pageId)}</div>
    <div class="contact">${contact(l)}</div>
    <div class="said"><em>${SAID[l.source]}</em>${esc(l.said).replace(/\n/g, "<br>")}</div>
    <div class="draft-h"><span>${l.status === "followup" ? "Your follow-up" : "Your reply"}</span></div>
    <textarea ${editing ? "" : "readonly"}>${esc(l.draft)}</textarea>
    ${l.status === "failed" && l.error ? `<div class="err">Last try failed: ${esc(l.error)}</div>` : ""}
    <div class="foot">
      <div class="via">${can ? `Sends from <b>${esc(page(l.pageId).name)}</b> by <b>${VIA[l.source]}</b> ${clockBadge(l)}` : `<span class="reason">${esc(l.canSend?.reason || "Can't send")}</span>`}</div>
      <button class="btn" data-a="skip">Skip</button>
      <button class="btn" data-a="${editing ? "done" : "edit"}">${editing ? "Done" : "Edit"}</button>
      <button class="btn gold" data-a="send" ${can ? "" : "disabled"}>Send</button>
    </div>
  </div>`;
}

const scope = () => (S.view === "all" ? `${S.me.pages.length} Page${S.me.pages.length > 1 ? "s" : ""}` : page(S.view).name);

const VIEWS = {
  queue() {
    const L = visible(), c = (s) => L.filter((l) => l.status === s).length;
    const stats = `<div class="stats">
      <div class="stat"><b>${L.filter((l) => Date.now() - l.receivedAt < 7 * 864e5).length}</b><span>Leads this week</span></div>
      <div class="stat"><b style="color:var(--gold2)">${c("waiting") + c("followup") + c("failed")}</b><span>Waiting</span></div>
      <div class="stat"><b style="color:var(--ok)">${c("sent")}</b><span>Replied</span></div>
      <div class="stat"><b>${L.filter((l) => l.phone).length}</b><span>With phone</span></div></div>`;
    const fresh = L.filter((l) => l.status === "waiting" || l.status === "failed"), fu = L.filter((l) => l.status === "followup");
    if (!fresh.length && !fu.length) return stats + `<div class="empty"><span class="serif">All caught up.</span>New leads will appear here with a reply ready.</div>`;
    return stats + `<div class="sec"><h2 class="serif">Review</h2><p>${esc(scope())} · nothing sends until you tap Send</p></div>`
      + (fu.length ? `<div class="subsec">Follow-ups (${fu.length})</div>${fu.map(card).join("")}` : "")
      + (fresh.length ? `${fu.length ? `<div class="subsec">New (${fresh.length})</div>` : ""}${fresh.map(card).join("")}` : "");
  },
  leads() {
    const L = visible();
    return `<div class="sec"><h2 class="serif">All leads</h2><p>${L.length} from ${esc(scope())}</p></div>
      <div class="sheet-note"><b>●</b> Every lead is also saved to your Google Sheet</div>`
      + (L.length ? `<div class="list">${L.map((l) => `<div class="lrow"><div class="av">${esc(initials(l.name))}</div>
          <div class="meta"><div class="nm">${esc(l.name || "Someone")}</div>
            <div class="sub"><span class="pdot" style="background:${esc(page(l.pageId).color)};width:8px;height:8px"></span>${esc(page(l.pageId).name)} · ${SRC[l.source]} · ${ago(l.receivedAt)}</div></div>
          <span class="phone ${l.phone ? "" : "none"}">${esc(l.phone || "No phone")}</span>
          <span class="st ${l.status === "followup" ? "queue" : l.status === "failed" ? "skipped" : esc(l.status)}">${ST[l.status] || esc(l.status)}</span></div>`).join("")}</div>`
        : `<div class="empty"><span class="serif">No leads yet.</span>They'll show up here as soon as Facebook sends them.</div>`);
  },
  posts() {
    const pages = S.me.pages, pre = S.view === "all" ? pages.map((p) => p.id) : [S.view];
    return `<div class="sec"><h2 class="serif">Posts</h2><p>Post to one or more Pages</p></div>
      <div class="card">
        <label class="f" for="pmsg">Post text</label><textarea id="pmsg" placeholder="What do you want to share?"></textarea>
        <label class="f" for="plink">Link (optional)</label><input type="url" id="plink" placeholder="https://">
        <label class="f" for="pimg">Photo (optional)</label><input type="file" id="pimg" accept="image/*"><img id="pthumb" class="thumb hidden" alt="">
        <label class="f">Post to</label>
        <div class="checkrow">${pages.map((p) => `<button class="chip ${pre.includes(p.id) ? "on" : ""}" data-pp="${esc(p.id)}"><span class="pdot" style="background:${esc(p.color)}"></span>${esc(p.name)}</button>`).join("")}</div>
        <label class="f">When</label>
        <div class="row"><label class="chip on" id="pnowl"><input type="radio" name="pwhen" value="now" checked style="display:none">Publish now</label>
          <label class="chip" id="platerl"><input type="radio" name="pwhen" value="later" style="display:none">Schedule</label></div>
        <input type="datetime-local" id="pat" class="hidden" style="margin-top:10px">
        <div style="text-align:right;margin-top:16px"><button class="btn gold" id="ppost">Publish</button></div>
      </div>
      <div class="sec" style="margin-top:22px"><h2 class="serif" style="font-size:22px">Recent posts</h2>
        <p><select id="precent" class="chip" style="padding:6px 10px">${pages.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</select></p></div>
      <div class="card" id="precentlist"><p class="fine" style="margin:0">Loading…</p></div>`;
  },
  tpl() {
    if (S.view !== "all") S.tplPage = S.view;
    if (!S.me.pages.some((p) => p.id === S.tplPage)) S.tplPage = S.me.pages[0]?.id;
    return `<div class="sec"><h2 class="serif">Templates</h2><p>Each Page has its own replies</p></div>
      <div class="chips">${S.me.pages.map((p) => `<button class="chip ${p.id === S.tplPage ? "on" : ""}" data-tp="${esc(p.id)}"><span class="pdot" style="background:${esc(p.color)}"></span>${esc(p.name)}</button>`).join("")}</div>
      <div id="tplbox"><p class="fine">Loading…</p></div>`;
  },
  groups() {
    const s = S.settings;
    return `<div class="sec"><h2 class="serif">Group posting</h2><p>You post, Lead Desk does the prep</p></div>
      <div class="card"><div class="draft-h"><span>Post text</span></div>
        <textarea id="gpost" placeholder="Write your group post once, then post it to each group.">${esc(s.groupPostText)}</textarea>
        <p style="font-size:12.5px;color:var(--muted);margin:10px 0 0">Facebook doesn't let apps post to groups. Tap <b>Open &amp; copy</b>: the text is copied and the group opens, so you can paste and post.</p></div>`
      + s.groups.map((g, i) => `<div class="card grp"><span class="gav">◎</span><span class="meta"><b>${esc(g.name)}</b><small>${g.url ? esc(g.url.replace(/^https:\/\/(www\.)?/, "")) : "No link saved"}</small></span>
          <button class="linkish" data-grm="${i}">Remove</button><button class="btn" data-g="${i}" ${g.url ? "" : "disabled"}>Open &amp; copy</button></div>`).join("")
      + `<div class="card"><div class="draft-h"><span>Add a group</span></div>
          <div class="row"><input type="text" id="gname" placeholder="Group name"><input type="url" id="gurl" placeholder="https://www.facebook.com/groups/…"></div>
          <div style="text-align:right;margin-top:12px"><button class="btn" id="gadd">Add group</button> <button class="btn gold" id="gsave">Save</button></div></div>`;
  },
  settings() {
    const r = S.settings.reminders;
    return `<div class="sec"><h2 class="serif">Settings</h2><p>Reminders, Pages and account</p></div>
      <div class="card"><div class="draft-h"><span>Follow-up reminders</span></div>
        <label class="f" for="r1">Remind me if a lead waits this many hours</label><input type="number" id="r1" min="0.25" step="0.25" value="${r.unrepliedAfterH}">
        <label class="f" for="r2">Draft a follow-up after this many hours without an answer</label><input type="number" id="r2" min="1" step="1" value="${r.quietAfterH}">
        <label class="f" for="r3">Follow-ups before a lead is marked cold</label><input type="number" id="r3" min="1" step="1" value="${r.maxFollowUps}">
        <p style="font-size:12.5px;color:var(--muted);margin:12px 0 0">You'll also get an urgent email when a Messenger reply window is about to close. Reminders arrive by email; nothing is ever sent to a lead without your tap.</p>
        <div style="text-align:right;margin-top:14px"><button class="btn gold" id="rsave">Save reminders</button></div></div>
      <div class="card"><div class="draft-h"><span>Facebook Pages</span></div>
        ${S.me.pages.map((p) => `<div style="padding:6px 0">${ptag(p.id)}</div>`).join("")}
        <div style="text-align:right;margin-top:10px"><button class="btn" id="repick">Add or remove Pages</button></div></div>
      <div class="card"><div class="draft-h"><span>Account</span></div>
        <div class="row"><a class="btn" href="/auth/start" style="text-align:center;text-decoration:none">Sign in with Facebook again</a><a class="btn" href="/auth/logout" style="text-align:center;text-decoration:none">Sign out</a></div>
        <p style="font-size:12px;color:var(--muted);margin:12px 0 0"><a href="/privacy.html" style="color:var(--muted)">Privacy</a> · <a href="/data-deletion.html" style="color:var(--muted)">Data deletion</a></p></div>`;
  },
};

const AFTER = {
  posts() {
    const load = async () => {
      const id = $("#precent").value, box = $("#precentlist");
      box.innerHTML = `<p class="fine" style="margin:0">Loading…</p>`;
      try {
        const posts = await api(`/api/posts?page=${encodeURIComponent(id)}`);
        box.innerHTML = posts.length ? posts.map((p) => `<div class="post">${esc(p.message || "(photo or link)")}<small>${p.scheduled ? "Scheduled for " : ""}${new Date(p.time).toLocaleString()}${p.url ? ` · <a href="${esc(p.url)}" target="_blank" rel="noopener">View</a>` : ""}</small></div>`).join("")
          : `<p class="fine" style="margin:0">No posts yet.</p>`;
      } catch (e) { box.innerHTML = `<p class="err" style="margin:0">${esc(e.message)}</p>`; }
    };
    $("#precent").onchange = load;
    if (S.view !== "all") $("#precent").value = S.view;
    load();
  },
  async tpl() {
    if (!S.tplPage) { $("#tplbox").innerHTML = ""; return; }
    try {
      const T = await api(`/api/templates/${encodeURIComponent(S.tplPage)}`);
      $("#tplbox").innerHTML = Object.keys(TPL).map((k) => `<div class="card"><div class="tpl-k"><b>${TPL[k]}</b><span>${k === "followup" ? "drafted when a lead goes quiet" : `sends by ${VIA[k]}`}</span></div>
        <textarea data-k="${k}">${esc(T[k])}</textarea></div>`).join("")
        + `<p style="font-size:12.5px;color:var(--muted);margin:0 2px 14px"><code>{first}</code> becomes their first name. If a lead didn't share a phone number, Lead Desk adds: <i>"What's the best number to reach you?"</i></p>
          <div style="text-align:right"><button class="btn gold" id="savetpl">Save ${esc(page(S.tplPage).name)} templates</button></div>`;
      fit();
    } catch (e) { $("#tplbox").innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  },
};

// ---------- actions ----------
async function refreshLeads() { S.leads = await api("/api/leads"); }
function replaceLead(l) { S.leads = S.leads.map((x) => (x.id === l.id ? l : x)); }

async function resizeImage(file) {
  const img = await createImageBitmap(file);
  const s = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}
let postImage = "";

$("#pagesel").onchange = (e) => { S.view = e.target.value; render(); };
$("#tabs").onclick = (e) => { const b = e.target.closest("button"); if (b) { S.tab = b.dataset.t; render(); } };
document.addEventListener("input", (e) => { if (e.target.tagName === "TEXTAREA") fit(); });

$("#view").addEventListener("change", async (e) => {
  if (e.target.id === "pimg") {
    const f = e.target.files[0];
    postImage = f ? await resizeImage(f) : "";
    $("#pthumb").src = postImage; $("#pthumb").classList.toggle("hidden", !postImage);
  }
  if (e.target.name === "pwhen") {
    const later = e.target.value === "later";
    $("#pat").classList.toggle("hidden", !later);
    $("#pnowl").classList.toggle("on", !later); $("#platerl").classList.toggle("on", later);
  }
});

$("#view").addEventListener("click", async (e) => {
  const b = e.target.closest("button"); if (!b || b.disabled) return;
  try {
    if (b.dataset.copy) { await navigator.clipboard?.writeText(b.dataset.copy).catch(() => {}); toast(`Copied ${b.dataset.copy}`); return; }

    // review cards
    const cardEl = b.closest(".card[data-id]");
    if (cardEl && b.dataset.a) {
      const l = S.leads.find((x) => x.id === cardEl.dataset.id), ta = cardEl.querySelector("textarea");
      if (b.dataset.a === "edit") { S.editing.add(l.id); render(); document.querySelector(`.card[data-id="${CSS.escape(l.id)}"] textarea`)?.focus(); return; }
      if (b.dataset.a === "done") { S.editing.delete(l.id); replaceLead(await api(`/api/leads/${encodeURIComponent(l.id)}`, { method: "PATCH", body: { draft: ta.value } })); render(); return; }
      b.disabled = true;
      if (b.dataset.a === "skip") { replaceLead(await api(`/api/leads/${encodeURIComponent(l.id)}/skip`, { method: "POST" })); toast(`Skipped ${l.name || "lead"}. Nothing was sent.`); }
      if (b.dataset.a === "send") {
        b.textContent = "Sending…";
        try {
          replaceLead(await api(`/api/leads/${encodeURIComponent(l.id)}/send`, { method: "POST", body: { text: ta.value } }));
          S.editing.delete(l.id);
          toast(`Sent to ${l.name || "lead"} by ${VIA[l.source]} · saved to your Sheet`);
        } catch (err) { await refreshLeads(); toast(`Not sent: ${err.message}`); }
      }
      cardEl.classList.add("out"); setTimeout(render, 240); return;
    }

    // posts
    if (b.dataset.pp) { b.classList.toggle("on"); return; }
    if (b.id === "ppost") {
      const pageIds = [...document.querySelectorAll("[data-pp].on")].map((x) => x.dataset.pp);
      const later = document.querySelector("input[name=pwhen]:checked").value === "later";
      const at = later ? new Date($("#pat").value).getTime() : undefined;
      if (!pageIds.length) return toast("Pick at least one Page.");
      if (later && !at) return toast("Pick a date and time to schedule.");
      b.disabled = true; b.textContent = "Publishing…";
      const r = await api("/api/posts", { method: "POST", body: { pageIds, message: $("#pmsg").value, link: $("#plink").value.trim(), imageBase64: postImage, scheduleAt: at } });
      const bad = r.results.filter((x) => !x.ok);
      toast(bad.length ? `Failed on ${bad.map((x) => page(x.pageId).name).join(", ")}: ${bad[0].error}` : later ? "Scheduled." : "Posted.");
      if (!bad.length) { postImage = ""; render(); } else { b.disabled = false; b.textContent = "Publish"; }
      return;
    }

    // templates
    if (b.dataset.tp) { S.tplPage = b.dataset.tp; if (S.view !== "all") S.view = S.tplPage; render(); return; }
    if (b.id === "savetpl") {
      const body = {}; document.querySelectorAll("textarea[data-k]").forEach((t) => (body[t.dataset.k] = t.value));
      await api(`/api/templates/${encodeURIComponent(S.tplPage)}`, { method: "PUT", body });
      toast(`Saved. New ${page(S.tplPage).name} leads will use these.`); return;
    }

    // groups
    if (b.dataset.g !== undefined) {
      const g = S.settings.groups[+b.dataset.g], text = $("#gpost").value;
      await navigator.clipboard?.writeText(text).catch(() => {});
      window.open(g.url, "_blank", "noopener");
      b.textContent = "Copied ✓"; toast(`Text copied. Paste it in "${g.name}".`); return;
    }
    if (b.dataset.grm !== undefined) { S.settings.groups.splice(+b.dataset.grm, 1); S.settings = await saveSettings(); render(); return; }
    if (b.id === "gadd") {
      const name = $("#gname").value.trim(), url = $("#gurl").value.trim();
      if (!name) return toast("Give the group a name.");
      if (url && !/^https:\/\//.test(url)) return toast("The link should start with https://");
      S.settings.groups.push({ name, url }); S.settings = await saveSettings(); render(); return;
    }
    if (b.id === "gsave") { S.settings = await saveSettings(); toast("Saved."); return; }

    // settings
    if (b.id === "rsave") {
      S.settings = await api("/api/settings", { method: "PUT", body: { reminders: { unrepliedAfterH: $("#r1").value, quietAfterH: $("#r2").value, maxFollowUps: $("#r3").value } } });
      toast("Reminders saved."); return;
    }
    if (b.id === "repick") return openPicker();
  } catch (err) {
    if (err instanceof AuthError) { show("connect"); return; }
    toast(err.message); render();
  }
});

function saveSettings() {
  const gp = $("#gpost");
  return api("/api/settings", { method: "PUT", body: { groups: S.settings.groups, groupPostText: gp ? gp.value : S.settings.groupPostText } });
}

// Keep the queue fresh while the app is open.
setInterval(async () => {
  if (document.hidden || $("#app").classList.contains("hidden") || S.editing.size || !["queue", "leads"].includes(S.tab)) return;
  try { await refreshLeads(); render(); } catch {}
}, 60e3);

boot();
