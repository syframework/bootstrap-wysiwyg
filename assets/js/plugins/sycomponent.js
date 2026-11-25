/**
 * CKEditor 4 widget and insertion dialog for server-side components.
 *
 * The editor data model keeps the source slot (`{CONTACT}`) and the engine
 * passes two maps through config:
 *   - syComponentSlots: source slot to restore on downcast;
 *   - syRenderedComponents: trusted component HTML to display.
 *
 * `config.components.metadata` is built server-side by ComponentMeta: it
 * carries the human label, the generated slot and the constructor parameters,
 * so the dialog can render typed fields instead of a raw JSON textarea.
 *
 * The rendered HTML is injected into the masked widget after CKEditor has
 * parsed the data, so trusted component styles are not filtered by the ACF.
 */
(function () {
	'use strict';

	var ICON = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
		'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 21 21">'
		+ '<g fill="none" stroke="#666" stroke-linecap="round" stroke-linejoin="round" transform="translate(3 3)">'
		+ '<path d="m8.49227788 1.06701593 5.00000002 2.85714286c.62315.35608571 1.0077221 1.01877259 1.0077221 1.73648628v4.67870983c0 .7177137-.3845721 1.3804006-1.0077221 1.7364863l-5.00000002 2.8571429c-.61486534.3513516-1.36969042.3513516-1.98455576 0l-5-2.8571429c-.62314999-.3560857-1.00772212-1.0187726-1.00772212-1.7364863v-4.67870983c0-.71771369.38457213-1.38040057 1.00772212-1.73648628l5-2.85714286c.61486534-.35135162 1.36969042-.35135162 1.98455576 0z"/>'
		+ '<path d="m7.5 8.5v6.5"/>'
		+ '<path d="m1 5 5.55180035 2.98943096c.59195265.31874373 1.30444665.31874373 1.8963993 0l5.55180035-2.98943096"/>'
		+ '</g></svg>'
	);

	function componentKey(component, args) {
		return args ? component + '\n' + args : component;
	}

	function elementKey(element) {
		return componentKey(
			element.getAttribute('data-sycomponent') || '',
			element.getAttribute('data-sycomponent-args')
		);
	}

	function escapeAttr(value) {
		return String(value)
			.replace(/&/g, '&amp;')
			.replace(/"/g, '&quot;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
	}

	function escapeText(value) {
		return String(value)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
	}

	function humanize(value) {
		var label = String(value)
			.replace(/[_-]+/g, ' ')
			.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
			.replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
			.replace(/\s+/g, ' ')
			.trim();
		return label.charAt(0).toUpperCase() + label.slice(1);
	}

	function fallbackLabel(component) {
		var parts = String(component).replace(/^\\+/, '').split('\\');
		return parts.slice(-2).map(function (part) {
			return String(part).replace(/[_-]+/g, ' ').trim();
		}).join(' ');
	}

	function configuredComponents(editor) {
		return editor.config.components || {};
	}

	function metadataMap(editor) {
		var metadata = configuredComponents(editor).metadata;
		return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
			? metadata
			: {};
	}

	function componentMeta(editor, component) {
		var metadata = metadataMap(editor);
		var normalized = String(component).replace(/^\\+/, '');
		return metadata[normalized] || metadata[component] || null;
	}

	function componentLabel(editor, component) {
		var meta = componentMeta(editor, component);
		return meta && meta.label ? meta.label : fallbackLabel(component);
	}

	function componentSlot(editor, component) {
		var meta = componentMeta(editor, component);
		if (meta && meta.slot) return meta.slot;

		var short = String(component).replace(/^\\+/, '').split('\\').pop();
		var snake = humanize(short).replace(/\s+/g, '_').toUpperCase();
		return '{' + (snake || 'SLOT') + '}';
	}

	function allowlist(editor) {
		var components = configuredComponents(editor);
		if (!Array.isArray(components.allowlist)) return [];
		return components.allowlist.map(function (component) {
			return String(component).replace(/^\\+/, '');
		});
	}

	/**
	 * Null means the class could not be inspected: the dialog falls back to a
	 * JSON textarea. An empty array means a constructor without parameters.
	 */
	function parameters(editor, component) {
		var meta = componentMeta(editor, component);
		return meta && Array.isArray(meta.parameters) ? meta.parameters : null;
	}

	function fieldsContainer(dialog) {
		var element = dialog.getElement();
		return element && element.$ ? element.$.querySelector('.sycomponent-fields') : null;
	}

	function createField(doc, parameter) {
		var wrapper = doc.createElement('div');
		wrapper.style.marginBottom = '8px';

		var label = doc.createElement('label');
		label.textContent = humanize(parameter.name) + (parameter.required ? ' *' : '');
		label.style.display = 'block';
		label.style.fontWeight = 'bold';
		label.style.marginBottom = '2px';
		wrapper.appendChild(label);

		var input;
		if (parameter.type === 'bool') {
			input = doc.createElement('select');
			if (parameter.required) {
				var choose = doc.createElement('option');
				choose.value = '';
				choose.textContent = 'Choose…';
				input.appendChild(choose);
			} else {
				var defaultOption = doc.createElement('option');
				defaultOption.value = '';
				defaultOption.textContent = '(default)';
				input.appendChild(defaultOption);
			}
			var yes = doc.createElement('option');
			yes.value = '1';
			yes.textContent = 'Yes';
			var no = doc.createElement('option');
			no.value = '0';
			no.textContent = 'No';
			input.appendChild(yes);
			input.appendChild(no);
			if (parameter.hasDefault && typeof parameter.default === 'boolean') {
				input.value = parameter.default ? '1' : '0';
			}
		} else if (parameter.type === 'array' || parameter.type === 'json') {
			input = doc.createElement('textarea');
			input.rows = 3;
			if (parameter.hasDefault) {
				input.value = JSON.stringify(parameter.default);
			} else {
				input.value = parameter.type === 'array' ? '[]' : '{}';
			}
		} else {
			input = doc.createElement('input');
			input.type = parameter.type === 'int' || parameter.type === 'float' ? 'number' : 'text';
			if (parameter.type === 'int') input.step = '1';
			if (parameter.type === 'float') input.step = 'any';
			if (parameter.hasDefault && parameter.default !== null) {
				input.value = String(parameter.default);
			} else if (parameter.hasDefault && parameter.default === null) {
				input.placeholder = 'null';
			}
		}
		input.setAttribute('data-sycomponent-param', parameter.name);
		input.setAttribute('data-sycomponent-type', parameter.type);
		input.setAttribute('autocomplete', 'off');
		input.style.width = '100%';
		input.style.boxSizing = 'border-box';
		wrapper.appendChild(input);
		return wrapper;
	}

	function renderFields(editor, dialog) {
		var container = fieldsContainer(dialog);
		if (!container) return;

		container.innerHTML = '';
		var component = dialog.getValueOf('info', 'component');
		var params = parameters(editor, component);

		if (params === null) {
			var note = document.createElement('p');
			note.textContent = 'Arguments (JSON)';
			note.style.margin = '0 0 4px';
			note.style.fontWeight = 'bold';
			container.appendChild(note);

			var textarea = document.createElement('textarea');
			textarea.setAttribute('data-sycomponent-json', '1');
			textarea.rows = 5;
			textarea.value = '{}';
			textarea.style.width = '100%';
			textarea.style.boxSizing = 'border-box';
			container.appendChild(textarea);
			return;
		}

		if (!params.length) {
			var empty = document.createElement('p');
			empty.textContent = 'This component takes no arguments.';
			empty.style.margin = '0';
			empty.style.color = '#666';
			container.appendChild(empty);
			return;
		}

		params.forEach(function (parameter) {
			container.appendChild(createField(document, parameter));
		});
	}

	function readArguments(editor, dialog) {
		var component = dialog.getValueOf('info', 'component');
		var params = parameters(editor, component);
		var container = fieldsContainer(dialog);

		if (params === null) {
			var jsonField = container ? container.querySelector('[data-sycomponent-json]') : null;
			var raw = jsonField ? jsonField.value.trim() : '{}';
			if (raw === '') raw = '{}';
			var parsed;
			try {
				parsed = JSON.parse(raw);
			} catch (error) {
				alert('Arguments must be valid JSON.');
				return null;
			}
			if (parsed === null || typeof parsed !== 'object') {
				alert('Arguments must be a JSON object or array.');
				return null;
			}
			return raw;
		}

		if (!params.length) return '{}';

		var values = {};
		for (var i = 0; i < params.length; i++) {
			var parameter = params[i];
			var field = container ? container.querySelector('[data-sycomponent-param="' + parameter.name + '"]') : null;
			var value = field ? field.value : '';

			if (parameter.type === 'bool') {
				if (value === '') {
					if (parameter.required) {
						alert('The "' + humanize(parameter.name) + '" field is required.');
						return null;
					}
					continue;
				}
				values[parameter.name] = value === '1' || value === 'true';
				continue;
			}

			if (value === '') {
				if (parameter.required) {
					alert('The "' + humanize(parameter.name) + '" field is required.');
					return null;
				}
				continue;
			}

			if (parameter.type === 'int') {
				if (!/^-?\d+$/.test(value)) {
					alert('The "' + humanize(parameter.name) + '" field must be an integer.');
					return null;
				}
				values[parameter.name] = parseInt(value, 10);
			} else if (parameter.type === 'float') {
				if (isNaN(Number(value))) {
					alert('The "' + humanize(parameter.name) + '" field must be a number.');
					return null;
				}
				values[parameter.name] = parseFloat(value);
			} else if (parameter.type === 'array' || parameter.type === 'json') {
				var parsedValue;
				try {
					parsedValue = JSON.parse(value);
				} catch (error) {
					alert('The "' + humanize(parameter.name) + '" field must be valid JSON.');
					return null;
				}
				if (parameter.type === 'array' && !Array.isArray(parsedValue)) {
					alert('The "' + humanize(parameter.name) + '" field must be a JSON array.');
					return null;
				}
				values[parameter.name] = parsedValue;
			} else {
				values[parameter.name] = value;
			}
		}

		return JSON.stringify(values);
	}

	CKEDITOR.plugins.add('sycomponent', {
		requires: 'widget',

		init: function (editor) {
			function inject(widget) {
				if (!widget || !widget.element || !widget.element.$) return;

				var key = elementKey(widget.element);
				var rendered = (editor.config.syRenderedComponents || {})[key];

				if (typeof rendered === 'string') {
					widget.element.$.innerHTML = rendered;
					return;
				}

				// A component inserted from the source dialog has no rendered
				// snapshot yet. Keep its source slot and show a readable mask;
				// the next page load will render the real component.
				var slots = editor.config.syComponentSlots || (editor.config.syComponentSlots = {});
				if (typeof slots[key] === 'undefined') slots[key] = widget.element.$.innerHTML;
				widget.element.$.textContent = componentLabel(
					editor,
					widget.element.getAttribute('data-sycomponent') || 'Component'
				) + ' (save to render)';
			}

			editor.widgets.add('sycomponent', {
				upcast: function (element) {
					return typeof element.attributes['data-sycomponent'] !== 'undefined'
						&& element.attributes['data-sycomponent'].length > 0;
				},

				downcast: function (element) {
					if (typeof element.attributes['data-sycomponent'] === 'undefined') return;

					var slots = editor.config.syComponentSlots || {};
					var slot = slots[componentKey(
						element.attributes['data-sycomponent'],
						element.attributes['data-sycomponent-args']
					)];
					if (typeof slot === 'string') element.setHtml(slot);
					return element;
				},

				mask: true
			});

			editor.widgets.on('instanceCreated', function (event) {
				inject(event.data);
			});

			// Fallback for widgets already present when the plugin initializes.
			editor.on('instanceReady', function () {
				var instances = editor.widgets.instances || {};
				Object.keys(instances).forEach(function (id) {
					inject(instances[id]);
				});
			});

			if (!allowlist(editor).length) return;

			editor.addCommand('sycomponent', new CKEDITOR.dialogCommand('sycomponent'));
			editor.ui.addButton('Sycomponent', {
				label: editor.config.syComponentLabel || 'Component',
				command: 'sycomponent',
				toolbar: 'insert,5',
				icon: ICON
			});
		}
	});

	CKEDITOR.dialog.add('sycomponent', function (editor) {
		var items = allowlist(editor).map(function (component) {
			return [componentLabel(editor, component), component];
		});
		if (!items.length) items = [['', '']];

		return {
			title: 'Insert component',
			minWidth: 520,
			minHeight: 260,
			contents: [{
				id: 'info',
				elements: [
					{
						type: 'select',
						id: 'component',
						label: 'Component',
						items: items,
						'default': items[0][1],
						required: true,
						onChange: function () {
							renderFields(editor, this.getDialog());
						}
					},
					{
						type: 'html',
						id: 'fields',
						html: '<div class="sycomponent-fields" style="max-height:260px;overflow-y:auto;"></div>'
					}
				]
			}],
			onLoad: function () {
				renderFields(editor, this);
			},
			onShow: function () {
				renderFields(editor, this);
			},
			onOk: function () {
				var component = this.getValueOf('info', 'component');
				if (!component) {
					alert('Choose a component.');
					return false;
				}

				var args = readArguments(editor, this);
				if (args === null) return false;

				var key = component;
				var attributes = ' data-sycomponent="' + escapeAttr(component) + '"';
				if (args !== '{}') {
					attributes += ' data-sycomponent-args="' + escapeAttr(args) + '"';
					key = componentKey(component, args);
				}

				var slots = editor.config.syComponentSlots || (editor.config.syComponentSlots = {});
				if (typeof slots[key] === 'undefined') {
					slots[key] = componentSlot(editor, component);
				}

				editor.insertHtml('<div' + attributes + '>' + escapeText(slots[key]) + '</div>');
				editor.focus();
			}
		};
	});
})();
