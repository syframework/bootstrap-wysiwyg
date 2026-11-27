<?php
namespace Sy\Bootstrap\Wysiwyg\Lib;

/**
 * Server-side catalogue of the components one editor may host.
 *
 * It answers a single question — "which components can this editor insert, and
 * with which constructor parameters?" — and nothing else. Authorization stays
 * in `WYSIWYG_COMPONENT_ALLOWLIST`, enforced by `ComponentFilter`,
 * `ComponentRenderer` and the `editor/<item>/render` endpoint: a catalogue entry
 * never widens what those three accept, and nothing here reflects on a class the
 * project did not declare.
 *
 * The reflection work belongs to `ComponentMeta`; this class only dates the
 * result, so both the embedded `components.metadata` and the on-demand
 * `component-metadata-url` describe a component the same way.
 */
final class ComponentRegistry {

	/**
	 * Describe the allowlisted components of one editor.
	 *
	 * The order is the allowlist order: it is the order the consumer wants in
	 * the insertion dialog, and it keeps the payload byte-identical between two
	 * requests, which is what lets the endpoint derive an ETag from it.
	 *
	 * @param string   $editor    Editor key (article, content, place)
	 * @param string[] $allowlist Component class names
	 * @return array{editor: string, ts: int, components: array}
	 */
	public static function describe(string $editor, array $allowlist): array {
		$components = ComponentMeta::describe($allowlist);

		return [
			'editor'     => $editor,
			'ts'         => self::timestamp(array_keys($components)),
			'components' => $components,
		];
	}

	/**
	 * Last modification time of what the payload is derived from.
	 *
	 * A consumer turns it into an ETag: it changes when a described class is
	 * redeployed, or when the metadata algorithm changes, and never between two
	 * requests otherwise. It stays the algorithm's own modification time for an
	 * empty catalogue, so the value is always a positive integer.
	 *
	 * @param string[] $classes
	 * @return int
	 */
	private static function timestamp(array $classes): int {
		$ts = self::mtime(ComponentMeta::class);
		foreach ($classes as $class) {
			$ts = max($ts, self::mtime($class));
		}
		return $ts;
	}

	/**
	 * Modification time of the file a class is declared in, 0 when unknown.
	 *
	 * @param string $class
	 * @return int
	 */
	private static function mtime(string $class): int {
		try {
			$file = (new \ReflectionClass($class))->getFileName();
		} catch (\ReflectionException $e) {
			return 0;
		}
		if (!is_string($file)) return 0;

		$mtime = @filemtime($file);
		return $mtime === false ? 0 : (int) $mtime;
	}

}
