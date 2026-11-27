/**
 * Asset cache stamp: the engine versions the `sy*` plugin URLs with the `?v=`
 * it was loaded with, so an upgrade never runs a plugin the browser kept from
 * the previous release (CKEditor asks for external plugins with a fixed `?t=`).
 *
 * The stamp is read once, when the engine executes, so this file stubs
 * `document.currentScript` *before* importing it. The shared helpers import the
 * engine at module load and cannot express that ordering.
 */

import {afterEach, describe, expect, it} from 'vitest';
import {installCkeditor} from './stubs/ckeditor.js';

const ENGINE_URL = 'http://localhost/assets/js/wysiwyg.js?v=1.10.2';

const OPTIONS = {
	id: 'article-content',
	mode: 'inline',
	container: true,
	editable: true,
	content: '',
	extraPlugins: ['sycomponent', 'sytranslate'],
	components: {enabled: true, allowlist: ['A\\B']},
	assets: {
		engine: '/assets/js/wysiwyg.js',
		ckeditorJs: '/assets/ckeditor/ckeditor.js',
		ckeditorRoot: '/assets/ckeditor',
		plugins: '/assets/js/plugins',
	},
};

const NET = {
	getJson: () => Promise.resolve({ok: true, status: 200, data: null}),
	postForm: () => Promise.resolve({ok: true, status: 200, data: {status: 'ok'}}),
};

let instance = null;

async function startEngine() {
	document.body.innerHTML = '';
	// The URL the engine is loaded with: its `v` query is the stamp.
	Object.defineProperty(document, 'currentScript', {
		value: {src: ENGINE_URL},
		configurable: true,
	});

	installCkeditor();
	await import('../../assets/js/wysiwyg.js');

	const element = document.createElement('div');
	element.id = 'article-content';
	document.body.appendChild(element);

	instance = window.SyWysiwyg.create(element, OPTIONS, {net: NET});
	await instance.start();
}

afterEach(() => {
	if (instance) instance.destroy();
	instance = null;
	Object.defineProperty(document, 'currentScript', {value: null, configurable: true});
});

describe('engine — asset cache stamp', () => {
	it('forwards the version it was loaded with to the plugin URLs', async () => {
		await startEngine();

		expect(window.CKEDITOR.__externalPlugins).toEqual([
			{name: 'sycomponent', path: '/assets/js/plugins/sycomponent.js?v=1.10.2'},
			{name: 'sytranslate', path: '/assets/js/plugins/sytranslate.js?v=1.10.2'},
		]);
	});
});
