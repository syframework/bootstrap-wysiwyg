/**
 * Components and CKEditor wiring: plugin registration (D8), `preserve-empty`
 * ordering (D19 bis), `mode: classic` (C6) and the `wysiwyg:ready` payload.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {installCkeditor} from './stubs/ckeditor.js';
import {cleanup, createInstance, createNet, destroyAll, flush, mount, recordEvents} from './helpers.js';

beforeEach(() => {
	cleanup();
	installCkeditor();
});

afterEach(() => {
	destroyAll();
});

async function startWith(overrides, element = mount()) {
	const instance = createInstance(element, overrides, {net: createNet({})});
	await instance.start();
	await flush();
	return {instance, element};
}

describe('registerPlugins', () => {
	it('registers only the enabled sy* plugins, from assets.plugins', async () => {
		await startWith({
			components: {enabled: true, allowlist: ['MAP'], reportOnly: false},
			extraPlugins: ['sycomponent', 'sytranslate', 'tableresize'],
			assets: {
				engine: '/assets/js/wysiwyg.js',
				ckeditorJs: '/assets/ckeditor/ckeditor.js',
				ckeditorRoot: '/assets/ckeditor',
				plugins: '/assets/js/plugins',
			},
		});

		expect(window.CKEDITOR.__externalPlugins).toEqual([
			{name: 'sycomponent', path: '/assets/js/plugins/sycomponent.js'},
			{name: 'sytranslate', path: '/assets/js/plugins/sytranslate.js'},
		]);
	});

	it('registers sytranslate and sywidget without the component feature', async () => {
		await startWith({
			components: {enabled: false, allowlist: []},
			extraPlugins: ['sytranslate', 'sywidget'],
		});

		expect(window.CKEDITOR.__externalPlugins).toEqual([
			{name: 'sytranslate', path: '/assets/js/plugins/sytranslate.js'},
			{name: 'sywidget', path: '/assets/js/plugins/sywidget.js'},
		]);
	});

	it('registers nothing when extraPlugins is empty', async () => {
		await startWith({
			components: {enabled: false, allowlist: []},
			extraPlugins: [],
		});

		expect(window.CKEDITOR.__externalPlugins).toEqual([]);
	});

	it('registers nothing without an assets directory', async () => {
		await startWith({
			extraPlugins: ['sytranslate'],
			assets: {plugins: ''},
		});

		expect(window.CKEDITOR.__externalPlugins).toEqual([]);
	});
});

describe('components', () => {
	it('accepts rendered components from an adapter before start', async () => {
		const element = mount('sy-content', '<div data-sycomponent="A">{SLOT}</div>');
		const instance = createInstance(element, {}, {net: createNet({})});
		instance.setRenderedComponents({A: '<strong>rendered</strong>'});

		await instance.start();
		await flush();

		expect(instance.getEditor().config.syRenderedComponents).toEqual({
			A: '<strong>rendered</strong>',
		});
	});

	it('captures rendered components and stores their source slots', async () => {
		const element = mount(
			'article-content',
			'<div data-sycomponent="A" data-sycomponent-args="{}"><span>rendered</span></div>'
		);
		const net = createNet({
			get: () => ({
				ok: true,
				status: 200,
				data: {
					status: 'ok',
					content: '<div data-sycomponent="A" data-sycomponent-args="{}">{SLOT}</div>',
				},
			}),
		});
		const instance = createInstance(element, {
			loadUrl: '/api/article',
			components: {enabled: true, allowlist: ['A'], reportOnly: false},
			extraPlugins: ['sycomponent'],
			assets: {
				engine: '/assets/js/wysiwyg.js',
				ckeditorJs: '/assets/ckeditor/ckeditor.js',
				ckeditorRoot: '/assets/ckeditor',
				plugins: '/assets/js/plugins',
			},
		}, {net});

		await instance.start();
		await flush();

		expect(element.innerHTML).toContain('{SLOT}');
		expect(window.CKEDITOR.__calls[0].config.components).toEqual({enabled: true, allowlist: ['A'], reportOnly: false});
		expect(window.CKEDITOR.__calls[0].config.syComponentSlots).toEqual({'A\n{}': '{SLOT}'});
		expect(window.CKEDITOR.__calls[0].config.syRenderedComponents).toEqual({'A\n{}': '<span>rendered</span>'});
	});
});

describe('preserve-empty', () => {
	it('mutates CKEDITOR.dtd before the editor is created', async () => {
		await startWith({preserveEmpty: ['span', 'i']});

		const record = window.CKEDITOR.__calls[0];
		expect(record.removeEmptyAtInit.span).toBe(false);
		expect(record.removeEmptyAtInit.i).toBe(false);
		// Elements that are not listed keep their CKEditor default.
		expect(record.removeEmptyAtInit.br).toBe(1);
	});
});

describe('mode', () => {
	it('calls CKEDITOR.inline for inline mode', async () => {
		await startWith({mode: 'inline'});

		expect(window.CKEDITOR.__calls[0].method).toBe('inline');
	});

	it('calls CKEDITOR.replace for classic mode', async () => {
		const textarea = document.createElement('textarea');
		textarea.id = 'article-content';
		document.body.appendChild(textarea);

		await startWith({mode: 'classic'}, textarea);

		expect(window.CKEDITOR.__calls[0].method).toBe('replace');
	});
});

describe('wysiwyg:ready', () => {
	it('carries elementId and the editor instance', async () => {
		const events = recordEvents(['ready', 'start']);

		await startWith({}, mount('article-content'));

		const ready = events.of('ready')[0].detail;
		expect(ready.elementId).toBe('article-content');
		expect(ready.editor).toBe(window.CKEDITOR.__calls[0].editor);

		events.stop();
	});
});
