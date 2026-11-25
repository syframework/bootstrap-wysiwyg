/**
 * SyWysiwyg — shared CKEditor 4 engine.
 *
 * One IIFE, one global (`SyWysiwyg`), one public entry point: `create()`.
 *
 * The engine owns the editing lifecycle — start, save, stop, destroy — and
 * nothing else. It knows no application: no service container, no route, no
 * upload directory, no content table. Everything it needs arrives through the
 * options rendered by `Sy\Bootstrap\Wysiwyg\Editor` (see src/Lib/Config.php),
 * and everything a consumer needs to react to leaves through `wysiwyg:*`
 * events on the local document.
 *
 * Contract highlights (PLAN-v3.5 §2, D5, D6, D12, D17, D23):
 *   - `lastSaved` is always an object `{content: string}` or null, never a
 *     bare string: `stop()` must never assign `undefined` to the DOM.
 *   - `wysiwyg:ready` fires after `instanceReady` and before `wysiwyg:start`;
 *     it is the only extension point for CKEditor customization.
 *   - the POST body is `content`, `csrf`, then `save-data`. The engine adds no
 *     fixed `id`: business identity belongs to `save-data`.
 *   - one global `beforeunload` listener serves every dirty instance.
 */
(function (global) {
	'use strict';

	// Importing the file twice must not reset a live instance.
	if (global.SyWysiwyg) return;

	var VERSION = '1.0.0';

	/** CKEditor plugins delivered by this package (Lot 2 for the files). */
	var PLUGINS = ['sycomponent', 'sytranslate', 'sywidget'];

	/** A `<p>` holding only spaces, `&nbsp;` or `<br>` (D6 ter). */
	var EMPTY_BLOCKS = /<p(?:\s[^>]*)?>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/gi;

	var DEFAULTS = {
		id: '',
		mode: 'inline',
		container: true,
		editable: true,
		content: '',
		loadUrl: null,
		loadData: {},
		saveUrl: null,
		saveData: {},
		csrf: null,
		csrfUrl: null,
		csrfRefresh: 0,
		request: {
			credentials: 'same-origin',
			headers: {}
		},
		upload: {
			image: {
				browse: null,
				upload: null,
				mode: 'ajax',
				window: {width: 400, height: 400}
			},
			file: {
				browse: null,
				upload: null,
				mode: 'ajax',
				window: {width: 400, height: 400}
			}
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
			reportOnly: false
		},
		translations: {},
		translateUrl: null,
		translateLabels: {},
		guardUnload: true,
		autosave: {
			interval: 0,
			onBlur: false,
			onDialogClose: false
		},
		assets: {
			engine: '',
			ckeditorJs: '',
			ckeditorRoot: '',
			plugins: ''
		}
	};

	/* ---------------------------------------------------------------------
	 * Small helpers
	 * ------------------------------------------------------------------ */

	function has(object, key) {
		return Object.prototype.hasOwnProperty.call(object, key);
	}

	function isPlainObject(value) {
		return value !== null && typeof value === 'object' && !Array.isArray(value);
	}

	function clone(value) {
		if (Array.isArray(value)) return value.map(clone);
		if (isPlainObject(value)) {
			var copy = {};
			for (var key in value) {
				if (has(value, key)) copy[key] = clone(value[key]);
			}
			return copy;
		}
		return value;
	}

	/**
	 * Option maps whose keys are data, not option names: they are taken as-is.
	 * Every other nested object (`upload`, `components`, `autosave`, `assets`)
	 * is a fixed structure, so unknown sub-keys are dropped.
	 */
	var FREE_FORM = {
		config: true,
		loadData: true,
		saveData: true,
		translations: true,
		translateLabels: true
	};

	/**
	 * Merge `override` onto `base`.
	 *
	 * Unknown option names are dropped: the PHP side is the contract, and a
	 * typo in a template must not reach CKEditor silently. Arrays replace
	 * (they are lists, not maps).
	 */
	function merge(base, override) {
		var result = clone(base);
		if (!isPlainObject(override)) return result;
		Object.keys(override).forEach(function (key) {
			if (!has(base, key)) return;
			var value = override[key];
			if (has(FREE_FORM, key)) {
				result[key] = clone(value);
				return;
			}
			if (key === 'request') {
				result.request = {
					credentials: isPlainObject(value) && has(value, 'credentials')
						? value.credentials
						: base.request.credentials,
					headers: isPlainObject(value) && isPlainObject(value.headers)
						? clone(value.headers)
						: clone(base.request.headers)
				};
				return;
			}
			result[key] = isPlainObject(base[key]) && isPlainObject(value)
				? merge(base[key], value)
				: clone(value);
		});
		return result;
	}

	function toList(value) {
		if (!value) return [];
		if (Array.isArray(value)) return value.slice();
		return String(value)
			.split(',')
			.map(function (name) { return name.trim(); })
			.filter(Boolean);
	}

	/** Union of two plugin lists, deduplicated, serialized as CSV (D22). */
	function csv(first, second) {
		var seen = {};
		var out = [];
		toList(first).concat(toList(second)).forEach(function (name) {
			if (!name || has(seen, name)) return;
			seen[name] = true;
			out.push(name);
		});
		return out.join(',');
	}

	function documentOf(element) {
		return (element && element.ownerDocument) || global.document;
	}

	function ckeditor() {
		if (!global.CKEDITOR) throw new Error('SyWysiwyg: CKEditor is not loaded');
		return global.CKEDITOR;
	}

	function isDtdSentinel(node) {
		if (!isPlainObject(node)) return false;
		var keys = Object.keys(node);
		return keys.length === 1 && keys[0] === '@dtd' && node['@dtd'] === true;
	}

	/**
	 * Replace `{ '@dtd': true }` with `CKEDITOR.dtd`, recursively, without
	 * mutating the option tree (the same options object is reused by
	 * `stop()`/`start()` cycles). Requires CKEditor to be loaded.
	 */
	function resolveDtd(node) {
		if (isDtdSentinel(node)) return ckeditor().dtd;
		if (Array.isArray(node)) return node.map(resolveDtd);
		if (isPlainObject(node)) {
			var copy = {};
			for (var key in node) {
				if (has(node, key)) copy[key] = resolveDtd(node[key]);
			}
			return copy;
		}
		return node;
	}

	/**
	 * Add a `json` flag to an upload URL, keeping a relative URL relative: the
	 * `CkFile` backend only tests `isset($_GET['json'])`.
	 */
	function withFlag(url, flag) {
		if (!url) return url;
		var absolute = /^[a-z][a-z0-9+.-]*:/i.test(url);
		var target = new URL(url, global.location ? global.location.origin : 'http://localhost');
		if (!target.searchParams.has(flag)) target.searchParams.set(flag, '');
		if (absolute || url.charAt(0) !== '/') return target.href;
		return target.pathname + target.search + target.hash;
	}

	function withParams(url, params) {
		if (!params) return url;
		var target = new URL(url, global.location ? global.location.origin : 'http://localhost');
		Object.keys(params).forEach(function (key) {
			if (params[key] === null || params[key] === undefined) return;
			target.searchParams.set(key, String(params[key]));
		});
		return target.href;
	}

	function toQuery(data) {
		var params = new URLSearchParams();
		Object.keys(data || {}).forEach(function (key) {
			var value = data[key];
			if (value === null || value === undefined) return;
			params.append(key, String(value));
		});
		return params.toString();
	}

	/** Messages come from the API as HTML; alerts must show their text. */
	function stripTags(html) {
		if (typeof html !== 'string') return '';
		if (typeof global.DOMParser !== 'function') return html;
		return new global.DOMParser().parseFromString(html, 'text/html').documentElement.textContent || '';
	}

	function messageOf(data) {
		if (!data) return '';
		var message = data.message;
		if (typeof message === 'string') return stripTags(message);
		if (isPlainObject(message)) return stripTags(message.body || message.title || '');
		return '';
	}

	/* ---------------------------------------------------------------------
	 * Options and CKEditor configuration (§2.2, D4, D7, D19 bis, D22)
	 * ------------------------------------------------------------------ */

	function resolveOptions(raw) {
		var options = merge(DEFAULTS, raw);
		// `container`/`editable` are PHP-side decisions; the engine only reads
		// them for diagnostics, so no coercion is needed here.
		options.templatesFiles = toList(options.templatesFiles);
		options.extraPlugins = toList(options.extraPlugins);
		options.removePlugins = toList(options.removePlugins);
		options.preserveEmpty = toList(options.preserveEmpty);
		options.components.allowlist = toList(options.components.allowlist);
		return options;
	}

	/**
	 * Pure CKEditor configuration builder: no DOM, no fetch, no side effect on
	 * `CKEDITOR.dtd` (that one is applied by `start()`, D19 bis).
	 *
	 * `config` is the base and is never overwritten: the consumer keeps
	 * `toolbar`, `stylesSet`, `sharedSpaces`, `language` and friends.
	 */
	function buildConfig(options) {
		var config = clone(options.config || {});

		// 1. allowedContent: an explicit config key always wins (D4).
		if (config.allowedContent === undefined && options.allowedContent !== null) {
			config.allowedContent = resolveDtd(clone(options.allowedContent));
		}

		// 2. plugins: union, never a replacement (D22).
		var extra = csv(config.extraPlugins, options.extraPlugins);
		if (extra) config.extraPlugins = extra;
		var removed = csv(config.removePlugins, options.removePlugins);
		if (removed) config.removePlugins = removed;

		// 3. templates: only when the consumer did not set them.
		if (!config.templates && options.templates) {
			config.templates = options.templates;
		}
		if (!config.templates_files && options.templatesFiles.length > 0) {
			config.templates_files = options.templatesFiles.slice();
			if (!config.templates) config.templates = 'default';
		}

		// 4. uploads: map every documented CKEditor key, `json` in ajax mode.
		var uploads = [
			{type: 'image', url: options.upload.image.browse, keys: ['filebrowserImageBrowseUrl']},
			{type: 'image', url: options.upload.image.upload, keys: ['filebrowserImageUploadUrl', 'imageUploadUrl'], ajax: true},
			{type: 'file', url: options.upload.file.browse, keys: ['filebrowserBrowseUrl']},
			{type: 'file', url: options.upload.file.upload, keys: ['filebrowserUploadUrl', 'uploadUrl'], ajax: true}
		];
		uploads.forEach(function (upload) {
			if (!upload.url) return;
			var url = upload.ajax && options.upload[upload.type].mode === 'ajax'
				? withFlag(upload.url, 'json')
				: upload.url;
			upload.keys.forEach(function (key) {
				if (config[key] === undefined) config[key] = url;
			});
		});

		// 5. dialog dimensions: CKEditor has one pair of settings for both
		// file types, so the image window is the reference; a consumer that
		// needs another size sets `filebrowserWindow*` in `config` directly.
		if (config.filebrowserWindowWidth === undefined) {
			config.filebrowserWindowWidth = options.upload.image.window.width;
		}
		if (config.filebrowserWindowHeight === undefined) {
			config.filebrowserWindowHeight = options.upload.image.window.height;
		}

		return config;
	}

	/** D19 bis: mutate `CKEDITOR.dtd` after CKEditor loaded, before init. */
	function applyPreserveEmpty(options) {
		if (!global.CKEDITOR || !global.CKEDITOR.dtd) return;
		var removeEmpty = global.CKEDITOR.dtd.$removeEmpty;
		if (!removeEmpty) return;
		options.preserveEmpty.forEach(function (name) {
			removeEmpty[name] = false;
		});
	}

	/** D8/V17: activate `sy*` plugins, from files shipped with the engine. */
	function registerPlugins(options) {
		if (!options.components.enabled) return;
		var editor = ckeditor();
		if (!editor.plugins || typeof editor.plugins.addExternal !== 'function') return;
		PLUGINS.forEach(function (name) {
			if (options.extraPlugins.indexOf(name) === -1) return;
			editor.plugins.addExternal(name, options.assets.plugins + '/' + name + '.js');
		});
	}

	/* ---------------------------------------------------------------------
	 * Network (§2.4)
	 * ------------------------------------------------------------------ */

	function send(url, init) {
		return global.fetch(url, init).then(function (response) {
			return response.text().then(function (text) {
				var data = null;
				if (text) {
					try {
						data = JSON.parse(text);
					} catch (error) {
						data = null;
					}
				}
				return {ok: response.ok, status: response.status, data: data};
			});
		});
	}

	var net = {
		/** GET with `ts` and `load-data`, per §2.4. */
		getJson: function (url, data, request) {
			var target = withParams(url, data);
			target = withParams(target, {ts: Date.now()});
			return send(target, {
				method: 'GET',
				credentials: (request && request.credentials) || 'same-origin',
				headers: (request && request.headers) || {}
			});
		},

		/** POST form-urlencoded, per §2.4. */
		postForm: function (url, data, request) {
			var headers = {};
			var extra = (request && request.headers) || {};
			Object.keys(extra).forEach(function (key) {
				headers[key] = String(extra[key]);
			});
			headers['Content-Type'] = 'application/x-www-form-urlencoded';
			return send(url, {
				method: 'POST',
				credentials: (request && request.credentials) || 'same-origin',
				headers: headers,
				body: toQuery(data)
			});
		}
	};

	/* ---------------------------------------------------------------------
	 * Dirty registry: one global `beforeunload` (D12)
	 * ------------------------------------------------------------------ */

	var dirtyInstances = [];
	var instances = {};
	var unloadBound = false;

	function onBeforeUnload(event) {
		if (dirtyInstances.length === 0) return;
		event.preventDefault();
		// Legacy browsers need a non-empty returnValue to show the prompt.
		event.returnValue = '';
		return '';
	}

	function bindUnload() {
		if (unloadBound) return;
		unloadBound = true;
		global.addEventListener('beforeunload', onBeforeUnload);
	}

	function unbindUnload() {
		if (!unloadBound) return;
		unloadBound = false;
		global.removeEventListener('beforeunload', onBeforeUnload);
	}

	function registerDirty(instance) {
		if (dirtyInstances.indexOf(instance) === -1) dirtyInstances.push(instance);
		bindUnload();
	}

	function unregisterDirty(instance) {
		var index = dirtyInstances.indexOf(instance);
		if (index !== -1) dirtyInstances.splice(index, 1);
		if (dirtyInstances.length === 0) unbindUnload();
	}

	/* ---------------------------------------------------------------------
	 * Instance
	 * ------------------------------------------------------------------ */

	/**
	 * @param {Element|string} element Editable element, or its id
	 * @param {Object} options          JSON options produced by the PHP component
	 * @param {Object} [dependencies]   `{net}` — injectable for tests
	 * @returns {Object} public instance
	 */
	function create(element, options, dependencies) {
		var opts = resolveOptions(options || {});
		var id = opts.id;
		var deps = dependencies || {};
		var transport = deps.net || net;

		var doc = documentOf(element);
		if (typeof element === 'string') element = doc.getElementById(element);
		// `container => false` (CMS, or a consumer that renders the element
		// itself): the component could not hand over the element, so the
		// engine resolves it by id and reports a clear error when it is absent.
		if (!element && id) element = doc.getElementById(id);
		var editor = null;
		var originalHtml = null;
		var originalContentEditable = null;
		var contentEditableManaged = false;
		var lastSaved = null;
		var csrf = opts.csrf;
		var dirty = false;
		var destroyed = false;
		var pending = null;
		var timers = {autosave: null, csrf: null};
		var instance = null;

		function emit(name, detail) {
			if (!doc) return;
			var event;
			if (typeof global.CustomEvent === 'function') {
				event = new global.CustomEvent('wysiwyg:' + name, {detail: detail});
			} else {
				event = doc.createEvent('CustomEvent');
				event.initCustomEvent('wysiwyg:' + name, false, false, detail);
			}
			doc.dispatchEvent(event);
		}

		function fail(status, message, retryable, isDestroyed) {
			emit('error', {
				elementId: id,
				editor: editor,
				status: status,
				message: message,
				retryable: !!retryable,
				destroyed: !!isDestroyed
			});
		}

		function fallbackContent() {
			if (lastSaved && typeof lastSaved.content === 'string') return lastSaved.content;
			if (typeof originalHtml === 'string') return originalHtml;
			return editor ? editor.getData() : (element ? element.innerHTML : '');
		}

		/**
		 * CKEditor 4 inline expects a contenteditable host: without it the
		 * toolbar is rendered read-only (all buttons disabled). Keep the
		 * original value so stop()/destroy() can restore a read-only page.
		 */
		function enableInlineEditing() {
			if (opts.mode !== 'inline' || !element) return;
			originalContentEditable = element.getAttribute('contenteditable');
			element.setAttribute('contenteditable', 'true');
			contentEditableManaged = true;
		}

		function restoreInlineEditing() {
			if (!contentEditableManaged || !element) return;
			if (originalContentEditable === null) {
				element.removeAttribute('contenteditable');
			} else {
				element.setAttribute('contenteditable', originalContentEditable);
			}
			contentEditableManaged = false;
		}

		function restore() {
			if (!element) return;
			if (editor) {
				try {
					editor.destroy();
				} catch (error) {
					// An already destroyed instance must not break the restore.
				}
				editor = null;
			}
			element.innerHTML = fallbackContent() || '';
		}

		function resetDirty() {
			dirty = false;
			unregisterDirty(instance);
			if (editor && typeof editor.resetDirty === 'function') editor.resetDirty();
		}

		function markDirty() {
			if (!dirty) {
				dirty = true;
				if (opts.guardUnload) registerDirty(instance);
			}
			emit('change', {elementId: id, editor: editor, dirty: true});
		}

		function startTimers() {
			if (opts.autosave.interval > 0) {
				timers.autosave = global.setInterval(function () {
					if (dirty) save({silent: true});
				}, opts.autosave.interval);
			}
			if (opts.csrfUrl && opts.csrfRefresh > 0) {
				timers.csrf = global.setInterval(refreshCsrf, opts.csrfRefresh * 1000);
			}
		}

		function clearTimers() {
			if (timers.autosave) global.clearInterval(timers.autosave);
			if (timers.csrf) global.clearInterval(timers.csrf);
			timers.autosave = null;
			timers.csrf = null;
		}

		function refreshCsrf() {
			if (!opts.csrfUrl) return Promise.resolve(csrf);
			return transport.getJson(opts.csrfUrl, {}, opts.request).then(function (response) {
				if (response.data && response.data.csrf) csrf = response.data.csrf;
				return csrf;
			}).catch(function () {
				return csrf;
			});
		}

		function onInstanceReady() {
			emit('ready', {elementId: id, editor: editor});
			emit('start', {elementId: id, editor: editor, originalHtml: originalHtml});
			resetDirty();
			startTimers();
		}

		function bindEditorEvents() {
			editor.on('change', function () {
				markDirty();
			});

			if (opts.autosave.onBlur) {
				editor.on('blur', function () {
					if (dirty) save({silent: true});
				});
			}

			if (opts.autosave.onDialogClose) {
				editor.on('dialogShow', function (event) {
					var dialog = event && event.data;
					if (!dialog || typeof dialog.on !== 'function') return;
					if (typeof dialog.getName === 'function' && dialog.getName() !== 'sourcedialog') return;
					dialog.on('hide', function () {
						if (dirty) save({silent: true});
					});
				});
			}
		}

		function start() {
			if (destroyed) return Promise.resolve(instance);
			if (!element) {
				fail(0, 'SyWysiwyg: editable element "' + id + '" not found', false, false);
				return Promise.resolve(instance);
			}
			if (editor) return Promise.resolve(instance);

			originalHtml = element.innerHTML;

			var loading = opts.loadUrl
				? transport.getJson(opts.loadUrl, opts.loadData, opts.request)
				: Promise.resolve(null);

			return loading.then(function (response) {
				if (response) {
					var data = response.data || {};
					if (data.csrf) csrf = data.csrf;
					if (data.status === 'ko') {
						fail(response.status, messageOf(data), false, false);
						return instance;
					}
					var content = data.content !== undefined && data.content !== null
						? data.content
						: data.html;
					if (typeof content === 'string') element.innerHTML = content;
				}

				applyPreserveEmpty(opts);
				registerPlugins(opts);

				var config = buildConfig(opts);
				var ck = ckeditor();
				enableInlineEditing();
				editor = opts.mode === 'classic'
					? ck.replace(id, config)
					: ck.inline(id, config);

				if (!editor) {
					restoreInlineEditing();
					fail(0, 'SyWysiwyg: CKEditor returned no instance', false, false);
					return instance;
				}

				return new Promise(function (resolve) {
					var ready = false;
					var handler = function () {
						if (ready) return;
						ready = true;
						onInstanceReady();
						resolve(instance);
					};
					if (typeof editor.once === 'function') {
						editor.once('instanceReady', handler);
						// A stub or a fast instance may already be ready.
						if (editor.status === 'ready') handler();
					} else {
						editor.on('instanceReady', handler);
					}
					bindEditorEvents();
				});
			}).catch(function (error) {
				if (!editor) restoreInlineEditing();
				fail(0, (error && error.message) || 'SyWysiwyg: start failed', true, false);
				return instance;
			});
		}

		function save(saveOptions) {
			var silent = !!(saveOptions && saveOptions.silent);

			if (destroyed || !editor || !opts.saveUrl) {
				return Promise.resolve({ok: false, status: 0, data: null});
			}
			// One POST at a time: blur + interval + stop must not race.
			if (pending) return pending;

			var content = editor.getData();
			if (opts.normalizeEmptyBlocks) content = content.replace(EMPTY_BLOCKS, '');

			// `detail.content` is mutable on purpose: an adapter may rewrite the
			// payload before it is sent (D6 ter).
			var detail = {elementId: id, editor: editor, content: content};
			emit('save', detail);

			// `content` and `csrf` are reserved (§2.4, D16): the PHP side
			// rejects them in `save-data`, and the engine never lets them be
			// shadowed from JS either.
			var body = {content: detail.content, csrf: csrf};
			Object.keys(opts.saveData).forEach(function (key) {
				if (key === 'content' || key === 'csrf') return;
				body[key] = opts.saveData[key];
			});

			function post(isRetry) {
				return transport.postForm(opts.saveUrl, body, opts.request).then(function (response) {
					var data = response.data || null;

					if (data && data.csrf) csrf = data.csrf;

					if (response.ok && (!data || data.status === 'ok')) {
						if (data && data.content !== undefined && data.content !== null && data.html !== undefined) {
							// `content` wins over its `html` alias (§2.4); a
							// response sending both is a consumer bug.
							if (global.console && global.console.warn) {
								global.console.warn('SyWysiwyg: response carries both content and html, content wins');
							}
						}
						var saved = data && (data.content !== undefined && data.content !== null)
							? data.content
							: (data && data.html);
						if (typeof saved !== 'string') saved = editor.getData();
						lastSaved = {content: saved};
						resetDirty();
						emit('saved', {elementId: id, editor: editor, content: saved, csrf: csrf});
						return {ok: true, status: response.status, data: data};
					}

					// `status: "ko"` with a fresh token: exactly one replay (§2.4).
					if (data && data.status === 'ko' && data.csrf && !isRetry) {
						body.csrf = data.csrf;
						return post(true);
					}

					if (isFatal(response.status, data)) {
						fail(response.status, messageOf(data), false, true);
						restore();
						destroy();
						return {ok: false, status: response.status, data: data, retryable: false};
					}

					if (!silent) fail(response.status, messageOf(data), true, false);
					return {ok: false, status: response.status, data: data, retryable: true};
				});
			}

			pending = post(false).then(function (result) {
				pending = null;
				return result;
			}, function (error) {
				pending = null;
				if (!silent) fail(0, (error && error.message) || 'Network error', true, false);
				return {ok: false, status: 0, data: null, retryable: true};
			});

			return pending;
		}

		/** 4xx that no retry can fix; 429 and 5xx stay retryable (§2.6). */
		function isFatal(status, data) {
			if (status === 400 || status === 403 || status === 404 || status === 413) return true;
			return !!(data && data.status === 'ko' && !data.csrf);
		}

		function stop(stopOptions) {
			var shouldSave = !(stopOptions && stopOptions.save === false);
			var wasDirty = dirty || (editor && typeof editor.checkDirty === 'function' ? editor.checkDirty() : false);

			if (!wasDirty) {
				restore();
				teardownEditor();
				emit('stopped', {
					elementId: id,
					editor: null,
					saved: false,
					dirty: false,
					content: lastSaved ? lastSaved.content : null
				});
				return Promise.resolve({saved: false, dirty: false, content: lastSaved ? lastSaved.content : null});
			}

			if (!shouldSave) {
				restore();
				teardownEditor();
				emit('stopped', {
					elementId: id,
					editor: null,
					saved: false,
					dirty: true,
					content: lastSaved ? lastSaved.content : null
				});
				return Promise.resolve({saved: false, dirty: true, content: lastSaved ? lastSaved.content : null});
			}

			return save().then(function (result) {
				if (result.ok) {
					var content = lastSaved ? lastSaved.content : null;
					restore();
					teardownEditor();
					emit('stopped', {elementId: id, editor: null, saved: true, dirty: false, content: content});
					return {saved: true, dirty: false, content: content};
				}

				if (result.retryable) {
					emit('stopped', {
						elementId: id,
						editor: editor,
						saved: false,
						dirty: true,
						content: lastSaved ? lastSaved.content : null
					});
					return {saved: false, dirty: true, content: lastSaved ? lastSaved.content : null};
				}

				// Fatal: `save()` already restored and destroyed.
				emit('stopped', {
					elementId: id,
					editor: null,
					saved: false,
					dirty: false,
					content: lastSaved ? lastSaved.content : null
				});
				return {saved: false, dirty: false, content: lastSaved ? lastSaved.content : null};
			});
		}

		/**
		 * Tear down the CKEditor instance but keep the SyWysiwyg instance
		 * registered: Article calls start() again on the same page after a
		 * successful stop().
		 */
		function teardownEditor() {
			clearTimers();
			unregisterDirty(instance);
			var hadEditor = !!editor;
			if (editor) {
				try {
					editor.destroy();
				} catch (error) {
					// destroy() is idempotent by contract.
				}
				editor = null;
			}
			restoreInlineEditing();
			dirty = false;
			return hadEditor;
		}

		function destroy() {
			var hadEditor = teardownEditor();
			if (!destroyed) {
				destroyed = true;
				emit('destroyed', {elementId: id});
			}
			if (id && instances[id] === instance) delete instances[id];
			return hadEditor;
		}

		instance = {
			element: element,
			id: id,
			options: opts,
			version: VERSION,
			start: start,
			save: save,
			stop: stop,
			destroy: destroy,
			isDirty: function () { return dirty; },
			isStarted: function () { return !!editor; },
			getEditor: function () { return editor; },
			getData: function () { return editor ? editor.getData() : (element ? element.innerHTML : ''); },
			setData: function (html) {
				if (editor) editor.setData(html);
				resetDirty();
			},
			getLastSaved: function () { return lastSaved; }
		};

		if (id) instances[id] = instance;

		return instance;
	}

	global.SyWysiwyg = {
		create: create,
		get: function (id) { return instances[id] || null; },
		instances: instances,
		version: VERSION
	};
})(window);
