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
 * `config.components.metadataUrl` is the same catalogue served by
 * `editor/<item>/metadata`: when the consumer provides it, the plugin fetches
 * it the first time the dialog is opened instead of receiving it with every
 * page, keeps it per editor and falls back to the generated labels if the
 * request fails.
 *
 * `config.components.renderUrl` is optional: when the consumer provides it,
 * the plugin asks the server for the component HTML after an insertion or an
 * edit, so the editor shows the final rendering immediately.
 *
 * The rendered HTML is injected into the masked widget after CKEditor has
 * parsed the data, so trusted component styles are not filtered by the ACF.
 */
(function () {
	'use strict';

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

	var FALLBACK_MESSAGES = {
		button: 'Component',
		insertTitle: 'Insert component',
		editTitle: 'Edit component',
		editMenu: 'Edit component',
		component: 'Component',
		argumentsJson: 'Arguments (JSON)',
		noArguments: 'This component takes no arguments.',
		choose: 'Choose…',
		defaultOption: '(default)',
		yes: 'Yes',
		no: 'No',
		chooseComponent: 'Choose a component.',
		invalidJson: 'Arguments must be valid JSON.',
		invalidJsonShape: 'Arguments must be a JSON object or array.',
		requiredField: 'The "%field%" field is required.',
		invalidInteger: 'The "%field%" field must be an integer.',
		invalidNumber: 'The "%field%" field must be a number.',
		invalidFieldJson: 'The "%field%" field must be valid JSON.',
		invalidArray: 'The "%field%" field must be a JSON array.',
		rendering: '(rendering…)',
		saveToRender: '(save to render)',
		componentFallback: 'Component',
		componentNotAllowed: 'This component is no longer available.'
	};

	function message(editor, key, params) {
		var messages = editor && editor.lang && editor.lang.sycomponent ? editor.lang.sycomponent : {};
		var text = messages[key] || FALLBACK_MESSAGES[key] || key;
		if (params) {
			Object.keys(params).forEach(function (name) {
				text = String(text).replace(new RegExp('%' + name + '%', 'g'), params[name]);
			});
		}
		return text;
	}

	function configuredComponents(editor) {
		return editor.config.components || {};
	}

	function metadataMap(editor) {
		var state = metadataState(editor);
		if (state.map) return state.map;
		var metadata = configuredComponents(editor).metadata;
		return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
			? metadata
			: {};
	}

	/** Whether the page already carries the map (`components.metadata`). */
	function embeddedMetadata(editor) {
		var metadata = configuredComponents(editor).metadata;
		return !!metadata && typeof metadata === 'object' && !Array.isArray(metadata)
			&& Object.keys(metadata).length > 0;
	}

	function metadataEndpoint(editor) {
		var url = configuredComponents(editor).metadataUrl;
		return typeof url === 'string' && url !== '' ? url : null;
	}

	/**
	 * Per-editor catalogue state: `idle`, `loading`, `ready` or `error`.
	 *
	 * The map stays empty until the request resolves, so every lookup keeps its
	 * documented fallback (humanized class name, generated source slot) and a
	 * failed fetch never blocks the editor.
	 */
	function metadataState(editor) {
		if (!editor._sycomponentMetadata) {
			editor._sycomponentMetadata = {status: 'idle', map: null, pending: []};
		}
		return editor._sycomponentMetadata;
	}

	/**
	 * Fetch the catalogue the first time the dialog is needed, not when the
	 * editor starts: a page that is only read never pays for it. The endpoint
	 * answers `Cache-Control: private, max-age=0, must-revalidate`, so the
	 * browser revalidates and a `304` costs no payload on the second opening.
	 */
	function ensureMetadata(editor, done) {
		var state = metadataState(editor);
		var url = metadataEndpoint(editor);

		// No endpoint, or a map embedded by `components.metadata`: the payload
		// already holds the catalogue, and nothing is requested.
		if (!url || state.status === 'ready' || embeddedMetadata(editor)) {
			done();
			return;
		}
		if (state.status === 'loading') {
			state.pending.push(done);
			return;
		}

		state.status = 'loading';
		state.pending.push(done);

		function flush() {
			var pending = state.pending;
			state.pending = [];
			pending.forEach(function (callback) {
				callback();
			});
		}

		fetch(url, {
			method: 'GET',
			credentials: 'same-origin',
			headers: {'Accept': 'application/json'}
		}).then(function (response) {
			if (!response.ok) throw new Error('Component metadata request failed');
			return response.json();
		}).then(function (data) {
			state.map = data && data.components && typeof data.components === 'object'
				&& !Array.isArray(data.components)
				? data.components
				: {};
			state.status = 'ready';
			flush();
		}).catch(function () {
			// `error` is a retryable state: the next opening asks again.
			state.status = 'error';
			flush();
		});
	}

	/**
	 * Metadata describes the allowlist, so the dialog is opened once the
	 * catalogue is known: its select shows human labels instead of class names.
	 */
	function openComponentDialog(editor) {
		ensureMetadata(editor, function () {
			editor.openDialog('sycomponent');
		});
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

	function isAllowed(editor, component) {
		return allowlist(editor).indexOf(String(component).replace(/^\\+/, '')) !== -1;
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

	function setDialogTitle(dialog, title) {
		var element = dialog.getElement();
		var node = element && element.$ ? element.$.querySelector('.cke_dialog_title') : null;
		if (node) node.textContent = title;
	}

	function createField(doc, editor, parameter) {
		var wrapper = doc.createElement('div');
		wrapper.style.marginBottom = '8px';

		var label = doc.createElement('label');
		label.className = 'cke_dialog_ui_labeled_label';
		label.textContent = humanize(parameter.name);
		if (parameter.required) {
			label.appendChild(doc.createTextNode(' '));
			var required = doc.createElement('span');
			required.className = 'cke_dialog_ui_labeled_required';
			required.setAttribute('aria-hidden', 'true');
			required.textContent = '*';
			label.appendChild(required);
		}
		label.style.display = 'block';
		label.style.fontWeight = 'bold';
		label.style.marginBottom = '2px';
		wrapper.appendChild(label);

		var input;
		if (parameter.type === 'bool') {
			input = doc.createElement('select');
			input.className = 'cke_dialog_ui_input_select';
			if (parameter.required) {
				var choose = doc.createElement('option');
				choose.value = '';
				choose.textContent = message(editor, 'choose');
				input.appendChild(choose);
			} else {
				var defaultOption = doc.createElement('option');
				defaultOption.value = '';
				defaultOption.textContent = message(editor, 'defaultOption');
				input.appendChild(defaultOption);
			}
			var yes = doc.createElement('option');
			yes.value = '1';
			yes.textContent = message(editor, 'yes');
			var no = doc.createElement('option');
			no.value = '0';
			no.textContent = message(editor, 'no');
			input.appendChild(yes);
			input.appendChild(no);
			if (parameter.hasDefault && typeof parameter.default === 'boolean') {
				input.value = parameter.default ? '1' : '0';
			}
		} else if (parameter.type === 'array' || parameter.type === 'json') {
			input = doc.createElement('textarea');
			input.className = 'cke_dialog_ui_input_textarea';
			input.rows = 3;
			if (parameter.hasDefault) {
				input.value = JSON.stringify(parameter.default);
			} else {
				input.value = parameter.type === 'array' ? '[]' : '{}';
			}
		} else {
			input = doc.createElement('input');
			input.className = 'cke_dialog_ui_input_text';
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
		input.style.maxWidth = '100%';
		input.style.margin = '0';
		input.style.boxSizing = 'border-box';
		wrapper.appendChild(input);
		return wrapper;
	}

	function parseArgs(raw) {
		if (!raw) return null;
		try {
			var value = JSON.parse(raw);
			return value && typeof value === 'object' ? value : null;
		} catch (error) {
			return null;
		}
	}

	function valueFor(values, parameter, index) {
		if (!values) return undefined;
		if (Array.isArray(values)) return values[index];
		if (Object.prototype.hasOwnProperty.call(values, parameter.name)) {
			return values[parameter.name];
		}
		return undefined;
	}

	function applyValue(container, parameter, value) {
		if (value === undefined) return;
		var input = container.querySelector('[data-sycomponent-param="' + parameter.name + '"]');
		if (!input) return;

		if (parameter.type === 'bool') {
			if (value === true || value === 1 || value === 'true' || value === '1') {
				input.value = '1';
			} else if (value === false || value === 0 || value === 'false' || value === '0') {
				input.value = '0';
			} else {
				input.value = '';
			}
			return;
		}
		if (parameter.type === 'array' || parameter.type === 'json') {
			input.value = JSON.stringify(value);
			return;
		}
		input.value = value === null ? '' : String(value);
	}

	function renderFields(editor, dialog, values, rawArgs) {
		var container = fieldsContainer(dialog);
		if (!container) return;

		container.innerHTML = '';
		var component = dialog.getValueOf('info', 'component');
		var params = parameters(editor, component);

		if (params === null) {
			var note = document.createElement('p');
			note.textContent = message(editor, 'argumentsJson');
			note.style.margin = '0 0 4px';
			note.style.fontWeight = 'bold';
			container.appendChild(note);

			var textarea = document.createElement('textarea');
			textarea.className = 'cke_dialog_ui_input_textarea';
			textarea.setAttribute('data-sycomponent-json', '1');
			textarea.rows = 5;
			textarea.value = rawArgs || '{}';
			textarea.style.width = '100%';
			textarea.style.boxSizing = 'border-box';
			container.appendChild(textarea);
			return;
		}

		if (!params.length) {
			var empty = document.createElement('p');
			empty.textContent = message(editor, 'noArguments');
			empty.style.margin = '0';
			empty.style.color = '#666';
			container.appendChild(empty);
			return;
		}

		params.forEach(function (parameter, index) {
			container.appendChild(createField(document, editor, parameter));
			applyValue(container, parameter, valueFor(values, parameter, index));
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
				alert(message(editor, 'invalidJson'));
				return null;
			}
			if (parsed === null || typeof parsed !== 'object') {
				alert(message(editor, 'invalidJsonShape'));
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
						alert(message(editor, 'requiredField', {field: humanize(parameter.name)}));
						return null;
					}
					continue;
				}
				values[parameter.name] = value === '1' || value === 'true';
				continue;
			}

			if (value === '') {
				if (parameter.required) {
					alert(message(editor, 'requiredField', {field: humanize(parameter.name)}));
					return null;
				}
				continue;
			}

			if (parameter.type === 'int') {
				if (!/^-?\d+$/.test(value)) {
					alert(message(editor, 'invalidInteger', {field: humanize(parameter.name)}));
					return null;
				}
				values[parameter.name] = parseInt(value, 10);
			} else if (parameter.type === 'float') {
				if (isNaN(Number(value))) {
					alert(message(editor, 'invalidNumber', {field: humanize(parameter.name)}));
					return null;
				}
				values[parameter.name] = parseFloat(value);
			} else if (parameter.type === 'array' || parameter.type === 'json') {
				var parsedValue;
				try {
					parsedValue = JSON.parse(value);
				} catch (error) {
					alert(message(editor, 'invalidFieldJson', {field: humanize(parameter.name)}));
					return null;
				}
				if (parameter.type === 'array' && !Array.isArray(parsedValue)) {
					alert(message(editor, 'invalidArray', {field: humanize(parameter.name)}));
					return null;
				}
				values[parameter.name] = parsedValue;
			} else {
				values[parameter.name] = value;
			}
		}

		return JSON.stringify(values);
	}

	function maskWidget(editor, widget, suffix) {
		if (!widget || !widget.element || !widget.element.$) return;
		var component = widget.element.getAttribute('data-sycomponent') || message(editor, 'componentFallback');
		widget.element.$.textContent = componentLabel(editor, component) + ' ' + message(editor, suffix || 'saveToRender');
	}

	/**
	 * The render endpoint is not the article page: a preview form must post to
	 * the page the editor is editing, like the server-side initial render.
	 */
	function fixPreviewActions(html) {
		var host = document.createElement('div');
		host.innerHTML = html;
		var forms = host.querySelectorAll('form');
		for (var i = 0; i < forms.length; i++) {
			forms[i].setAttribute('action', window.location.href);
		}
		return host.innerHTML;
	}

	function findWidget(editor, token) {
		var instances = editor.widgets.instances || {};
		var ids = Object.keys(instances);
		for (var i = 0; i < ids.length; i++) {
			var widget = instances[ids[i]];
			if (widget && widget.name === 'sycomponent'
				&& widget.element.getAttribute('data-sycomponent-token') === token) {
				return widget;
			}
		}
		return null;
	}

	/**
	 * Ask the consumer's render endpoint for the final component HTML and
	 * replace the widget content. The source slot stays untouched: it is what
	 * the next save serializes.
	 */
	function refreshComponent(editor, widget) {
		if (!widget || !widget.element) return;

		var url = configuredComponents(editor).renderUrl;
		var component = widget.element.getAttribute('data-sycomponent');
		var args = widget.element.getAttribute('data-sycomponent-args') || '{}';

		if (!url) {
			maskWidget(editor, widget);
			return;
		}

		var key = elementKey(widget.element);
		maskWidget(editor, widget, 'rendering');

		var body = new URLSearchParams();
		body.append('component', component);
		body.append('args', args);

		fetch(url, {
			method: 'POST',
			credentials: 'same-origin',
			headers: {'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'},
			body: body.toString()
		}).then(function (response) {
			if (!response.ok) throw new Error('Component render failed');
			return response.json();
		}).then(function (data) {
			if (!data || data.status !== 'ok' || typeof data.html !== 'string') {
				maskWidget(editor, widget);
				return;
			}
			var preview = fixPreviewActions(data.html);
			var rendered = editor.config.syRenderedComponents || (editor.config.syRenderedComponents = {});
			rendered[key] = preview;
			widget.element.$.innerHTML = preview;
		}).catch(function () {
			maskWidget(editor, widget);
		});
	}

	CKEDITOR.plugins.add('sycomponent', {
		requires: 'widget',
		lang: 'en,fr',

		init: function (editor) {
			function inject(widget) {
				if (!widget || !widget.element || !widget.element.$) return;
				// `instanceCreated` fires for every widget of the editor: masking a
				// sytranslate or sywidget instance would replace its content with
				// the component placeholder.
				if (widget.name !== 'sycomponent') return;

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
				maskWidget(editor, widget);
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

			// A rendered form intercepts CKEditor's doubleclick event, so listen
			// on the editable DOM and walk up to the component wrapper instead.
			var doubleClickBound = false;
			function bindDoubleClick() {
				if (doubleClickBound) return;
				var editable = editor.editable ? editor.editable() : null;
				if (!editable) return;
				doubleClickBound = true;
				editable.attachListener(editable, 'dblclick', function (event) {
					var target = event.data.getTarget();
					// The widget mask is a child of CKEditor's wrapper, not of
					// the source element: getByElement resolves both cases.
					var widget = editor.widgets.getByElement(target);
					if (!widget) {
						var wrapper = target.getAscendant(function (element) {
							return element.hasAttribute && element.hasAttribute('data-sycomponent');
						}, true);
						if (wrapper) widget = editor.widgets.getByElement(wrapper);
					}
					if (!widget || widget.name !== 'sycomponent') return;
					if (!isAllowed(editor, widget.element.getAttribute('data-sycomponent'))) {
						alert(message(editor, 'componentNotAllowed'));
						return;
					}
					editor._sycomponentEditWidget = widget;
					editable.focus();
					openComponentDialog(editor);
					event.data.preventDefault();
				});
			}
			editor.on('contentDom', bindDoubleClick);
			bindDoubleClick();

			editor.addCommand('sycomponentInsert', {
				exec: function () {
					editor._sycomponentEditWidget = null;
					openComponentDialog(editor);
				}
			});
			editor.addCommand('sycomponentEdit', {
				exec: function () {
					openComponentDialog(editor);
				}
			});

			var icon = editor.config.syComponentIcon;
			if (!icon) {
				var plugin = CKEDITOR.plugins.get('sycomponent');
				if (plugin && plugin.path) {
					icon = plugin.path.replace(/\/+$/, '') + '/sycomponent.svg';
				}
			}

			if (editor.addMenuGroup && editor.addMenuItem) {
				editor.addMenuGroup('sycomponent', 10);
				var menuItem = {
					label: message(editor, 'editMenu'),
					command: 'sycomponentEdit',
					group: 'sycomponent'
				};
				if (icon) menuItem.icon = icon;
				editor.addMenuItem('sycomponentEdit', menuItem);
				if (editor.contextMenu) {
					editor.contextMenu.addListener(function (element) {
						var widget = editor.widgets.getByElement(element);
						if (widget && widget.name === 'sycomponent'
							&& isAllowed(editor, widget.element.getAttribute('data-sycomponent'))) {
							editor._sycomponentEditWidget = widget;
							return {sycomponentEdit: CKEDITOR.TRISTATE_OFF};
						}
						return null;
					});
				}
			}

			var button = {
				label: editor.config.syComponentLabel || message(editor, 'button'),
				command: 'sycomponentInsert',
				toolbar: 'insert,5'
			};
			if (icon) button.icon = icon;
			editor.ui.addButton('Sycomponent', button);
		}
	});

	CKEDITOR.dialog.add('sycomponent', function (editor) {
		var items = allowlist(editor).map(function (component) {
			return [componentLabel(editor, component), component];
		});
		if (!items.length) items = [['', '']];

		function setComponent(dialog, component) {
			var normalized = String(component).replace(/^\\+/, '');
			var select = dialog.getContentElement('info', 'component');
			var input = select ? select.getInputElement().$ : null;
			if (!input) return false;
			for (var i = 0; i < input.options.length; i++) {
				if (input.options[i].value === normalized) {
					input.value = normalized;
					return true;
				}
			}
			return false;
		}

		return {
			title: message(editor, 'insertTitle'),
			minWidth: 520,
			minHeight: 260,
			contents: [{
				id: 'info',
				elements: [
					{
						type: 'select',
						id: 'component',
						label: message(editor, 'component'),
						items: items,
						'default': items[0][1],
						required: true,
						onChange: function () {
							renderFields(editor, this.getDialog(), null, null);
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
				renderFields(editor, this, null, null);
			},
			onShow: function () {
				var dialog = this;
				var editing = editor._sycomponentEditWidget || null;
				dialog._sycomponentEditing = editing;

				var component = editing ? editing.element.getAttribute('data-sycomponent') : null;
				if (editing && !isAllowed(editor, component)) {
					editor._sycomponentEditWidget = null;
					dialog._sycomponentEditing = null;
					alert(message(editor, 'componentNotAllowed'));
					dialog.hide();
					return;
				}
				if (!component) {
					var select = dialog.getContentElement('info', 'component');
					var input = select ? select.getInputElement().$ : null;
					if (input && input.options.length) component = input.options[0].value;
				}
				if (!setComponent(dialog, component)) {
					editor._sycomponentEditWidget = null;
					dialog._sycomponentEditing = null;
					alert(message(editor, 'componentNotAllowed'));
					dialog.hide();
					return;
				}

				var rawArgs = editing ? editing.element.getAttribute('data-sycomponent-args') : null;
				setDialogTitle(dialog, editing ? message(editor, 'editTitle') : message(editor, 'insertTitle'));
				renderFields(editor, dialog, parseArgs(rawArgs), rawArgs);
			},
			onOk: function () {
				var component = this.getValueOf('info', 'component');
				if (!component) {
					alert(message(editor, 'chooseComponent'));
					return false;
				}

				var args = readArguments(editor, this);
				if (args === null) return false;

				var slots = editor.config.syComponentSlots || (editor.config.syComponentSlots = {});
				var editing = this._sycomponentEditing || null;
				if (editing) {
					var oldComponent = editing.element.getAttribute('data-sycomponent');
					var oldKey = elementKey(editing.element);

					editing.element.setAttribute('data-sycomponent', component);
					if (args === '{}') {
						editing.element.removeAttribute('data-sycomponent-args');
					} else {
						editing.element.setAttribute('data-sycomponent-args', args);
					}

					var newKey = elementKey(editing.element);
					if (typeof slots[newKey] === 'undefined') {
						var oldSlot = slots[oldKey];
						slots[newKey] = (component === oldComponent && typeof oldSlot === 'string')
							? oldSlot
							: componentSlot(editor, component);
					}

					editor._sycomponentEditWidget = null;
					this._sycomponentEditing = null;
					editor.fire('change');
					refreshComponent(editor, editing);
					editor.focus();
					return;
				}

				var key = component;
				var attributes = ' data-sycomponent="' + escapeAttr(component) + '"';
				if (args !== '{}') {
					attributes += ' data-sycomponent-args="' + escapeAttr(args) + '"';
					key = componentKey(component, args);
				}

				if (typeof slots[key] === 'undefined') {
					slots[key] = componentSlot(editor, component);
				}

				var token = 'sycomponent-' + CKEDITOR.tools.getUniqueId();
				editor.insertHtml(
					'<div' + attributes + ' data-sycomponent-token="' + token + '">'
					+ escapeText(slots[key])
					+ '</div>'
				);

				var attempts = 0;
				function finishInsert() {
					var widget = findWidget(editor, token);
					if (!widget) {
						if (attempts++ < 20) setTimeout(finishInsert, 10);
						return;
					}
					widget.element.removeAttribute('data-sycomponent-token');
					refreshComponent(editor, widget);
				}
				finishInsert();
				editor.focus();
			}
		};
	});
})();
