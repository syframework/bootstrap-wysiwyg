/**
 * CKEditor 4 widget for server-side components.
 *
 * The engine replaces the source slot with the rendered component before the
 * editor starts and passes the source slots through config.syComponentSlots.
 * The widget masks the rendered component while editing and restores the
 * source slot on downcast, so a save never stores the rendered form controls.
 */
(function () {
	'use strict';

	function componentKey(attributes) {
		var key = attributes['data-sycomponent'] || '';
		var args = attributes['data-sycomponent-args'];
		if (args) key += '\n' + args;
		return key;
	}

	CKEDITOR.plugins.add('sycomponent', {
		requires: 'widget',

		init: function (editor) {
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
		}
	});
})();
