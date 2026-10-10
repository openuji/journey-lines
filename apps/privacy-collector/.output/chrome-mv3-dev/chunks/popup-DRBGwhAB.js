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
//#region ../../node_modules/.pnpm/wxt@0.21.4_esbuild@0.24.2_eslint@9.39.4_jiti@2.7.0_supports-color@7.2.0__oxc-parser@0.1_90400069a6f1a4341ccdbd4b2ab46b3d/node_modules/wxt/dist/virtual/reload-html.mjs
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
try {
	getDevServerWebSocket().addWxtEventListener("wxt:reload-page", (event) => {
		if (event.detail === location.pathname.substring(1)) location.reload();
	});
} catch (err) {
	logger.error("Failed to setup web socket connection with dev server", err);
}
//#endregion

//# sourceMappingURL=popup-DRBGwhAB.js.map