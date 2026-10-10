var background = (function() {
	//#region ../../node_modules/.pnpm/wxt@0.21.4_esbuild@0.24.2_eslint@9.39.4_jiti@2.7.0_supports-color@7.2.0__oxc-parser@0.1_90400069a6f1a4341ccdbd4b2ab46b3d/node_modules/wxt/dist/utils/define-background.mjs
	function defineBackground(arg) {
		if (arg == null || typeof arg === "function") return { main: arg };
		return arg;
	}
	//#endregion
	//#region src/lib/catalog.ts
	var STORAGE_KEY = "privacy-collector-state";
	var PROFILE_CONTEXT = [
		"https://ujg.specs.openuji.org/ed/ns/context.jsonld",
		"https://ujg.specs.openuji.org/ed/ns/surface.context.jsonld",
		"https://ujg.specs.openuji.org/ed/ns/l10n.context.jsonld",
		"https://ujg.specs.openuji.org/ed/ns/observability.context.jsonld"
	];
	var EMPTY_STATE = {
		tenant: "tenant",
		slots: []
	};
	var object = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
	var identifier = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
	function normalizeIdentifier(value, fallback = "slot") {
		const normalized = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[^a-z]+/, "").replace(/[._-]+$/g, "");
		return identifier.test(normalized) ? normalized : fallback;
	}
	function parseState(value) {
		if (!object(value) || typeof value.tenant !== "string" || !identifier.test(value.tenant) || !Array.isArray(value.slots)) return EMPTY_STATE;
		const slots = value.slots.filter(isSlot);
		return slots.length === value.slots.length ? {
			tenant: value.tenant,
			slots
		} : EMPTY_STATE;
	}
	function validateSlot(value) {
		if (!isSlot(value)) throw new Error("The collected privacy slot is invalid.");
		return value;
	}
	function isSlot(value) {
		if (!object(value) || typeof value.id !== "string" || !identifier.test(value.id) || typeof value.selector !== "string" || value.selector.trim() === "" || ![
			"replace-text",
			"mask-input",
			"replace-attribute"
		].includes(value.action) || typeof value.matchCount !== "number" || !Number.isSafeInteger(value.matchCount) || value.matchCount < 1 || typeof value.tagName !== "string" || !/^[a-z][a-z0-9-]*$/.test(value.tagName) || !object(value.scope) || typeof value.scope.origin !== "string" || ![
			"exact",
			"prefix",
			"origin"
		].includes(value.scope.mode) || typeof value.scope.path !== "string" || !value.scope.path.startsWith("/")) return false;
		try {
			const url = new URL(value.scope.origin);
			if (!["http:", "https:"].includes(url.protocol) || url.origin !== value.scope.origin) return false;
		} catch {
			return false;
		}
		if (value.allowMultiple !== void 0 && typeof value.allowMultiple !== "boolean") return false;
		if (value.action === "mask-input") return value.replacement === void 0 && value.attribute === void 0 && value.text === void 0;
		if (typeof value.replacement !== "string") return false;
		if (value.action === "replace-attribute") return [
			"aria-label",
			"title",
			"alt",
			"placeholder"
		].includes(value.attribute) && value.text === void 0;
		return value.attribute === void 0 && object(value.text) && (value.text.kind === "leaf" || value.text.kind === "direct-text" && Number.isSafeInteger(value.text.childNodeIndex) && value.text.childNodeIndex >= 0);
	}
	function hash(value) {
		let result = 2166136261;
		for (let index = 0; index < value.length; index++) {
			result ^= value.charCodeAt(index);
			result = Math.imul(result, 16777619);
		}
		return (result >>> 0).toString(36);
	}
	function buildProfileDocument(stateValue) {
		const state = parseState(stateValue);
		if (state.slots.length === 0) throw new Error("Collect at least one privacy slot before exporting.");
		const scopes = /* @__PURE__ */ new Map();
		const rules = [];
		const nodes = [];
		for (const slot of state.slots) {
			const key = `${slot.scope.origin}|${slot.scope.mode}|${slot.scope.path}`;
			let scope = scopes.get(key);
			if (!scope) {
				const path = slot.scope.mode === "exact" ? { exact: slot.scope.path } : { prefix: slot.scope.mode === "origin" ? "/" : slot.scope.path };
				scope = {
					id: `scope-${hash(key)}`,
					origin: slot.scope.origin,
					path
				};
				scopes.set(key, scope);
			}
			const locatorRef = `urn:privacy:${state.tenant}:${slot.id}`;
			nodes.push({
				"@id": locatorRef,
				"@type": "CustomLocator",
				extensions: { "org.openuji.privacy.css": { selector: slot.selector } }
			});
			const rule = {
				id: `${state.tenant}.${slot.id}`,
				scopeRefs: [scope.id],
				locatorRef,
				...slot.allowMultiple ? { allowMultiple: true } : {},
				action: slot.action
			};
			if (slot.action === "replace-text") Object.assign(rule, {
				replacement: slot.replacement,
				text: slot.text
			});
			if (slot.action === "replace-attribute") Object.assign(rule, {
				replacement: slot.replacement,
				attribute: slot.attribute
			});
			rules.push(rule);
		}
		return {
			"@context": [...PROFILE_CONTEXT],
			"@id": `urn:privacy:${state.tenant}:profiles`,
			"@type": "UJGDocument",
			extensions: { "org.openuji.privacy": {
				id: state.tenant,
				version: "0.1.0-collected",
				scopes: [...scopes.values()],
				rules,
				metadata: []
			} },
			nodes
		};
	}
	//#endregion
	//#region src/entrypoints/background.ts
	async function loadState() {
		return parseState((await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY]);
	}
	async function saveState(state) {
		await chrome.storage.local.set({ [STORAGE_KEY]: state });
	}
	function tenant(value) {
		if (typeof value !== "string" || normalizeIdentifier(value, "") !== value) throw new Error("Tenant must start with a letter and use lowercase letters, numbers, dots, dashes, or underscores.");
		return value;
	}
	function assertPageScope(slot, sender) {
		const sourceValue = sender.url ?? sender.tab?.url;
		if (!sourceValue) throw new Error("The selected page could not be identified.");
		const source = new URL(sourceValue);
		if (source.origin !== slot.scope.origin) throw new Error("The collected scope does not match the selected page.");
		if (slot.scope.mode === "exact" && source.pathname !== slot.scope.path) throw new Error("The exact scope does not match the selected page path.");
		if (slot.scope.mode === "prefix" && source.pathname !== slot.scope.path && !source.pathname.startsWith(slot.scope.path.endsWith("/") ? slot.scope.path : `${slot.scope.path}/`)) throw new Error("The prefix scope does not contain the selected page path.");
	}
	async function handle(message, sender) {
		switch (message.type) {
			case "collector:get": return {
				ok: true,
				state: await loadState()
			};
			case "collector:start": {
				const selectedTenant = tenant(message.tenant);
				if (!Number.isSafeInteger(message.tabId)) throw new Error("No active web page is available.");
				await saveState({
					...await loadState(),
					tenant: selectedTenant
				});
				try {
					await chrome.scripting.executeScript({
						target: { tabId: message.tabId },
						files: ["picker.js"]
					});
				} catch {
					throw new Error("This page does not allow selector collection. Open an http or https page and try again.");
				}
				return { ok: true };
			}
			case "collector:save": {
				const selectedTenant = tenant(message.tenant);
				const slot = validateSlot(message.slot);
				assertPageScope(slot, sender);
				const next = {
					tenant: selectedTenant,
					slots: [...(await loadState()).slots.filter((candidate) => candidate.id !== slot.id), slot]
				};
				await saveState(next);
				return {
					ok: true,
					state: next
				};
			}
			case "collector:delete": {
				const state = await loadState();
				const next = {
					...state,
					slots: state.slots.filter((slot) => slot.id !== message.id)
				};
				await saveState(next);
				return {
					ok: true,
					state: next
				};
			}
			case "collector:clear": {
				const next = {
					tenant: (await loadState()).tenant,
					slots: []
				};
				await saveState(next);
				return {
					ok: true,
					state: next
				};
			}
			case "collector:export": {
				const state = await loadState();
				const json = `${JSON.stringify(buildProfileDocument(state), null, 2)}\n`;
				if (message.download) await chrome.downloads.download({
					url: `data:application/ld+json;charset=utf-8,${encodeURIComponent(json)}`,
					filename: `${state.tenant}/profiles.jsonld`,
					saveAs: false
				});
				return {
					ok: true,
					json
				};
			}
		}
	}
	var background_default = defineBackground(() => {
		chrome.runtime.onInstalled.addListener(() => {
			chrome.storage.local.get(STORAGE_KEY).then((stored) => {
				if (stored["privacy-collector-state"] === void 0) return saveState(EMPTY_STATE);
			});
		});
		chrome.runtime.onMessage.addListener((value, sender, sendResponse) => {
			handle(value, sender).then(sendResponse, (error) => sendResponse({
				ok: false,
				error: error instanceof Error ? error.message : "Privacy collector failed."
			}));
			return true;
		});
	});
	globalThis.browser?.runtime?.id ? globalThis.browser : globalThis.chrome;
	//#endregion
	//#region \0virtual:wxt-background-entrypoint?/Users/zavalit/Projects/fu-uxr/chromium-watch-privacy-stage1/apps/privacy-collector/src/entrypoints/background.ts
	/** Wrapper around `console` with a "[wxt]" prefix */
	var logger = {
		debug: (...args) => ([...args], void 0),
		log: (...args) => ([...args], void 0),
		warn: (...args) => ([...args], void 0),
		error: (...args) => ([...args], void 0)
	};
	var result;
	try {
		result = background_default.main();
		if (result instanceof Promise) console.warn("The background's main() function return a promise, but it must be synchronous");
	} catch (err) {
		logger.error("The background crashed on startup!");
		throw err;
	}
	//#endregion
	return result;
})();

//# sourceMappingURL=background.js.map