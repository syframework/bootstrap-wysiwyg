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

	function labels(editor) {
		var provided = editor.config.translateLabels;
		var result = {};
		if (!provided || typeof provided !== 'object' || Array.isArray(provided)) provided = {};
		Object.keys(DEFAULTS).forEach(function (name) {
			var value = provided[name];
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

	function save(editor, key, value) {
		var url = editor.config.translateUrl;
		if (typeof url !== 'string' || url === '') return;

		var body = new URLSearchParams();
		body.append('key', key);
		body.append('value', value);
		if (typeof editor.config.translateLang === 'string' && editor.config.translateLang !== '') {
			body.append('lang', editor.config.translateLang);
		}

		fetch(url, {
			method: 'POST',
			credentials: 'same-origin',
			headers: {'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'},
			body: body.toString()
		}).then(function (response) {
			if (!response.ok) throw new Error('Translation request failed');
			return response.json();
		}).catch(function (error) {
			if (window.console && window.console.error) {
				window.console.error('SyWysiwyg sytranslate:', error.message);
			}
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
				save(editor, this.getValueOf('info', 'key'), this.getValueOf('info', 'value'));
			}
		};
	});

	CKEDITOR.plugins.add('sytranslate', {
		requires: 'widget,dialog',

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
