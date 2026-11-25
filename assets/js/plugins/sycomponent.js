/**
 * CKEditor 4 widget and insertion dialog for server-side components.
 *
 * The editor data model keeps the source slot (`{CONTACT_FORM}`) and the
 * engine passes two maps through config:
 *   - syComponentSlots: source slot to restore on downcast;
 *   - syRenderedComponents: trusted component HTML to display.
 *
 * The rendered HTML is injected into the masked widget after CKEditor has
 * parsed the data, so trusted component styles are not filtered by the ACF.
 */
(function () {
	'use strict';

	var ICON = 'data:image/svg+xml;base64,' + btoa(
		'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">'
		+ '<path fill="#666" d="M8 1a2 2 0 0 0-2 2v1H4a2 2 0 0 0-2 2v2h1a2 2 0 1 1 0 4H2v2a2 2 0 0 0 2 2h2v-1a2 2 0 1 1 4 0v1h2a2 2 0 0 0 2-2V9h-1a2 2 0 1 1 0-4h1V6a2 2 0 0 0-2-2H10V3a2 2 0 0 0-2-2z"/>'
		+ '</svg>'
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

	function componentLabel(value) {
		var parts = String(value).split('\\');
		return parts[parts.length - 1] || value;
	}

	function allowlist(editor) {
		var components = editor.config.components || {};
		return Array.isArray(components.allowlist) ? components.allowlist : [];
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
				widget.element.$.textContent = componentLabel(widget.element.getAttribute('data-sycomponent') || 'Component') + ' (save to render)';
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
			return [componentLabel(component) + ' — ' + component, component];
		});
		if (!items.length) items = [['', '']];

		return {
			title: 'Insert component',
			minWidth: 520,
			minHeight: 280,
			contents: [{
				id: 'info',
				elements: [
					{
						type: 'select',
						id: 'component',
						label: 'Component',
						items: items,
						'default': items[0][1],
						required: true
					},
					{
						type: 'textarea',
						id: 'args',
						label: 'Arguments (JSON)',
						rows: 6,
						'default': '{}'
					},
					{
						type: 'text',
						id: 'slot',
						label: 'Slot',
						'default': '{SLOT}'
					}
				]
			}],
			onOk: function () {
				var component = this.getValueOf('info', 'component');
				if (!component) {
					alert('Choose a component.');
					return false;
				}

				var args = (this.getValueOf('info', 'args') || '').trim() || '{}';
				try {
					JSON.parse(args);
				} catch (error) {
					alert('Arguments must be valid JSON.');
					return false;
				}

				var slot = (this.getValueOf('info', 'slot') || '').trim() || '{SLOT}';
				var key = component;
				var attributes = ' data-sycomponent="' + escapeAttr(component) + '"';
				if (args !== '{}') {
					attributes += ' data-sycomponent-args="' + escapeAttr(args) + '"';
					key = componentKey(component, args);
				}

				var slots = editor.config.syComponentSlots || (editor.config.syComponentSlots = {});
				slots[key] = slot;

				editor.insertHtml('<div' + attributes + '>' + escapeText(slot) + '</div>');
				editor.focus();
			}
		};
	});
})();
