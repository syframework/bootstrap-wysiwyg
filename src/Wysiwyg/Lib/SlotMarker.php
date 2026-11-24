<?php
namespace Sy\Bootstrap\Wysiwyg\Lib;

use Masterminds\HTML5;

/**
 * Slot markers shared by the CMS and Place consumers.
 *
 * A slot marker is an editing-only attribute carrying a stable index
 * (slot-1, slot-2, ...) used to restore the rendered inner HTML of a component
 * after the editor has reloaded the source. Markers must never reach the
 * database: strip() removes them from the saved source.
 */
class SlotMarker {

	/**
	 * Component marker attribute.
	 */
	private const MARKER = 'data-sycomponent';

	/**
	 * Editing-only slot attribute.
	 */
	private const SLOT = 'data-sycomponent-slot';

	/**
	 * Add an incremental slot attribute to every component of the fragment.
	 *
	 * @param string $html
	 * @return string
	 */
	public static function mark($html) {
		if (!is_string($html) or $html === '') return '';

		$html5    = new HTML5();
		$fragment = $html5->loadHTMLFragment($html);

		$index = 0;
		foreach (self::elements($fragment) as $element) {
			if (trim($element->getAttribute(self::MARKER)) === '') continue;
			$element->setAttribute(self::SLOT, 'slot-' . (++$index));
		}

		// saveHTML() re-serializes the fragment even without change; only pay
		// for it when at least one component was marked
		return $index === 0 ? $html : $html5->saveHTML($fragment);
	}

	/**
	 * Remove the slot attribute.
	 *
	 * @param string $html
	 * @return string
	 */
	public static function strip($html) {
		if (!is_string($html) or $html === '') return '';

		$html5    = new HTML5();
		$fragment = $html5->loadHTMLFragment($html);

		$changed = false;
		foreach (self::elements($fragment) as $element) {
			if (!$element->hasAttribute(self::SLOT)) continue;
			$element->removeAttribute(self::SLOT);
			$changed = true;
		}

		return $changed ? $html5->saveHTML($fragment) : $html;
	}

	/**
	 * Elements in document order.
	 *
	 * @param \DOMNode $node
	 * @return \DOMElement[]
	 */
	private static function elements($node) {
		$elements = [];
		foreach ($node->childNodes as $child) {
			if (!($child instanceof \DOMElement)) continue;
			$elements[] = $child;
			foreach (self::elements($child) as $descendant) $elements[] = $descendant;
		}
		return $elements;
	}

}
