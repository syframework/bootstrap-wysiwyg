/**
 * Minimal CKEditor 4 stub.
 *
 * It records what the engine asks for — the config passed to `inline()` /
 * `replace()`, the state of `dtd.$removeEmpty` at that moment, the external
 * plugins registered — and lets a test drive the editor events the real one
 * would fire (`instanceReady`, `change`, `blur`, `dialogShow`).
 */

const DTD = {
	p: 1,
	div: 1,
	span: 1,
	i: 1,
	b: 1,
	br: 1,
	img: 1,
	$removeEmpty: {span: 1, i: 1, br: 1},
};

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

/**
 * Install a fresh stub on `window` and return its inspection API.
 *
 * @returns {{calls: Array, externalPlugins: Array, instances: Object, create: Function}}
 */
export function installCkeditor() {
	const calls = [];
	const externalPlugins = [];
	const instances = {};

	function createEditor(method, id, config) {
		const element = document.getElementById(id);
		const handlers = {};
		const record = {
			method,
			id,
			config,
			// Snapshot the *installed* dtd: `applyPreserveEmpty` mutates it
			// just before the editor is created.
			removeEmptyAtInit: clone(window.CKEDITOR.dtd.$removeEmpty),
			element,
			editor: null,
		};

		const editor = {
			name: id,
			status: 'loading',
			data: element ? element.innerHTML : '',
			dirty: false,
			destroyed: false,
			config,

			on(name, handler) {
				(handlers[name] = handlers[name] || []).push(handler);
				return this;
			},

			once(name, handler) {
				const wrapper = (event) => {
					const list = handlers[name] || [];
					const index = list.indexOf(wrapper);
					if (index !== -1) list.splice(index, 1);
					handler(event);
				};
				return this.on(name, wrapper);
			},

			fire(name, event) {
				(handlers[name] || []).slice().forEach((handler) => handler(event || {name, editor}));
				// A test can simulate a user edit by firing `change`.
				if (name === 'change') this.dirty = true;
			},

			getData() {
				return this.data;
			},

			setData(html) {
				this.data = html;
			},

			checkDirty() {
				return this.dirty;
			},

			resetDirty() {
				this.dirty = false;
			},

			destroy() {
				this.destroyed = true;
				delete instances[id];
			},
		};

		record.editor = editor;
		calls.push(record);
		instances[id] = editor;

		// The real CKEditor fires `instanceReady` asynchronously, after the
		// caller had a chance to subscribe.
		Promise.resolve().then(() => {
			editor.status = 'ready';
			editor.fire('instanceReady', {editor});
		});

		return editor;
	}

	window.CKEDITOR = {
		dtd: clone(DTD),
		instances,
		plugins: {
			addExternal(name, path) {
				externalPlugins.push({name, path});
			},
		},
		inline(id, config) {
			return createEditor('inline', id, config);
		},
		replace(id, config) {
			return createEditor('replace', id, config);
		},
		__calls: calls,
		__externalPlugins: externalPlugins,
		// Restore the shared dtd between tests: `applyPreserveEmpty` mutates it.
		__reset() {
			this.dtd = clone(DTD);
			calls.length = 0;
			externalPlugins.length = 0;
			Object.keys(instances).forEach((key) => delete instances[key]);
		},
	};

	return window.CKEDITOR;
}
