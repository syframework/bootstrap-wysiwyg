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

	it('registers nothing when components are disabled', async () => {
		await startWith({
			components: {enabled: false, allowlist: [], reportOnly: false},
			extraPlugins: ['sycomponent'],
		});

		expect(window.CKEDITOR.__externalPlugins).toEqual([]);
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
