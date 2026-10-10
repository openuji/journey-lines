//#region \0vite/modulepreload-polyfill.js
(function polyfill() {
	const relList = document.createElement("link").relList;
	if (relList && relList.supports && relList.supports("modulepreload")) return;
	for (const link of document.querySelectorAll("link[rel=\"modulepreload\"]")) processPreload(link);
	new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			if (mutation.type !== "childList") continue;
			for (const node of mutation.addedNodes) if (node.tagName === "LINK" && node.rel === "modulepreload") processPreload(node);
		}
	}).observe(document, {
		childList: true,
		subtree: true
	});
	function getFetchOpts(link) {
		const fetchOpts = {};
		if (link.integrity) fetchOpts.integrity = link.integrity;
		if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
		if (link.crossOrigin === "use-credentials") fetchOpts.credentials = "include";
		else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
		else fetchOpts.credentials = "same-origin";
		return fetchOpts;
	}
	function processPreload(link) {
		if (link.ep) return;
		link.ep = true;
		const fetchOpts = getFetchOpts(link);
		fetch(link.href, fetchOpts);
	}
})();
//#endregion
//#region src/lib/catalog.ts
var identifier = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
function normalizeIdentifier(value, fallback = "slot") {
	const normalized = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[^a-z]+/, "").replace(/[._-]+$/g, "");
	return identifier.test(normalized) ? normalized : fallback;
}
function defaultTenant(hostname) {
	const parts = hostname.toLowerCase().split(".").filter(Boolean);
	return normalizeIdentifier(parts.length > 2 ? parts.at(-3) : parts[0] ?? "tenant", "tenant").replaceAll(".", "-");
}
//#endregion
//#region src/lib/messages.ts
async function request(message) {
	return chrome.runtime.sendMessage(message);
}
//#endregion
//#region src/entrypoints/popup/main.ts
var element = (id) => document.getElementById(id);
var tenant = element("tenant");
var pick = element("pick");
var slots = element("slots");
var empty = element("empty");
var count = element("count");
var copy = element("copy");
var download = element("download");
var clear = element("clear");
var status = element("status");
var state = {
	tenant: "tenant",
	slots: []
};
async function activePage() {
	const [focused] = await chrome.tabs.query({
		active: true,
		lastFocusedWindow: true
	});
	if (focused) return focused;
	return (await chrome.tabs.query({ active: true })).sort((left, right) => (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0))[0];
}
function message(text, error = false) {
	status.textContent = text;
	status.classList.toggle("error", error);
}
function render(next) {
	state = next;
	tenant.value = state.tenant;
	slots.replaceChildren(...state.slots.map((slot) => {
		const item = document.createElement("div");
		item.className = "slot";
		const head = document.createElement("div");
		head.className = "slot-head";
		const name = document.createElement("strong");
		name.textContent = slot.id;
		const operation = document.createElement("span");
		operation.textContent = slot.action;
		const remove = document.createElement("button");
		remove.type = "button";
		remove.textContent = "Remove";
		remove.ariaLabel = `Remove ${slot.id}`;
		remove.addEventListener("click", () => void request({
			type: "collector:delete",
			id: slot.id
		}).then((reply) => {
			if (reply.ok && reply.state) render(reply.state);
			else message(reply.ok ? "Slot was not removed." : reply.error, true);
		}));
		const selector = document.createElement("code");
		selector.textContent = slot.selector;
		head.append(name, operation, remove);
		item.append(head, selector);
		return item;
	}));
	count.textContent = String(state.slots.length);
	empty.hidden = state.slots.length > 0;
	copy.disabled = download.disabled = clear.disabled = state.slots.length === 0;
}
async function exportProfile(downloadFile) {
	const reply = await request({
		type: "collector:export",
		download: downloadFile
	});
	if (!reply.ok) return message(reply.error, true);
	if (!reply.json) return message("The exported profile was empty.", true);
	if (!downloadFile) await navigator.clipboard.writeText(reply.json);
	message(downloadFile ? `${state.tenant}/profiles.jsonld downloaded.` : "JSON-LD copied.");
}
pick.addEventListener("click", () => {
	(async () => {
		const chosen = normalizeIdentifier(tenant.value, "");
		if (!chosen || chosen !== tenant.value) return message("Enter a valid lowercase tenant identifier.", true);
		const tab = await activePage();
		if (tab?.id === void 0) return message("No active page is available.", true);
		const reply = await request({
			type: "collector:start",
			tabId: tab.id,
			tenant: chosen
		});
		if (!reply.ok) return message(reply.error, true);
		window.close();
	})().catch((error) => message(error instanceof Error ? error.message : "Picker could not start.", true));
});
copy.addEventListener("click", () => void exportProfile(false).catch(() => message("JSON-LD could not be copied.", true)));
download.addEventListener("click", () => void exportProfile(true).catch(() => message("Profile could not be downloaded.", true)));
clear.addEventListener("click", () => {
	if (!confirm("Clear every collected slot?")) return;
	request({ type: "collector:clear" }).then((reply) => {
		if (reply.ok && reply.state) {
			render(reply.state);
			message("Catalog cleared.");
		} else message(reply.ok ? "Catalog was not cleared." : reply.error, true);
	});
});
Promise.all([request({ type: "collector:get" }), activePage()]).then(([reply, active]) => {
	if (!reply.ok || !reply.state) return message(reply.ok ? "Catalog could not be loaded." : reply.error, true);
	if (reply.state.tenant === "tenant" && active?.url) try {
		render({
			...reply.state,
			tenant: defaultTenant(new URL(active.url).hostname)
		});
	} catch {
		render(reply.state);
	}
	else render(reply.state);
}).catch(() => message("Catalog could not be loaded.", true));
//#endregion

//# sourceMappingURL=popup-CSYLGnw5.js.map