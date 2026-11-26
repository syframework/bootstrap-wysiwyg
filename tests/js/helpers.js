/**
 * Test helpers: load the engine as a browser script, mount an editable element,
 * and provide an injectable `net` (the engine accepts `{net}` as its third
 * argument, which is exactly what the "net est injectable" contract means).
 */

// The engine is a classic IIFE, but importing it as a module gives the same
// semantics under jsdom (it assigns `window.SyWysiwyg` on load) *and* lets
// Vitest instrument it: `?raw` + `window.eval` was invisible to coverage.
import '../../assets/js/wysiwyg.js';

/** Base options matching what `Sy\Bootstrap\Wysiwyg\Lib\Config` serializes. */
export const BASE_OPTIONS = {
	id: 'article-content',
	mode: 'inline',
	container: true,
	editable: true,
	content: '',
	loadUrl: null,
	loadData: {},
	saveUrl: null,
	saveData: {},
	csrf: 'csrf-token',
	csrfUrl: null,
	csrfRefresh: 0,
	request: {credentials: 'same-origin', headers: {}},
	upload: {
		image: {browse: null, upload: null, mode: 'ajax', window: {width: 400, height: 400}},
		file: {browse: null, upload: null, mode: 'ajax', window: {width: 400, height: 400}},
	},
	config: {},
	allowedContent: null,
	preserveEmpty: ['span', 'i'],
	normalizeEmptyBlocks: true,
	templates: null,
	templatesFiles: [],
	extraPlugins: [],
	removePlugins: [],
	components: {
		enabled: false,
		allowlist: [],
	},
	translations: {},
	translateUrl: null,
	translateLabels: {},
	guardUnload: true,
	autosave: {interval: 0, onBlur: false, onDialogClose: false},
	assets: {
		engine: '/assets/js/wysiwyg.js',
		ckeditorJs: '/assets/ckeditor/ckeditor.js',
		ckeditorRoot: '/assets/ckeditor',
		plugins: '/assets/js/plugins',
	},
};

/**
 * Execute the engine in the jsdom window, once per test file.
 *
 * `window.eval` keeps the script semantics: the file is an IIFE that assigns
 * `window.SyWysiwyg`, not an ES module.
 */
export function loadEngine() {
	return window.SyWysiwyg;
}

/** Mount an editable element and return it. */
export function mount(id = 'article-content', html = '') {
	const element = document.createElement('div');
	element.id = id;
	element.innerHTML = html;
	document.body.appendChild(element);
	return element;
}

/** Remove every element a test mounted, so ids never leak between tests. */
export function cleanup() {
	document.body.innerHTML = '';
}

/**
 * Injectable transport. `routes.get` / `routes.post` receive the recorded call
 * and return `{ok, status, data}`; omitting one yields a plain success.
 */
export function createNet(routes = {}) {
	const calls = [];

	const net = {
		calls,
		getJson(url, data, request) {
			const call = {method: 'GET', url, data, request};
			calls.push(call);
			return Promise.resolve(routes.get ? routes.get(call) : {ok: true, status: 200, data: null});
		},
		postForm(url, data, request) {
			const call = {method: 'POST', url, data, request};
			calls.push(call);
			return Promise.resolve(routes.post ? routes.post(call) : {ok: true, status: 200, data: {status: 'ok'}});
		},
	};

	return net;
}

/** Let queued promise callbacks run (CKEditor's `instanceReady` is async). */
export function flush() {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Collect `wysiwyg:*` events in order, with their details. */
export function recordEvents(names) {
	const events = [];
	const listeners = names.map((name) => {
		const listener = (event) => events.push({name, detail: event.detail});
		document.addEventListener('wysiwyg:' + name, listener);
		return {name, listener};
	});

	return {
		events,
		of(name) {
			return events.filter((event) => event.name === name);
		},
		stop() {
			listeners.forEach(({name, listener}) => document.removeEventListener('wysiwyg:' + name, listener));
		},
	};
}

/** Shorthand: create an instance with the base options merged with `overrides`. */
const created = [];

export function createInstance(element, overrides, dependencies) {
	const engine = loadEngine();
	const instance = engine.create(element, {...BASE_OPTIONS, ...overrides}, dependencies);
	created.push(instance);
	return instance;
}

/** Destroy every instance a test created, so module state starts clean. */
export function destroyAll() {
	while (created.length > 0) created.pop().destroy();
}
