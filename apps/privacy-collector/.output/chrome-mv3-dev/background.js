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
	//#endregion
	//#region ../../node_modules/.pnpm/wxt@0.21.4_esbuild@0.24.2_eslint@9.39.4_jiti@2.7.0_supports-color@7.2.0__oxc-parser@0.1_90400069a6f1a4341ccdbd4b2ab46b3d/node_modules/wxt/dist/browser.mjs
	/**
	* Contains the `browser` export which you should use to access the extension
	* APIs in your project:
	*
	* ```ts
	* import { browser } from 'wxt/browser';
	*
	* browser.runtime.onInstalled.addListener(() => {
	*   // ...
	* });
	* ```
	*
	* @module wxt/browser
	*/
	var browser = globalThis.browser?.runtime?.id ? globalThis.browser : globalThis.chrome;
	//#endregion
	//#region ../../node_modules/.pnpm/@webext-core+match-patterns@2.0.0/node_modules/@webext-core/match-patterns/dist/index.mjs
	/**
	* Class for parsing and performing operations on match patterns.
	*
	* @example
	*   const pattern = new MatchPattern('*://google.com/*');
	*
	*   pattern.includes('https://google.com'); // true
	*   pattern.includes('http://youtube.com/watch?v=123'); // false
	*/
	var MatchPattern = class MatchPattern {
		static {
			this.PROTOCOLS = [
				"http",
				"https",
				"file",
				"ftp",
				"urn",
				"ws",
				"wss"
			];
		}
		/**
		* Parse a match pattern string. If it is invalid, the constructor will throw an
		* `InvalidMatchPattern` error.
		*
		* @param matchPattern The match pattern to parse.
		*/
		constructor(matchPattern) {
			if (matchPattern === "<all_urls>") {
				this.isAllUrls = true;
				this.protocolMatches = [...MatchPattern.PROTOCOLS];
				this.hostnameMatch = "*";
				this.pathnameMatch = "*";
			} else {
				const groups = /(.*):\/\/(.*?)(\/.*)/.exec(matchPattern);
				if (groups == null) throw new InvalidMatchPattern(matchPattern, "Incorrect format");
				const [_, protocol, hostname, pathname] = groups;
				validateProtocol(matchPattern, protocol);
				validateHostname(matchPattern, hostname);
				this.protocolMatches = protocol === "*" ? ["http", "https"] : [protocol];
				this.hostnameMatch = hostname;
				this.pathnameMatch = pathname;
			}
		}
		/** Check if a URL is included in a pattern. */
		includes(url) {
			const u = typeof url === "string" ? new URL(url) : url instanceof Location ? new URL(url.href) : url;
			if (this.isAllUrls) return !this.isUnknownProtocol(u);
			return !!this.protocolMatches.find((protocol) => {
				if (protocol === "http") return this.isHttpMatch(u);
				if (protocol === "https") return this.isHttpsMatch(u);
				if (protocol === "file") return this.isFileMatch(u);
				if (protocol === "ftp") return this.isFtpMatch(u);
				if (protocol === "urn") return this.isUrnMatch(u);
			});
		}
		isHttpMatch(url) {
			return url.protocol === "http:" && this.isHostPathMatch(url);
		}
		isHttpsMatch(url) {
			return url.protocol === "https:" && this.isHostPathMatch(url);
		}
		isHostPathMatch(url) {
			if (!this.hostnameMatch || !this.pathnameMatch) return false;
			const hostnameMatchRegexs = [this.convertPatternToRegex(this.hostnameMatch), this.convertPatternToRegex(this.hostnameMatch.replace(/^\*\./, ""))];
			const pathnameMatchRegex = this.convertPatternToRegex(this.pathnameMatch);
			return !!hostnameMatchRegexs.find((regex) => regex.test(url.hostname)) && pathnameMatchRegex.test(url.pathname);
		}
		isUnknownProtocol(url) {
			return !this.protocolMatches.includes(url.protocol.slice(0, -1));
		}
		isPathMatch(url) {
			if (!this.pathnameMatch) return false;
			return this.convertPatternToRegex(this.pathnameMatch).test(url.pathname);
		}
		isFileMatch(url) {
			return url.protocol === "file:" && this.isPathMatch(url);
		}
		isFtpMatch(_url) {
			throw Error("Not implemented: ftp:// pattern matching. Open a PR to add support");
		}
		isUrnMatch(_url) {
			throw Error("Not implemented: urn:// pattern matching. Open a PR to add support");
		}
		convertPatternToRegex(pattern) {
			const starsReplaced = this.escapeForRegex(pattern).replace(/\\\*/g, ".*");
			return RegExp(`^${starsReplaced}$`);
		}
		escapeForRegex(string) {
			return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		}
	};
	var InvalidMatchPattern = class extends Error {
		constructor(matchPattern, reason) {
			super(`Invalid match pattern "${matchPattern}": ${reason}`);
		}
	};
	function validateProtocol(matchPattern, protocol) {
		if (!MatchPattern.PROTOCOLS.includes(protocol) && protocol !== "*") throw new InvalidMatchPattern(matchPattern, `${protocol} not a valid protocol (${MatchPattern.PROTOCOLS.join(", ")})`);
	}
	function validateHostname(matchPattern, hostname) {
		if (hostname.includes(":")) throw new InvalidMatchPattern(matchPattern, `Hostname cannot include a port`);
		if (hostname.includes("*") && hostname.length > 1 && !hostname.startsWith("*.")) throw new InvalidMatchPattern(matchPattern, `If using a wildcard (*), it must go at the start of the hostname`);
	}
	//#endregion
	//#region \0virtual:wxt-background-entrypoint?/Users/zavalit/Projects/fu-uxr/chromium-watch-privacy-stage1/apps/privacy-collector/src/entrypoints/background.ts
	function print(method, ...args) {
		if (typeof args[0] === "string") method(`[wxt] ${args.shift()}`, ...args);
		else method("[wxt]", ...args);
	}
	/** Wrapper around `console` with a "[wxt]" prefix */
	var logger = {
		debug: (...args) => print(console.debug, ...args),
		log: (...args) => print(console.log, ...args),
		warn: (...args) => print(console.warn, ...args),
		error: (...args) => print(console.error, ...args)
	};
	var ws;
	/** Connect to the websocket and listen for messages. */
	function getDevServerWebSocket() {
		if (ws == null) {
			const serverUrl = "ws://localhost:3002";
			logger.debug("Connecting to dev server @", serverUrl);
			ws = new WebSocket(serverUrl, "vite-hmr");
			ws.addWxtEventListener = ws.addEventListener.bind(ws);
			ws.sendCustom = (event, payload) => ws?.send(JSON.stringify({
				type: "custom",
				event,
				payload
			}));
			ws.addEventListener("open", () => {
				logger.debug("Connected to dev server");
			});
			ws.addEventListener("close", () => {
				logger.debug("Disconnected from dev server");
			});
			ws.addEventListener("error", (event) => {
				logger.error("Failed to connect to dev server", event);
			});
			ws.addEventListener("message", (e) => {
				try {
					const message = JSON.parse(e.data);
					if (message.type === "custom") ws?.dispatchEvent(new CustomEvent(message.event, { detail: message.data }));
				} catch (err) {
					logger.error("Failed to handle message", err);
				}
			});
		}
		return ws;
	}
	/** https://developer.chrome.com/blog/longer-esw-lifetimes/ */
	function keepServiceWorkerAlive() {
		setInterval(async () => {
			await browser.runtime.getPlatformInfo();
		}, 5e3);
	}
	function reloadContentScript(payload) {
		if (browser.runtime.getManifest().manifest_version == 2) reloadContentScriptMv2(payload);
		else reloadContentScriptMv3(payload);
	}
	async function reloadContentScriptMv3({ registration, contentScript }) {
		if (registration === "runtime") await reloadRuntimeContentScriptMv3(contentScript);
		else await reloadManifestContentScriptMv3(contentScript);
	}
	async function reloadManifestContentScriptMv3(contentScript) {
		const id = `wxt:${contentScript.js[0]}`;
		logger.log("Reloading content script:", contentScript);
		const registered = await browser.scripting.getRegisteredContentScripts();
		logger.debug("Existing scripts:", registered);
		const existing = registered.find((cs) => cs.id === id);
		if (existing) {
			logger.debug("Updating content script", existing);
			await browser.scripting.updateContentScripts([{
				...contentScript,
				id,
				css: contentScript.css ?? []
			}]);
		} else {
			logger.debug("Registering new content script...");
			await browser.scripting.registerContentScripts([{
				...contentScript,
				id,
				css: contentScript.css ?? []
			}]);
		}
		await reloadTabsForContentScript(contentScript);
	}
	async function reloadRuntimeContentScriptMv3(contentScript) {
		logger.log("Reloading content script:", contentScript);
		const registered = await browser.scripting.getRegisteredContentScripts();
		logger.debug("Existing scripts:", registered);
		const matches = registered.filter((cs) => {
			const hasJs = contentScript.js?.find((js) => cs.js?.includes(js));
			const hasCss = contentScript.css?.find((css) => cs.css?.includes(css));
			return hasJs || hasCss;
		});
		if (matches.length === 0) {
			logger.log("Content script is not registered yet, nothing to reload", contentScript);
			return;
		}
		await browser.scripting.updateContentScripts(matches);
		await reloadTabsForContentScript(contentScript);
	}
	async function reloadTabsForContentScript(contentScript) {
		const allTabs = await browser.tabs.query({});
		const matchPatterns = contentScript.matches.map((match) => new MatchPattern(match));
		const matchingTabs = allTabs.filter((tab) => {
			const url = tab.url;
			if (!url) return false;
			return !!matchPatterns.find((pattern) => pattern.includes(url));
		});
		await Promise.all(matchingTabs.map(async (tab) => {
			try {
				await browser.tabs.reload(tab.id);
			} catch (err) {
				logger.warn("Failed to reload tab:", err);
			}
		}));
	}
	async function reloadContentScriptMv2(_payload) {
		throw Error("TODO: reloadContentScriptMv2");
	}
	try {
		const ws = getDevServerWebSocket();
		ws.addWxtEventListener("wxt:reload-extension", () => {
			browser.runtime.reload();
		});
		ws.addWxtEventListener("wxt:reload-content-script", (event) => {
			reloadContentScript(event.detail);
		});
		ws.addEventListener("open", () => ws.sendCustom("wxt:background-initialized"));
		keepServiceWorkerAlive();
	} catch (err) {
		logger.error("Failed to setup web socket connection with dev server", err);
	}
	browser.commands.onCommand.addListener((command) => {
		if (command === "wxt:reload-extension") browser.runtime.reload();
	});
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