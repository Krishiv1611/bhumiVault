const API_BASE_URL = (window.BHUMIVAULT_CONFIG?.API_BASE_URL || "http://localhost:5000/api").replace(/\/$/, "");
const tokenKey = "bhumivault.token";
const userKey = "bhumivault.user";
const state = {
    token: localStorage.getItem(tokenKey),
    user: readStoredUser(),
    route: location.hash.replace("#", "") || "dashboard",
    busy: false,
    notice: null,
    stats: null,
    parcels: [],
    selectedParcel: null,
    title: null,
    history: [],
    documents: [],
    transfers: [],
    mortgages: [],
    disputes: [],
    recovery: null,
    activities: [],
    health: "checking"
};
function readStoredUser() {
    const raw = localStorage.getItem(userKey);
    if (!raw)
        return null;
    try {
        return JSON.parse(raw);
    }
    catch {
        localStorage.removeItem(userKey);
        return null;
    }
}
async function request(path, options = {}) {
    const headers = new Headers(options.headers);
    if (!(options.body instanceof FormData))
        headers.set("Content-Type", "application/json");
    if (state.token)
        headers.set("Authorization", `Bearer ${state.token}`);
    const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
        ? (await response.json())
        : { success: response.ok, data: undefined };
    if (!response.ok || payload.success === false) {
        throw new Error(payload.error || payload.message || `Request failed with ${response.status}`);
    }
    return (payload.data ?? payload);
}
function setBusy(value) {
    state.busy = value;
    render();
}
function flash(type, message) {
    state.notice = { type, message };
    render();
}
async function run(action) {
    try {
        setBusy(true);
        await action();
    }
    catch (error) {
        flash("error", error instanceof Error ? error.message : "Something went wrong");
    }
    finally {
        state.busy = false;
        render();
    }
}
function formValue(form, name) {
    return String(new FormData(form).get(name) || "").trim();
}
function formNumber(form, name) {
    return Number(formValue(form, name));
}
function short(value, size = 8) {
    if (!value)
        return "Not linked";
    return value.length > size * 2 ? `${value.slice(0, size)}...${value.slice(-size)}` : value;
}
function formatDate(value) {
    if (!value)
        return "Pending";
    const date = typeof value === "number" || /^\d+$/.test(String(value)) ? new Date(Number(value) * 1000) : new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}
function can(...roles) {
    return !!state.user && roles.includes(state.user.role);
}
function navigate(route) {
    state.route = route;
    location.hash = route;
    render();
    void preloadRoute(route);
}
async function preloadRoute(route = state.route) {
    if (!state.token)
        return;
    await run(async () => {
        if (route === "dashboard")
            await loadDashboard();
        if (route === "parcels")
            await loadParcels();
        if (route === "transfers")
            await loadTransfers();
        if (route === "activity")
            await loadActivities();
    });
}
async function loadDashboard() {
    const [stats, health] = await Promise.all([
        request("/parcels/stats"),
        request("/health").catch(() => ({ status: "offline" }))
    ]);
    state.stats = stats;
    state.health = health.status;
}
async function loadParcels(query = "") {
    if (query) {
        state.parcels = await request(`/parcels/search?q=${encodeURIComponent(query)}`);
    }
    else {
        const data = await request("/parcels?limit=25");
        state.parcels = data.parcels;
    }
}
async function loadParcel(parcelId) {
    const [parcel, title, history, documents, mortgages, disputes] = await Promise.all([
        request(`/parcels/${encodeURIComponent(parcelId)}`),
        request(`/parcels/${encodeURIComponent(parcelId)}/verify`),
        request(`/parcels/${encodeURIComponent(parcelId)}/history`),
        request(`/documents/parcel/${encodeURIComponent(parcelId)}`).catch(() => []),
        request(`/mortgages/parcel/${encodeURIComponent(parcelId)}`).catch(() => []),
        request(`/disputes/parcel/${encodeURIComponent(parcelId)}`).catch(() => [])
    ]);
    state.selectedParcel = parcel;
    state.title = title;
    state.history = history;
    state.documents = documents;
    state.mortgages = mortgages;
    state.disputes = disputes;
    state.recovery = await request(`/recovery/${encodeURIComponent(parcelId)}`).catch(() => null);
    state.route = "parcel";
    location.hash = "parcel";
}
async function loadTransfers() {
    state.transfers = can("REGISTRAR") ? await request("/transfers/pending") : [];
}
async function loadActivities() {
    const data = await request("/activity?limit=30");
    state.activities = data.activities;
}
function appShell(content) {
    if (!state.user)
        return authView();
    return `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">BV</div>
          <div>
            <strong>BhumiVault</strong>
            <span>Land Registry</span>
          </div>
        </div>
        <nav>${navButton("dashboard", "Dashboard")}${navButton("parcels", "Parcels")}${navButton("transfers", "Transfers")}${navButton("documents", "Documents")}${navButton("mortgages", "Mortgages")}${navButton("disputes", "Disputes")}${navButton("recovery", "Recovery")}${navButton("activity", "Audit")}</nav>
        <div class="user-card">
          <div class="role">${state.user.role}</div>
          <strong>${state.user.fullName}</strong>
          <span>${state.user.email}</span>
          <code>${short(state.user.walletAddress)}</code>
          <button class="ghost full" data-action="logout">Sign out</button>
        </div>
      </aside>
      <main class="main">
        <header class="topbar">
          <div>
            <p class="eyebrow">Backend</p>
            <h1>${pageTitle()}</h1>
          </div>
          <div class="top-actions">
            <span class="pill ${state.health === "ok" ? "good" : state.health === "checking" ? "" : "bad"}">${state.health}</span>
            <button data-action="refresh">Refresh</button>
          </div>
        </header>
        ${notice()}
        ${state.busy ? `<div class="loader">Loading secure registry data...</div>` : ""}
        ${content}
      </main>
    </div>
  `;
}
function navButton(route, label) {
    return `<button class="${state.route === route ? "active" : ""}" data-route="${route}">${label}</button>`;
}
function pageTitle() {
    const map = {
        dashboard: "Registry Command Center",
        parcels: "Parcel Search",
        parcel: "Parcel Detail",
        transfers: "Transfer Workflow",
        documents: "Document Vault",
        mortgages: "Mortgage Controls",
        disputes: "Dispute and Freeze Controls",
        recovery: "Ownership Recovery",
        activity: "Audit Trail"
    };
    return map[state.route] || "Dashboard";
}
function notice() {
    return state.notice ? `<div class="notice ${state.notice.type}">${state.notice.message}</div>` : "";
}
function authView() {
    return `
    <main class="auth">
      <section class="auth-card">
        <div class="auth-brand">
          <div class="brand-mark">BV</div>
          <div>
            <strong>BhumiVault</strong>
            <span>Secure blockchain land registry</span>
          </div>
        </div>

        ${notice()}

        <div class="auth-tabs">
          <button class="auth-tab active" data-tab="login" type="button">Sign in</button>
          <button class="auth-tab" data-tab="register" type="button">Create account</button>
        </div>

        <!-- LOGIN PANEL -->
        <div class="auth-pane" id="pane-login">
          <form data-form="login">
            <div class="field-group">
              <label class="field-label">Email address
                <input name="email" type="email" required placeholder="you@example.com" autocomplete="email" />
              </label>
              <label class="field-label">Password
                <input name="password" type="password" required placeholder="Enter your password" autocomplete="current-password" />
              </label>
            </div>
            <button class="primary full-btn" type="submit">Sign in →</button>
            <p class="auth-hint">Don't have an account? <button class="link-btn" data-tab="register" type="button">Create one</button></p>
          </form>
        </div>

        <!-- REGISTER PANEL -->
        <div class="auth-pane hidden" id="pane-register">
          <form data-form="register">
            <p class="auth-section-label">Your identity</p>
            <div class="field-row">
              <label class="field-label">Full name <span class="req">*</span>
                <input name="fullName" required placeholder="Rahul Sharma" />
              </label>
              <label class="field-label">Email address <span class="req">*</span>
                <input name="email" type="email" required placeholder="you@example.com" autocomplete="email" />
              </label>
            </div>
            <label class="field-label">Password <span class="req">*</span>
              <input name="password" type="password" required minlength="8" placeholder="Minimum 8 characters" autocomplete="new-password" />
            </label>

            <p class="auth-section-label" style="margin-top:1.2rem">Your role in the system</p>
            <div class="role-picker">
              ${[
        { value: "CITIZEN", icon: "🏠", label: "Citizen / Landowner", desc: "Buy, sell, and view land records. Start a property transfer." },
        { value: "REGISTRAR", icon: "🏛️", label: "Sub-Registrar", desc: "Authorize transfers, freeze parcels, approve recoveries." },
        { value: "REVENUE", icon: "🗺️", label: "Revenue Dept.", desc: "Register new land parcels (genesis registration)." },
        { value: "BANK", icon: "🏦", label: "Bank Officer", desc: "Apply and release mortgage liens on properties." },
        { value: "JUDICIARY", icon: "⚖️", label: "Court / Judiciary", desc: "Place and lift court injunctions; approve recoveries." },
        { value: "ADMIN", icon: "🔑", label: "Admin", desc: "System administration (reserved)." },
    ].map((r, i) => `
                <label class="role-card ${i === 0 ? "selected" : ""}">
                  <input type="radio" name="role" value="${r.value}" ${i === 0 ? "checked" : ""} />
                  <span class="role-icon">${r.icon}</span>
                  <span class="role-card-label">${r.label}</span>
                  <span class="role-card-desc">${r.desc}</span>
                </label>
              `).join("")}
            </div>

            <p class="auth-section-label" style="margin-top:1.2rem">Organisation <span class="opt">(optional)</span></p>
            <div class="field-row">
              <label class="field-label">Organisation
                <input name="organization" placeholder="e.g. State Bank of India" />
              </label>
              <label class="field-label">Designation
                <input name="designation" placeholder="e.g. Loan Officer" />
              </label>
            </div>

            <p class="auth-section-label" style="margin-top:1.2rem">Blockchain wallet <span class="opt">(optional — needed for on-chain actions)</span></p>
            <label class="field-label">Ethereum wallet address
              <input name="walletAddress" placeholder="0x..." autocomplete="off" />
              <span class="field-hint">Connect your MetaMask or Hardhat account address here.</span>
            </label>

            <button class="primary full-btn" type="submit">Create account →</button>
            <p class="auth-hint">Already have an account? <button class="link-btn" data-tab="login" type="button">Sign in</button></p>
          </form>
        </div>

      </section>
    </main>
  `;
}
function dashboardView() {
    const stats = state.stats || { totalParcels: 0, cleanCount: 0, mortgagedCount: 0, disputedCount: 0 };
    return `
    <section class="hero">
      <div>
        <p class="eyebrow">Role-aware land registry</p>
        <h2>Verify clean title, review risk, and process controlled ownership changes.</h2>
      </div>
      <form data-form="quick-search" class="searchbar">
        <input name="q" placeholder="Search ULPIN, district, survey number, owner wallet" />
        <button class="primary">Search</button>
      </form>
    </section>
    <section class="stats">
      ${statCard("Total Parcels", stats.totalParcels, "Registered land records")}
      ${statCard("Clean Titles", stats.cleanCount, "Transfer eligible")}
      ${statCard("Mortgaged", stats.mortgagedCount, "Bank lien active")}
      ${statCard("Disputed", stats.disputedCount, "Court restriction active")}
    </section>
    <section class="grid two-col">
      <div class="panel">
        <h3>Your workflow</h3>
        <div class="workflow">${workflowStep("Search", true)}${workflowStep("Verify", true)}${workflowStep("Upload", can("CITIZEN", "REVENUE"))}${workflowStep("Approve", can("REGISTRAR", "JUDICIARY", "BANK"))}</div>
      </div>
      <div class="panel">
        <h3>Available actions</h3>
        <div class="chips">${roleActions().map((item) => `<button data-route="${item.route}">${item.label}</button>`).join("")}</div>
      </div>
    </section>
  `;
}
function statCard(label, value, caption) {
    return `<article class="stat"><span>${label}</span><strong>${value}</strong><small>${caption}</small></article>`;
}
function workflowStep(label, enabled) {
    return `<div class="${enabled ? "done" : ""}"><span></span>${label}</div>`;
}
function roleActions() {
    const base = [{ label: "Search parcels", route: "parcels" }, { label: "Upload documents", route: "documents" }];
    if (can("CITIZEN"))
        base.push({ label: "Start transfer", route: "transfers" });
    if (can("REGISTRAR"))
        base.push({ label: "Approve transfers", route: "transfers" }, { label: "Freeze parcels", route: "disputes" }, { label: "Recover ownership", route: "recovery" });
    if (can("REVENUE"))
        base.push({ label: "Register parcel", route: "parcels" });
    if (can("BANK"))
        base.push({ label: "Apply mortgage", route: "mortgages" });
    if (can("JUDICIARY"))
        base.push({ label: "Apply injunction", route: "disputes" }, { label: "Approve recovery", route: "recovery" });
    return base;
}
function parcelsView() {
    return `
    <section class="panel">
      <form data-form="parcel-search" class="toolbar">
        <input name="q" placeholder="ULPIN, district, taluk, survey number, wallet" />
        <button class="primary">Search</button>
        <button type="button" data-action="load-parcels">All parcels</button>
      </form>
    </section>
    ${can("REVENUE") ? registerParcelForm() : ""}
    <section class="list">
      ${state.parcels.length ? state.parcels.map(parcelCard).join("") : emptyState("No parcels loaded", "Search or load all parcels to begin verification.")}
    </section>
  `;
}
function registerParcelForm() {
    return `
    <form data-form="register-parcel" class="panel">
      <h3>Register genesis parcel</h3>
      <div class="form-grid">
        <label>Parcel ID<input name="parcelId" required /></label>
        <label>State code<input name="stateCode" maxlength="2" required /></label>
        <label>District<input name="district" required /></label>
        <label>Taluk<input name="taluk" required /></label>
        <label>Survey number<input name="surveyNumber" required /></label>
        <label>Area sq meters<input name="areaSqMeters" type="number" min="1" required /></label>
        <label>Land type<select name="landType">${["AGRICULTURAL", "RESIDENTIAL", "COMMERCIAL", "INDUSTRIAL", "GOVERNMENT_RESERVED"].map((x) => `<option>${x}</option>`).join("")}</select></label>
        <label>Initial owner<input name="initialOwner" required placeholder="0x..." /></label>
        <label>Deed hash<input name="deedDocumentHash" required minlength="64" /></label>
        <label>Boundary hash<input name="boundaryCoordinatesHash" required minlength="64" /></label>
      </div>
      <button class="primary">Register parcel</button>
    </form>
  `;
}
function parcelCard(parcel) {
    const clean = parcel.activeMortgagesCount === 0 && parcel.activeDisputesCount === 0 && !parcel.isLocked;
    return `
    <article class="parcel-card">
      <div>
        <span class="pill ${clean ? "good" : "warn"}">${clean ? "Clean title" : "Risk flagged"}</span>
        <h3>${parcel.parcelId}</h3>
        <p>${parcel.district}, ${parcel.stateCode} | Survey ${parcel.surveyNumber} | ${parcel.landType}</p>
      </div>
      <div class="parcel-meta">
        <span>${parcel.areaSqMeters} sq m</span>
        <code>${short(parcel.currentOwnerAddress)}</code>
      </div>
      <button class="primary" data-action="open-parcel" data-id="${parcel.parcelId}">Open</button>
    </article>
  `;
}
function parcelDetailView() {
    const parcel = state.selectedParcel;
    if (!parcel)
        return emptyState("No parcel selected", "Open a parcel from search results.");
    return `
    <section class="detail-head">
      <button data-route="parcels">Back</button>
      <div>
        <p class="eyebrow">${parcel.landType}</p>
        <h2>${parcel.parcelId}</h2>
        <p>${parcel.taluk}, ${parcel.district}, ${parcel.stateCode} | Survey ${parcel.surveyNumber}</p>
      </div>
      ${titleBadge()}
    </section>
    <section class="grid three-col">
      ${fact("Current owner", state.title?.currentOwnerName || short(parcel.currentOwnerAddress))}
      ${fact("Area", `${parcel.areaSqMeters} sq m`)}
      ${fact("Status", parcel.isLocked ? "Locked" : "Unlocked")}
    </section>
    <section class="grid two-col">
      <div class="panel"><h3>Title verification</h3>${titleTable()}${documentVerifyForm(parcel.parcelId)}</div>
      <div class="panel"><h3>Risk controls</h3>${riskList(parcel)}${freezeControls(parcel)}</div>
    </section>
    <section class="grid two-col">
      <div class="panel"><h3>Documents</h3>${documentList()}</div>
      <div class="panel"><h3>Ownership timeline</h3>${timeline()}</div>
    </section>
  `;
}
function titleBadge() {
    if (!state.title)
        return `<span class="pill">Unchecked</span>`;
    return `<span class="pill ${state.title.isCleanTitle ? "good" : "bad"}">${state.title.isCleanTitle ? "Clean title" : "Blocked title"}</span>`;
}
function fact(label, value) {
    return `<article class="fact"><span>${label}</span><strong>${value}</strong></article>`;
}
function titleTable() {
    const title = state.title;
    if (!title)
        return emptyState("Not verified", "Run title verification from parcel search.");
    return `<dl class="kv">
    <div><dt>Mortgage</dt><dd>${title.isMortgaged ? "Active" : "Clear"}</dd></div>
    <div><dt>Dispute</dt><dd>${title.isDisputed ? "Active" : "Clear"}</dd></div>
    <div><dt>Lock</dt><dd>${title.isLocked ? "Locked" : "Open"}</dd></div>
    <div><dt>Owner wallet</dt><dd><code>${short(title.currentOwnerAddress, 10)}</code></dd></div>
  </dl>`;
}
function riskList(parcel) {
    return `<div class="risk-list">
    <div><strong>${parcel.activeMortgagesCount}</strong><span>active mortgages</span></div>
    <div><strong>${parcel.activeDisputesCount}</strong><span>active disputes</span></div>
    <div><strong>${parcel.isLocked ? "Yes" : "No"}</strong><span>manual freeze</span></div>
  </div>`;
}
function freezeControls(parcel) {
    if (!can("REGISTRAR"))
        return `<p class="muted">Freeze and unfreeze controls are available to registrar accounts.</p>`;
    return `<div class="actions">
    <button class="danger" data-action="freeze" data-id="${parcel.parcelId}">Freeze</button>
    <button data-action="unfreeze" data-id="${parcel.parcelId}">Unfreeze</button>
  </div>`;
}
function documentVerifyForm(parcelId) {
    return `<form data-form="verify-doc" class="inline-form">
    <input type="hidden" name="parcelId" value="${parcelId}" />
    <input name="documentHash" placeholder="Paste SHA-256 document hash" minlength="64" required />
    <button>Verify document</button>
  </form>`;
}
function documentList() {
    if (!state.documents.length)
        return emptyState("No documents", "Uploaded documents for this parcel appear here.");
    return state.documents.map((doc) => `<div class="doc-row"><div><strong>${doc.originalName}</strong><span>${doc.purpose} | ${Math.round(doc.sizeBytes / 1024)} KB</span><code>${short(doc.sha256Hash, 12)}</code></div><a href="${API_BASE_URL}/documents/${doc.id}/download" target="_blank">Download</a></div>`).join("");
}
function timeline() {
    if (!state.history.length)
        return emptyState("No history", "Ownership events sync from the blockchain.");
    return `<ol class="timeline">${state.history.map((item) => `<li><span>${item.historyIndex}</span><div><strong>${item.transferType}</strong><p>${short(item.fromOwnerAddress)} to ${short(item.toOwnerAddress)}</p><small>${formatDate(item.timestamp)} | block ${item.blockNumber}</small></div></li>`).join("")}</ol>`;
}
function transfersView() {
    return `
    <section class="grid two-col">
      <form data-form="initiate-transfer" class="panel">
        <h3>Initiate transfer</h3>
        <label>Parcel ID<input name="parcelId" required /></label>
        <label>Buyer wallet<input name="buyerAddress" required placeholder="0x..." /></label>
        <label>Sale consideration<input name="saleConsideration" type="number" min="0" required /></label>
        <label>Sale deed hash<input name="saleDeedHash" minlength="64" required /></label>
        <details>
          <summary>Prototype signing</summary>
          <p class="muted">The current backend manual transfer endpoint requires the seller private key. Enter it only for local demo chains. It is never stored by this frontend.</p>
          <label>Seller private key<input name="sellerPrivateKey" type="password" autocomplete="off" /></label>
        </details>
        <button class="primary">Initiate</button>
      </form>
      <form data-form="accept-transfer" class="panel">
        <h3>Buyer acceptance</h3>
        <label>Parcel ID<input name="parcelId" required /></label>
        <details open>
          <summary>Prototype signing</summary>
          <label>Buyer private key<input name="buyerPrivateKey" type="password" autocomplete="off" required /></label>
        </details>
        <button>Accept transfer</button>
      </form>
    </section>
    ${can("REGISTRAR") ? pendingTransfers() : `<section class="panel">${emptyState("Registrar approvals", "Pending transfer approval queue is visible to registrars.")}</section>`}
  `;
}
function pendingTransfers() {
    return `<section class="panel"><div class="section-head"><h3>Pending registrar approvals</h3><button data-action="load-transfers">Reload</button></div>${state.transfers.length ? state.transfers.map((t) => `<article class="approval"><div><strong>${t.parcelId}</strong><p>${short(t.sellerAddress)} to ${short(t.buyerAddress)} | INR ${t.saleConsideration}</p><span>${t.buyerAccepted ? "Buyer accepted" : "Waiting for buyer"}</span></div><button class="primary" data-action="authorize-transfer" data-id="${t.parcelId}">Authorize</button></article>`).join("") : emptyState("No pending transfers", "Approved or inactive requests will not appear here.")}</section>`;
}
function documentsView() {
    return `
    <details class="panel" open>
      <summary>📄 How document hashing works</summary>
      <div class="hash-explainer">
        <p><strong>1. Upload a PDF</strong> using the form below. The backend immediately computes its <strong>SHA-256 fingerprint</strong> (a 64-character code unique to that file's contents).</p>
        <p><strong>2. Where to see the hash:</strong> After a successful upload, a green notice banner appears at the top of this page showing the first 24 characters of the hash — e.g. <code>3a7bf29c04d1…</code>. The full hash is also visible in the document list on the Parcel Detail page (under "Documents").</p>
        <p><strong>3. Where you paste the hash:</strong></p>
        <ul class="hash-uses">
          <li><strong>Register Parcel</strong> → "Deed hash" field  (genesis deed PDF)</li>
          <li><strong>Transfers</strong>        → "Sale deed hash" field (sale agreement PDF)</li>
          <li><strong>Mortgages</strong>        → "Mortgage document hash" / "Release document hash" fields</li>
          <li><strong>Disputes</strong>         → "Court order hash" / "Judgment document hash" fields</li>
          <li><strong>Recovery</strong>         → "Recovery reason document hash" field</li>
          <li><strong>Parcel Detail</strong>    → "Verify document" inline form (to check a hash matches the record)</li>
        </ul>
        <p class="muted" style="margin:0">This way the blockchain stores only the fingerprint — not the file itself — and anyone can verify the document has not been tampered with.</p>
      </div>
    </details>
    <form data-form="upload-document" class="panel">
      <h3>Upload document</h3>
      <div class="form-grid">
        <label>Parcel ID <span class="opt">(optional — leave blank to upload without linking)</span><input name="parcelId" placeholder="IN-MH-PUN-2025-0987" /></label>
        <label>Purpose<select name="purpose">${["SALE_DEED", "GENESIS_DEED", "MORTGAGE_DOC", "MORTGAGE_NOC", "COURT_ORDER", "COURT_JUDGMENT", "RECOVERY_DOC", "SUCCESSION_CERTIFICATE", "CADASTRAL_MAP", "IDENTITY_PROOF", "OTHER"].map((x) => `<option>${x}</option>`).join("")}</select></label>
        <label class="wide">File (PDF, image, or any document)<input name="file" type="file" required /></label>
      </div>
      <button class="primary">Upload and generate hash</button>
      <p class="muted" style="margin:0">After upload the SHA-256 hash will appear in the green success banner above. Copy it to use in other forms.</p>
    </form>`;
}
function mortgagesView() {
    return `<section class="grid two-col">
    <form data-form="apply-mortgage" class="panel">
      <h3>Apply mortgage lien</h3>
      <label>Parcel ID<input name="parcelId" required /></label>
      <label>Bank name<input name="bankName" required /></label>
      <label>Loan reference<input name="loanReferenceNumber" required /></label>
      <label>Loan amount<input name="loanAmount" type="number" min="1" required /></label>
      <label>Mortgage document hash<input name="mortgageDocHash" minlength="64" required /></label>
      <button class="primary" ${can("BANK") ? "" : "disabled"}>Apply mortgage</button>
      ${can("BANK") ? "" : `<p class="muted">Use a BANK account for mortgage actions.</p>`}
    </form>
    <form data-form="release-mortgage" class="panel">
      <h3>Release mortgage</h3>
      <label>Mortgage on-chain ID<input name="mortgageId" required /></label>
      <label>Parcel ID<input name="parcelId" required /></label>
      <label>Release document hash<input name="releaseDocHash" minlength="64" required /></label>
      <button ${can("BANK") ? "" : "disabled"}>Release mortgage</button>
    </form>
  </section>`;
}
function disputesView() {
    return `<section class="grid two-col">
    <form data-form="apply-dispute" class="panel">
      <h3>Apply court injunction</h3>
      <label>Parcel ID<input name="parcelId" required /></label>
      <label>Court name<input name="courtName" required /></label>
      <label>Case number<input name="caseNumber" required /></label>
      <label>Court order hash<input name="courtOrderHash" minlength="64" required /></label>
      <label>Reason<textarea name="reason" required></textarea></label>
      <button class="primary" ${can("JUDICIARY") ? "" : "disabled"}>Apply dispute</button>
      ${can("JUDICIARY") ? "" : `<p class="muted">Use a JUDICIARY account for court injunctions.</p>`}
    </form>
    <form data-form="lift-dispute" class="panel">
      <h3>Lift injunction</h3>
      <label>Dispute on-chain ID<input name="disputeId" required /></label>
      <label>Parcel ID<input name="parcelId" required /></label>
      <label>Judgment document hash<input name="judgmentDocHash" minlength="64" required /></label>
      <button ${can("JUDICIARY") ? "" : "disabled"}>Lift dispute</button>
    </form>
  </section>`;
}
function recoveryView() {
    return `<section class="grid two-col">
    <form data-form="initiate-recovery" class="panel">
      <h3>Initiate ownership recovery</h3>
      <label>Parcel ID<input name="parcelId" required /></label>
      <label>Proposed new owner<input name="proposedNewOwner" required placeholder="0x..." /></label>
      <label>Recovery reason document hash<input name="recoveryReasonDocHash" minlength="64" required /></label>
      <button class="primary" ${can("REGISTRAR", "JUDICIARY") ? "" : "disabled"}>Initiate recovery</button>
    </form>
    <form data-form="approve-recovery" class="panel">
      <h3>Approve or finalize recovery</h3>
      <label>Parcel ID<input name="parcelId" required /></label>
      <div class="actions">
        <button ${can("REGISTRAR", "JUDICIARY") ? "" : "disabled"}>Approve</button>
        <button type="button" data-action="finalize-recovery" ${can("REGISTRAR") ? "" : "disabled"}>Finalize</button>
      </div>
    </form>
  </section>`;
}
function activityView() {
    return `<section class="panel"><div class="section-head"><h3>Recent audit activity</h3><button data-action="load-activity">Reload</button></div>${state.activities.length ? state.activities.map((a) => `<article class="activity"><span class="pill">${a.entityType}</span><div><strong>${a.action}</strong><p>${a.user?.fullName || "System"} | ${a.entityId || "no entity"} | ${formatDate(a.createdAt)}</p></div></article>`).join("") : emptyState("No audit events loaded", "Refresh to read recent backend activity.")}</section>`;
}
function emptyState(title, body) {
    return `<div class="empty"><strong>${title}</strong><span>${body}</span></div>`;
}
function render() {
    const app = document.querySelector("#app");
    if (!app)
        return;
    const view = state.route === "dashboard" ? dashboardView()
        : state.route === "parcels" ? parcelsView()
            : state.route === "parcel" ? parcelDetailView()
                : state.route === "transfers" ? transfersView()
                    : state.route === "documents" ? documentsView()
                        : state.route === "mortgages" ? mortgagesView()
                            : state.route === "disputes" ? disputesView()
                                : state.route === "recovery" ? recoveryView()
                                    : state.route === "activity" ? activityView()
                                        : dashboardView();
    app.innerHTML = appShell(view);
}
document.addEventListener("click", (event) => {
    const target = event.target;
    const route = target.closest("[data-route]")?.dataset.route;
    if (route)
        navigate(route);
    // Auth tab switching
    const tab = target.closest("[data-tab]")?.dataset.tab;
    if (tab) {
        const loginPane = document.getElementById("pane-login");
        const registerPane = document.getElementById("pane-register");
        const tabs = document.querySelectorAll(".auth-tab");
        if (loginPane && registerPane) {
            loginPane.classList.toggle("hidden", tab !== "login");
            registerPane.classList.toggle("hidden", tab !== "register");
        }
        tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
        return;
    }
    // Role-card radio highlighting
    if (target.closest(".role-card")) {
        document.querySelectorAll(".role-card").forEach(c => c.classList.remove("selected"));
        target.closest(".role-card")?.classList.add("selected");
    }
    const action = target.closest("[data-action]")?.dataset.action;
    const id = target.closest("[data-id]")?.dataset.id;
    if (!action)
        return;
    if (action === "logout") {
        localStorage.removeItem(tokenKey);
        localStorage.removeItem(userKey);
        state.token = null;
        state.user = null;
        render();
    }
    if (action === "refresh")
        void preloadRoute();
    if (action === "load-parcels")
        void run(() => loadParcels());
    if (action === "open-parcel" && id)
        void run(() => loadParcel(id));
    if (action === "freeze" && id)
        void run(async () => { await request(`/parcels/${id}/freeze`, { method: "POST", body: "{}" }); flash("success", "Parcel frozen"); await loadParcel(id); });
    if (action === "unfreeze" && id)
        void run(async () => { await request(`/parcels/${id}/unfreeze`, { method: "POST", body: "{}" }); flash("success", "Parcel unfrozen"); await loadParcel(id); });
    if (action === "load-transfers")
        void run(loadTransfers);
    if (action === "authorize-transfer" && id)
        void run(async () => { await request(`/transfers/${id}/authorize`, { method: "POST", body: "{}" }); flash("success", "Transfer authorized"); await loadTransfers(); });
    if (action === "load-activity")
        void run(loadActivities);
    if (action === "finalize-recovery") {
        const form = target.closest("form");
        const parcelId = form ? formValue(form, "parcelId") : "";
        if (parcelId)
            void run(async () => { await request(`/recovery/${parcelId}/finalize`, { method: "POST", body: "{}" }); flash("success", "Recovery finalized"); });
    }
});
document.addEventListener("submit", (event) => {
    const form = event.target;
    const name = form.dataset.form;
    if (!name)
        return;
    event.preventDefault();
    void run(async () => {
        if (name === "login") {
            const data = await request("/auth/login", { method: "POST", body: JSON.stringify({ email: formValue(form, "email"), password: formValue(form, "password") }) });
            state.token = data.token;
            state.user = data.user;
            localStorage.setItem(tokenKey, data.token);
            localStorage.setItem(userKey, JSON.stringify(data.user));
            state.route = "dashboard";
            flash("success", "Signed in");
            await loadDashboard();
        }
        if (name === "register") {
            const body = {
                email: formValue(form, "email"),
                password: formValue(form, "password"),
                fullName: formValue(form, "fullName"),
                role: formValue(form, "role"),
                walletAddress: formValue(form, "walletAddress") || undefined,
                organization: formValue(form, "organization") || undefined,
                designation: formValue(form, "designation") || undefined
            };
            const data = await request("/auth/register", { method: "POST", body: JSON.stringify(body) });
            state.token = data.token;
            state.user = data.user;
            localStorage.setItem(tokenKey, data.token);
            localStorage.setItem(userKey, JSON.stringify(data.user));
            state.route = "dashboard";
            flash("success", "Account created");
            await loadDashboard();
        }
        if (name === "quick-search" || name === "parcel-search") {
            await loadParcels(formValue(form, "q"));
            state.route = "parcels";
        }
        if (name === "register-parcel") {
            await request("/parcels/register", {
                method: "POST",
                body: JSON.stringify({
                    parcelId: formValue(form, "parcelId"),
                    stateCode: formValue(form, "stateCode"),
                    district: formValue(form, "district"),
                    taluk: formValue(form, "taluk"),
                    surveyNumber: formValue(form, "surveyNumber"),
                    areaSqMeters: formNumber(form, "areaSqMeters"),
                    landType: formValue(form, "landType"),
                    initialOwner: formValue(form, "initialOwner"),
                    deedDocumentHash: formValue(form, "deedDocumentHash"),
                    boundaryCoordinatesHash: formValue(form, "boundaryCoordinatesHash")
                })
            });
            flash("success", "Genesis parcel registered");
            await loadParcels();
        }
        if (name === "verify-doc") {
            const parcelId = formValue(form, "parcelId");
            const result = await request(`/parcels/${parcelId}/verify-document`, { method: "POST", body: JSON.stringify({ documentHash: formValue(form, "documentHash") }) });
            flash(result.isMatch ? "success" : "error", result.isMatch ? "Document hash matches title record" : "Document hash does not match title record");
        }
        if (name === "initiate-transfer") {
            await request("/transfers/initiate", {
                method: "POST",
                body: JSON.stringify({
                    parcelId: formValue(form, "parcelId"),
                    buyerAddress: formValue(form, "buyerAddress"),
                    saleConsideration: formNumber(form, "saleConsideration"),
                    saleDeedHash: formValue(form, "saleDeedHash"),
                    sellerPrivateKey: formValue(form, "sellerPrivateKey") || undefined
                })
            });
            flash("success", "Transfer initiated");
        }
        if (name === "accept-transfer") {
            await request(`/transfers/${formValue(form, "parcelId")}/accept`, { method: "POST", body: JSON.stringify({ buyerPrivateKey: formValue(form, "buyerPrivateKey") }) });
            flash("success", "Buyer accepted transfer");
        }
        if (name === "upload-document") {
            const data = new FormData(form);
            const doc = await request("/documents/upload", { method: "POST", body: data });
            flash("success", `Uploaded and hashed: ${short(doc.sha256Hash, 12)}`);
        }
        if (name === "apply-mortgage") {
            await request("/mortgages/apply", { method: "POST", body: JSON.stringify({ parcelId: formValue(form, "parcelId"), bankName: formValue(form, "bankName"), loanReferenceNumber: formValue(form, "loanReferenceNumber"), loanAmount: formNumber(form, "loanAmount"), mortgageDocHash: formValue(form, "mortgageDocHash") }) });
            flash("success", "Mortgage applied");
        }
        if (name === "release-mortgage") {
            await request(`/mortgages/${formValue(form, "mortgageId")}/release`, { method: "POST", body: JSON.stringify({ parcelId: formValue(form, "parcelId"), releaseDocHash: formValue(form, "releaseDocHash") }) });
            flash("success", "Mortgage released");
        }
        if (name === "apply-dispute") {
            await request("/disputes/apply", { method: "POST", body: JSON.stringify({ parcelId: formValue(form, "parcelId"), courtName: formValue(form, "courtName"), caseNumber: formValue(form, "caseNumber"), courtOrderHash: formValue(form, "courtOrderHash"), reason: formValue(form, "reason") }) });
            flash("success", "Dispute injunction applied");
        }
        if (name === "lift-dispute") {
            await request(`/disputes/${formValue(form, "disputeId")}/lift`, { method: "POST", body: JSON.stringify({ parcelId: formValue(form, "parcelId"), judgmentDocHash: formValue(form, "judgmentDocHash") }) });
            flash("success", "Dispute lifted");
        }
        if (name === "initiate-recovery") {
            await request("/recovery/initiate", { method: "POST", body: JSON.stringify({ parcelId: formValue(form, "parcelId"), proposedNewOwner: formValue(form, "proposedNewOwner"), recoveryReasonDocHash: formValue(form, "recoveryReasonDocHash") }) });
            flash("success", "Recovery initiated");
        }
        if (name === "approve-recovery") {
            await request(`/recovery/${formValue(form, "parcelId")}/approve`, { method: "POST", body: "{}" });
            flash("success", "Recovery approved");
        }
    });
});
window.addEventListener("hashchange", () => {
    state.route = location.hash.replace("#", "") || "dashboard";
    render();
    void preloadRoute();
});
render();
void preloadRoute();
export {};
