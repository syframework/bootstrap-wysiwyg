/**
 * CKEditor 4 widget for server-side components.
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

	function componentKey(attributes) {
		var key = attributes['data-sycomponent'] || '';
		var args = attributes['data-sycomponent-args'];
		if (args) key += '\n' + args;
		return key;
	}

	function elementKey(element) {
		return componentKey({
			'data-sycomponent': element.getAttribute('data-sycomponent') || '',
			'data-sycomponent-args': element.getAttribute('data-sycomponent-args')
		});
	}

	CKEDITOR.plugins.add('sycomponent', {
		requires: 'widget',

		init: function (editor) {
			function inject(widget) {
				if (!widget || !widget.element || !widget.element.$) return;

				var rendered = (editor.config.syRenderedComponents || {})[elementKey(widget.element)];
				if (typeof rendered === 'string') widget.element.$.innerHTML = rendered;
			}

			editor.widgets.add('sycomponent', {
				upcast: function (element) {
					return typeof element.attributes['data-sycomponent'] !== 'undefined'
						&& element.attributes['data-sycomponent'].length > 0;
				},

				downcast: function (element) {
					if (typeof element.attributes['data-sycomponent'] === 'undefined') return;

					var slots = editor.config.syComponentSlots || {};
					var slot = slots[componentKey(element.attributes)];
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
		}
	});
})();
