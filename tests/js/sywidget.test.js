/**
 * `sywidget`: the widget that preserves the attributes a consumer owns
 * (`data-sylock`). The CKEditor widget engine is replaced by a fake that only
 * keeps the registered definition, because what matters is the upcast/downcast
 * contract, not the widget lifecycle.
 */

import {beforeEach, describe, expect, it} from 'vitest';
import sywidgetSource from '../../assets/js/plugins/sywidget.js?raw';

function boot() {
	const plugins = {};
	window.CKEDITOR = {
		NODE_ELEMENT: 1,
		plugins: {
			add(name, definition) {
				plugins[name] = definition;
			},
		},
		htmlParser: {
			// A function expression, not a method: the plugin calls it with
			// `new`, which a method shorthand cannot be used for.
			element: function (name, attributes) {
				return {
					name,
					attributes: {...attributes},
					html: '',
					setHtml(html) {
						this.html = html;
					},
					getHtml() {
						return this.html;
					},
				};
			},
		},
	};
	window.eval(sywidgetSource);
	return plugins;
}

function fakeEditor() {
	const editor = {
		widgets: {
			definitions: {},
			add(name, definition) {
				this.definitions[name] = definition;
			},
		},
	};
	return editor;
}

/** Element as the widget `upcast` receives it. */
function parserElement(attributes, children = []) {
	return {
		type: 1, // CKEDITOR.NODE_ELEMENT
		attributes: {...attributes},
		children,
		html: '',
		setHtml(html) {
			this.html = html;
		},
		getHtml() {
			return this.html || 'inner';
		},
	};
}

function definition() {
	const plugins = boot();
	const editor = fakeEditor();
	plugins.sywidget.init(editor);
	return editor.widgets.definitions.sywidget;
}

describe('sywidget — registration', () => {
	beforeEach(() => {
		delete window.CKEDITOR;
	});

	it('requires the CKEditor widget plugin', () => {
		const plugins = boot();
		expect(plugins.sywidget.requires).toBe('widget');
	});

	it('edits the locked element through its content editable', () => {
		const widget = definition();
		expect(widget.editables.content).toBe('[data-sylock="attributes"]');
	});
});

describe('sywidget — upcast', () => {
	beforeEach(() => {
		delete window.CKEDITOR;
	});

	it('ignores an element without the lock marker', () => {
		expect(definition().upcast(parserElement({class: 'x'}), {})).toBe(false);
	});

	it('snapshots the attributes of a locked element, recursively', () => {
		const child = parserElement({'data-sylock': 'attributes', href: '/a'});
		const element = parserElement({'data-sylock': 'attributes', class: 'card'}, [child]);
		const data = {};

		expect(definition().upcast(element, data)).toBe(true);
		expect(JSON.parse(element.attributes['data-sylock-attributes'])).toEqual({
			'data-sylock': 'attributes',
			class: 'card',
		});
		expect(JSON.parse(child.attributes['data-sylock-attributes'])).toEqual({
			'data-sylock': 'attributes',
			href: '/a',
		});
	});

	it('keeps the html and the attributes for any other lock value', () => {
		const element = parserElement({'data-sylock': 'html', href: '/b'});
		const data = {};

		expect(definition().upcast(element, data)).toBe(true);
		expect(data.attributes).toEqual({'data-sylock': 'html', href: '/b'});
		expect(typeof data.html).toBe('string');
	});
});

describe('sywidget — downcast', () => {
	beforeEach(() => {
		delete window.CKEDITOR;
	});

	it('restores the snapshotted attributes and the edited html', () => {
		const widget = definition();
		const element = parserElement({
			'data-sylock': 'attributes',
			'data-sylock-attributes': JSON.stringify({'data-sylock': 'attributes', href: '/original', class: 'card'}),
			href: '/rewritten-by-the-editor',
		});
		const context = {
			editables: {
				content: {getData: () => '<p>edited</p>'},
			},
		};

		const result = widget.downcast.call(context, element);

		expect(result.attributes).toEqual({'data-sylock': 'attributes', href: '/original', class: 'card'});
		expect(result.html).toBe('<p>edited</p>');
		expect(element.attributes['data-sylock-attributes']).toBeUndefined();
	});

	it('rebuilds the element from the stored html when the lock is not about attributes', () => {
		const widget = definition();
		const element = parserElement({'data-sylock': 'html'});
		const context = {data: {html: '<p>frozen</p>', attributes: {'data-sylock': 'html', href: '/c'}}};

		const result = widget.downcast.call(context, element);

		expect(result.attributes).toEqual({'data-sylock': 'html', href: '/c'});
		expect(result.html).toBe('<p>frozen</p>');
	});
});
