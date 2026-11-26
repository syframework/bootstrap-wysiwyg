/**
 * CKEditor 4 widget preserving server-locked attributes (`data-sylock`).
 *
 * `data-sylock="attributes"` snapshots the element attributes (recursively for
 * nested locked elements) into `data-sylock-attributes` while editing; the
 * downcast restores them, so the editor cannot rewrite a link, a form action or
 * any attribute the CMS owns. `sy/bootstrap-wysiwyg` never interprets the
 * marker itself: the consumer writes it, usually in edit mode only.
 */
(function () {
	'use strict';

	function storeAttributes(element) {
		element.attributes['data-sylock-attributes'] = JSON.stringify(element.attributes);

		if (typeof element.attributes['data-sylock'] !== 'undefined' && element.attributes['data-sylock'] !== 'attributes') return;

		element.children.forEach(function (child) {
			if (child.type === CKEDITOR.NODE_ELEMENT) {
				storeAttributes(child);
			}
		});
	}

	function restoreAttributes(element) {
		if (typeof element.attributes['data-sylock-attributes'] !== 'undefined') {
			element.attributes = JSON.parse(element.attributes['data-sylock-attributes']);
			delete element.attributes['data-sylock-attributes'];
		}

		element.children.forEach(function (child) {
			if (child.type === CKEDITOR.NODE_ELEMENT) {
				restoreAttributes(child);
			}
		});
	}

	CKEDITOR.plugins.add('sywidget', {
		requires: 'widget',

		init: function (editor) {
			editor.widgets.add('sywidget', {
				upcast: function (element, data) {
					if (typeof element.attributes['data-sylock'] !== 'undefined') {
						if (element.attributes['data-sylock'] === 'attributes') {
							storeAttributes(element);
						} else {
							data.html = element.getHtml();
							data.attributes = element.attributes;
						}
						return true;
					}
					return false;
				},

				downcast: function (element) {
					if (typeof element.attributes['data-sylock-attributes'] !== 'undefined' && element.attributes['data-sylock'] === 'attributes') {
						if (this.editables.content) {
							element.setHtml(this.editables.content.getData());
						}
						restoreAttributes(element);
						var res = new CKEDITOR.htmlParser.element(element.name, element.attributes);
						res.setHtml(element.getHtml());
					} else {
						var html = this.data.html;
						var res = new CKEDITOR.htmlParser.element(element.name, this.data.attributes);
						res.setHtml(html);
					}
					return res;
				},

				editables: {
					content: '[data-sylock="attributes"]'
				}
			});
		}
	});
})();
