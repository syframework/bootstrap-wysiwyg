/**
 * CKEditor plugin wiring, tested against the real plugin sources with a small
 * fake `CKEDITOR` (no widget engine): what matters here is which widget each
 * plugin claims, which labels it resolves, and what its dialog commits.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import sycomponentSource from '../../assets/js/plugins/sycomponent.js?raw';
import sytranslateSource from '../../assets/js/plugins/sytranslate.js?raw';
import enSource from '../../assets/js/plugins/lang/en.js?raw';
import frSource from '../../assets/js/plugins/lang/fr.js?raw';

/**
 * Evaluate plugin sources and collect what they register.
 */
function boot(sources) {
	const plugins = {};
	const dialogs = {};
	const langs = {};

	window.CKEDITOR = {
		plugins: {
			add(name, definition) {
				plugins[name] = definition;
			},
			get(name) {
				return plugins[name] ? {path: '/assets/js/plugins'} : null;
			},
			setLang(name, lang, labels) {
				langs[name] = langs[name] || {};
				langs[name][lang] = labels;
			},
		},
		dialog: {
			add(name, factory) {
				dialogs[name] = factory;
			},
		},
		addCss() {},
	};

	sources.forEach((source) => window.eval(source));
	return {plugins, dialogs, langs};
}

/** Minimal editor: only the surface the two plugins touch. */
function fakeEditor(overrides = {}) {
	const editor = {
		config: {},
		lang: {},
		commands: {},
		buttons: {},
		inserted: [],
		events: {},
		widgets: {
			definitions: {},
			instances: {},
			add(name, definition) {
				this.definitions[name] = definition;
			},
			on(name, callback) {
				editor.events[name] = callback;
			},
			checkWidgets() {
				editor.checked = (editor.checked || 0) + 1;
			},
		},
		ui: {
			addButton(name, definition) {
				editor.buttons[name] = definition;
			},
		},
		addCommand(name, command) {
			editor.commands[name] = command;
		},
		on(name, callback) {
			editor.events['editor:' + name] = callback;
		},
		insertHtml(html) {
			editor.inserted.push(html);
		},
		openDialog(name) {
			editor.opened = name;
		},
		attachListener() {},
		editable() {
			return null;
		},
	};

	return Object.assign(editor, overrides, {
		config: Object.assign({}, editor.config, overrides.config || {}),
	});
}

function widgetElement(attributes, text) {
	return {
		$: {textContent: text, innerHTML: text},
		getAttribute: (name) => (name in attributes ? attributes[name] : null),
	};
}

beforeEach(() => {
	vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ok: true, json: () => Promise.resolve({})})));
});

afterEach(() => {
	vi.unstubAllGlobals();
	delete window.CKEDITOR;
});

describe('sycomponent — widget masking', () => {
	it('never masks a widget that is not a component', () => {
		const {plugins} = boot([sycomponentSource]);
		const editor = fakeEditor({
			lang: {sycomponent: {componentFallback: 'Component', saveToRender: '(save to render)'}},
		});

		plugins.sycomponent.init(editor);

		const element = widgetElement({}, 'Bonjour');
		editor.events.instanceCreated({data: {name: 'sytranslate', element}});

		expect(element.$.textContent).toBe('Bonjour');
	});

	it('still masks a component without a rendered snapshot', () => {
		const {plugins} = boot([sycomponentSource]);
		const editor = fakeEditor({
			lang: {sycomponent: {componentFallback: 'Component', saveToRender: '(save to render)'}},
		});

		plugins.sycomponent.init(editor);

		const element = widgetElement({'data-sycomponent': 'MAP'}, '<div class="map"></div>');
		editor.events.instanceCreated({data: {name: 'sycomponent', element}});

		expect(element.$.textContent).toContain('(save to render)');
		// The source slot is kept for the downcast, so the save is not lossy.
		expect(editor.config.syComponentSlots).toBeTruthy();
	});
});

describe('sytranslate — labels', () => {
	it('declares its language pack', () => {
		const {plugins} = boot([sytranslateSource]);

		expect(plugins.sytranslate.lang).toBe('en,fr');
	});

	it('falls back to the CKEditor language pack', () => {
		const {plugins, langs} = boot([enSource, frSource, sytranslateSource]);
		const editor = fakeEditor({lang: {sytranslate: langs.sytranslate.fr}});

		plugins.sytranslate.init(editor);

		expect(editor.buttons.Sytranslate.label).toBe('Insérer un slot de traduction');
	});

	it('lets the consumer labels win over the pack', () => {
		const {plugins, langs} = boot([enSource, frSource, sytranslateSource]);
		const editor = fakeEditor({
			lang: {sytranslate: langs.sytranslate.fr},
			config: {translateLabels: {add: 'Ajouter une traduction'}},
		});

		plugins.sytranslate.init(editor);

		expect(editor.buttons.Sytranslate.label).toBe('Ajouter une traduction');
	});
});

describe('sytranslate — insertion', () => {
	/** Dialog instance as CKEditor calls it: `onOk` has no widget binding. */
	const dialogSelf = () => ({
		getValueOf: (page, id) => ({key: 'bonjour', value: 'Hello'}[id]),
	});

	it('exposes a command behind the toolbar button', () => {
		const {plugins} = boot([sytranslateSource]);
		const editor = fakeEditor();

		plugins.sytranslate.init(editor);
		editor.commands.sytranslate.exec();

		// The command must clear a previous binding, otherwise a click after an
		// edit would reuse the old widget.
		expect(editor._sytranslateWidget).toBeNull();
		expect(editor.opened).toBe('sytranslate');
	});

	it('inserts the source slot and posts the key/value', () => {
		const {plugins, dialogs} = boot([sytranslateSource]);
		const editor = fakeEditor({
			config: {translateUrl: '/api/content-translation', translateLang: 'fr'},
		});

		plugins.sytranslate.init(editor);
		const dialog = dialogs.sytranslate(editor);
		dialog.onOk.call(dialogSelf());

		// The saved source keeps the placeholder: the value stays server-side.
		expect(editor.inserted).toEqual(['{"bonjour"}']);
		expect(editor.checked).toBe(1);

		const [url, options] = fetch.mock.calls[0];
		expect(url).toBe('/api/content-translation');
		expect(options.body).toContain('key=bonjour');
		expect(options.body).toContain('value=Hello');
		expect(options.body).toContain('lang=fr');
	});

	it('does not insert when the dialog edits an existing widget', () => {
		const {plugins, dialogs} = boot([sytranslateSource]);
		const editor = fakeEditor({config: {translateUrl: '/api/content-translation'}});

		plugins.sytranslate.init(editor);
		const dialog = dialogs.sytranslate(editor);

		// CKEditor calls the field `setup` only for a bound widget.
		const keyField = dialog.contents[0].elements[0];
		keyField.setup.call({setValue() {}}, {data: {name: 'bonjour'}});
		expect(editor._sytranslateWidget).toEqual({data: {name: 'bonjour'}});

		dialog.onOk.call(dialogSelf());

		expect(editor.inserted).toEqual([]);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('strips the placeholder delimiters from the key', () => {
		const {plugins, dialogs} = boot([sytranslateSource]);
		const editor = fakeEditor({config: {translateUrl: '/api/content-translation'}});

		plugins.sytranslate.init(editor);
		dialogs.sytranslate(editor).onOk.call({
			getValueOf: (page, id) => ({key: '{"a}b"}', value: 'v'}[id]),
		});

		expect(editor.inserted).toEqual(['{"ab"}']);
	});

	it('does not call the endpoint without a translate url', () => {
		const {plugins, dialogs} = boot([sytranslateSource]);
		const editor = fakeEditor();

		plugins.sytranslate.init(editor);
		dialogs.sytranslate(editor).onOk.call(dialogSelf());

		expect(fetch).not.toHaveBeenCalled();
		// The slot is still inserted: the value is resolved server-side.
		expect(editor.inserted).toEqual(['{"bonjour"}']);
	});
});
