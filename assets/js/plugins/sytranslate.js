/**
 * CKEditor 4 widget and dialog for inline content translations (CMS).
 *
 * The engine passes the widget configuration through `editor.config`:
 *   - translations:    key → value map used to display the current value;
 *   - translateUrl:    endpoint receiving `key`, `value` and optional `lang`;
 *   - translateLabels: dialog labels (language, key, value, add);
 *   - translateLang:   optional content language sent with the POST.
 *
 * The saved source keeps the `{"key"}` placeholder: the rendered page resolves
 * it server-side, exactly like before the extraction.
 */
(function () {
	'use strict';

	var DEFAULTS = {
		language: 'Translation',
		key: 'Key',
		value: 'Value',
		add: 'Translation'
	};

	/**
	 * Dialog labels: the consumer overrides (`translate-labels`) win, then the
	 * CKEditor language pack loaded from `lang/<code>.js`, then the built-in
	 * English defaults. Without the language pack, a consumer that passes no
	 * labels (Place) kept an English dialog on a French editor.
	 */
	function labels(editor) {
		var provided = editor.config.translateLabels;
		var pack = editor.lang && editor.lang.sytranslate ? editor.lang.sytranslate : {};
		var result = {};
		if (!provided || typeof provided !== 'object' || Array.isArray(provided)) provided = {};
		Object.keys(DEFAULTS).forEach(function (name) {
			var value = provided[name];
			if (typeof value === 'string' && value !== '') {
				result[name] = value;
				return;
			}
			value = pack[name];
			result[name] = typeof value === 'string' && value !== '' ? value : DEFAULTS[name];
		});
		return result;
	}

	function translations(editor) {
		var map = editor.config.translations;
		return map && typeof map === 'object' && !Array.isArray(map) ? map : {};
	}

	function iconUrl(editor) {
		var icon = editor.config.syTranslateIcon;
		if (typeof icon === 'string' && icon !== '') return icon;
		var plugin = CKEDITOR.plugins.get('sytranslate');
		if (plugin && plugin.path) return plugin.path.replace(/\/+$/, '') + '/sytranslate.svg';
		return null;
	}

	/** A translation failure must be visible: the slot looks saved otherwise. */
	function report(editor, message) {
		if (window.console && window.console.error) {
			window.console.error('SyWysiwyg sytranslate:', message);
		}
		if (typeof window.alert === 'function') {
			window.alert('SyWysiwyg sytranslate: ' + message);
		}
	}

	/**
	 * Persist the key/value pair.
	 *
	 * The endpoint is optional: a consumer without a translation table (Place)
	 * lets the project translator resolve `{"key"}` at render time. In that case
	 * the value is a local display only, and the console says so once.
	 */
	function save(editor, key, value) {
		var url = editor.config.translateUrl;
		if (typeof url !== 'string' || url === '') {
			if (!editor._sytranslateNoUrl) {
				editor._sytranslateNoUrl = true;
				if (window.console && window.console.warn) {
					window.console.warn('SyWysiwyg sytranslate: no translateUrl configured, the value is not persisted');
				}
			}
			return Promise.resolve(null);
		}

		var body = new URLSearchParams();
		body.append('key', key);
		body.append('value', value);
		if (typeof editor.config.translateLang === 'string' && editor.config.translateLang !== '') {
			body.append('lang', editor.config.translateLang);
		}

		return fetch(url, {
			method: 'POST',
			credentials: 'same-origin',
			headers: {'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'},
			body: body.toString()
		}).then(function (response) {
			// Read the body once: the framework answers `{message}` on 403/500
			// and `{status: 'ko'}` on a refused request.
			return response.text().then(function (text) {
				var data = null;
				try {
					data = JSON.parse(text);
				} catch (e) {}
				if (!response.ok) {
					throw new Error('HTTP ' + response.status
						+ (data && data.message ? ' — ' + data.message : ''));
				}
				if (data && data.status === 'ko') {
					throw new Error(data.message || 'translation refused by the endpoint');
				}
				return data;
			});
		}).catch(function (error) {
			report(editor, error.message);
			return null;
		});
	}

	/**
	 * Insert a new slot at the selection.
	 *
	 * The placeholder text is what the data filter wraps into a widget, so the
	 * saved source stays `{\"key\"}` (the server resolves it) and the downcast
	 * never serializes the display value.
	 */
	function insert(editor, key, value) {
		var clean = String(key === null || typeof key === 'undefined' ? '' : key).replace(/[{}"]/g, '').trim();
		if (clean === '') return;

		editor.insertHtml('{\"' + clean + '\"}');
		if (editor.widgets && typeof editor.widgets.checkWidgets === 'function') {
			editor.widgets.checkWidgets();
		}

		var instances = (editor.widgets && editor.widgets.instances) || {};
		Object.keys(instances).forEach(function (id) {
			var widget = instances[id];
			if (!widget || widget.name !== 'sytranslate') return;
			if (!widget.data || widget.data.name !== clean) return;
			widget.setData('value', value);
		});
	}

	CKEDITOR.dialog.add('sytranslate', function (editor) {
		var text = labels(editor);

		return {
			title: text.language,
			minWidth: 300,
			minHeight: 50,
			contents: [{
				id: 'info',
				elements: [
					{
						id: 'key',
						type: 'text',
						style: 'width: 100%',
						label: text.key,
						'default': '',
						required: true,
						setup: function (widget) {
							// Only called when the dialog edits an existing widget: the
							// toolbar button opens it with no binding, which means
							// "insert a new slot".
							editor._sytranslateWidget = widget;
							this.setValue(widget.data.name);
						},
						commit: function (widget) {
							widget.setData('name', this.getValue());
						}
					},
					{
						id: 'value',
						type: 'text',
						style: 'width: 100%',
						label: text.value,
						'default': '',
						required: true,
						setup: function (widget) {
							this.setValue(widget.data.value);
						},
						commit: function (widget) {
							widget.setData('value', this.getValue());
							document.querySelectorAll('.sytranslate[data-key="' + widget.data.name + '"]').forEach(function (element) {
								element.innerText = widget.data.value;
							});
						}
					}
				]
			}],
			onOk: function () {
				var key = this.getValueOf('info', 'key');
				var value = this.getValueOf('info', 'value');
				var widget = editor._sytranslateWidget;
				editor._sytranslateWidget = null;

				save(editor, key, value);
				// A widget dialog commits the data itself; an insertion has to
				// create the slot, otherwise the typed values are lost.
				if (!widget) insert(editor, key, value);
			}
		};
	});

	CKEDITOR.plugins.add('sytranslate', {
		requires: 'widget,dialog',
		lang: 'en,fr',

		onLoad: function () {
			// Placeholder frame, kept from the CMS implementation.
			CKEDITOR.addCss('.sytranslate{border: 1px dashed #ccc}');
		},

		init: function (editor) {
			var text = labels(editor);
			var map = translations(editor);

			editor.widgets.add('sytranslate', {
				dialog: 'sytranslate',

				template: '<span class="sytranslate">{""}</span>',

				init: function () {
					var regex = /\{".*"\}/;
					if (!regex.test(this.element.getText().trim())) return;

					// Note that placeholder markup characters are stripped for the name.
					var key = this.element.getText().slice(2, -2);
					this.setData('name', key);
					this.element.setAttribute('data-key', key);
					var value = (key in map) ? map[key] : key;
					this.setData('value', value);
				},

				downcast: function () {
					return new CKEDITOR.htmlParser.text('{"' + this.data.name + '"}');
				},

				data: function () {
					this.element.setAttribute('data-key', this.data.name);
					this.element.setText(this.data.value);
				},

				mask: true
			});

			// The button needs a command: without it, CKEditor renders the button
			// and does nothing on click.
			editor.addCommand('sytranslate', {
				exec: function () {
					editor._sytranslateWidget = null;
					editor.openDialog('sytranslate');
				}
			});

			var button = {
				label: text.add,
				command: 'sytranslate',
				toolbar: 'insert,5'
			};
			var icon = iconUrl(editor);
			if (icon) button.icon = icon;
			editor.ui.addButton('Sytranslate', button);
		},

		afterInit: function (editor) {
			var placeholderReplaceRegex = /\{"([^\{\}])+"\}/g;

			editor.dataProcessor.dataFilter.addRules({
				text: function (text) {
					return text.replace(placeholderReplaceRegex, function (match) {
						// Creating widget code.
						var widgetWrapper = null,
							innerElement = new CKEDITOR.htmlParser.element('span', {
								'class': 'sytranslate'
							});

						// Adds placeholder identifier as innertext.
						innerElement.add(new CKEDITOR.htmlParser.text(match));
						widgetWrapper = editor.widgets.wrapElement(innerElement, 'sytranslate');

						// Return outerhtml of widget wrapper so it will be placed as replacement.
						return widgetWrapper.getOuterHtml();
					});
				}
			});
		}
	});
})();
