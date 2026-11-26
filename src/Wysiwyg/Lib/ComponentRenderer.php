<?php
namespace Sy\Bootstrap\Wysiwyg\Lib;

use Masterminds\HTML5;
use Sy\Component\WebComponent;

/**
 * Replaces allowlisted data-sycomponent wrappers by their rendered component.
 *
 * The wrapper and its data-sycomponent / data-sycomponent-args attributes are
 * kept on purpose: HtmlSanitizer strips form controls on save, but the next
 * render rebuilds the component from the marker. This is what makes a server
 * component usable in Article content without storing its rendered HTML.
 */
class ComponentRenderer {

	/**
	 * @param string            $html      HTML fragment
	 * @param array             $allowlist Allowed component classes
	 * @param WebComponent|null $container Optional asset collector
	 * @return string
	 */
	public static function render(string $html, array $allowlist, ?WebComponent $container = null): string {
		if ($html === '' or !str_contains($html, 'data-sycomponent')) return $html;

		$allowlist = self::normalizeList($allowlist);
		$html5     = new HTML5();
		$fragment  = $html5->loadHTMLFragment($html);
		$document  = $fragment->ownerDocument;
		$changed   = false;

		foreach (self::collectElements($fragment) as $element) {
			$class = ltrim(trim($element->getAttribute('data-sycomponent')), '\\');
			if ($class === '' or !in_array($class, $allowlist, true)) continue;
			if (!class_exists($class)) {
				self::log("class \"$class\" not found");
				continue;
			}

			$args = self::args($element->getAttribute('data-sycomponent-args'));
			if ($args === null) {
				self::log("invalid arguments for \"$class\"");
				continue;
			}

			try {
				$component = new $class(...$args);
			} catch (\Throwable $e) {
				self::log("cannot instantiate \"$class\": " . $e->getMessage());
				continue;
			}

			if ($container !== null and $component instanceof WebComponent) {
				// Mirror Component::setVar(): the component inherits the
				// consumer translators. Attaching it to the container would
				// also work, but the source slot could collide with the
				// consumer's template variables.
				$component->addTranslators($container->getTranslators());
			}

			$rendered = (string) $component;
			while ($element->firstChild) $element->removeChild($element->firstChild);
			foreach (iterator_to_array($html5->loadHTMLFragment($rendered)->childNodes) as $child) {
				$element->appendChild($document->importNode($child, true));
			}

			if ($container !== null and $component instanceof WebComponent) {
				$container->mergeCss($component);
				$container->mergeJs($component);
			}

			$changed = true;
		}

		return $changed ? $html5->saveHTML($fragment) : $html;
	}

	/**
	 * @param string $args
	 * @return array|null
	 */
	private static function args(string $args) {
		$args = trim($args);
		if ($args === '') return [];

		$decoded = json_decode($args, true);
		if (json_last_error() !== JSON_ERROR_NONE) return null;

		return is_array($decoded) ? $decoded : null;
	}

	/**
	 * @param array $list
	 * @return array
	 */
	private static function normalizeList(array $list): array {
		$list = array_map(function ($class) {
			return ltrim(trim((string) $class), '\\');
		}, $list);
		$list = array_filter($list, function ($class) {
			return $class !== '';
		});

		return array_values(array_unique($list));
	}

	/**
	 * Depth-first list of elements, children included.
	 *
	 * @param \DOMNode $node
	 * @return \DOMElement[]
	 */
	private static function collectElements($node) {
		$elements = [];
		$stack    = [];
		foreach ($node->childNodes as $child) $stack[] = $child;

		while (!empty($stack)) {
			$current = array_pop($stack);
			if (!($current instanceof \DOMElement)) continue;
			$elements[] = $current;
			foreach ($current->childNodes as $child) $stack[] = $child;
		}

		return $elements;
	}

	/**
	 * @param string $message
	 */
	private static function log(string $message) {
		error_log('[sy/bootstrap-wysiwyg] ComponentRenderer: ' . $message);
	}

}
