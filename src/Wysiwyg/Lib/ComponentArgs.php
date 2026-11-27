<?php
namespace Sy\Bootstrap\Wysiwyg\Lib;

/**
 * Sanity check of a `data-sycomponent-args` payload.
 *
 * The payload is spread as named arguments — `new $class(...$args)` — which is
 * what lets a reordered constructor keep the values already stored in the
 * database. It also means a stale or hand-written payload can fail in ways PHP
 * only reports as a generic `Error`: a parameter renamed in the class, a key
 * that is not a valid parameter name, or a positional array (`["48.1"]`) that
 * silently binds to the first parameter.
 *
 * `Render` answers `400` with the reason, `ComponentRenderer` logs it and
 * leaves the wrapper in place: in both cases the failure names the argument
 * instead of leaving a component that disappeared from the page.
 *
 * Read-only on purpose: nothing here decides *whether* a class may be rendered
 * (that is the allowlist) nor instantiates anything.
 */
class ComponentArgs {

	/**
	 * A named argument is a PHP parameter name.
	 *
	 * The dialog applies the same rule to its JSON textarea
	 * (`assets/js/plugins/sycomponent.js`): a change here must be mirrored
	 * there, and the client check is a courtesy — this one is the guard.
	 */
	const NAME_PATTERN = '/^[A-Za-z_][A-Za-z0-9_]*$/';

	/**
	 * Why the payload cannot be spread on `$class`, or null when it can.
	 *
	 * @param string $class
	 * @param array  $args
	 * @return string|null
	 */
	public static function validate(string $class, array $args): ?string {
		foreach (array_keys($args) as $key) {
			// A positional array carries integer keys: PHP would bind them by
			// position, which is the opposite of the named-argument contract.
			if (!is_string($key) or preg_match(self::NAME_PATTERN, $key) !== 1) {
				return 'invalid argument name "' . $key . '"';
			}
		}

		$known = self::parameterNames($class);
		// The class cannot be described (parameter it cannot reflect): let PHP
		// decide rather than refusing a payload that may well be valid.
		if ($known === null) return null;

		foreach (array_keys($args) as $key) {
			if (!in_array($key, $known, true)) {
				return 'unknown argument "' . $key . '" for ' . $class;
			}
		}

		return null;
	}

	/**
	 * Constructor parameter names of a class, null when it cannot be described.
	 *
	 * @param string $class
	 * @return string[]|null
	 */
	private static function parameterNames(string $class): ?array {
		$meta = ComponentMeta::describe([$class]);
		if (!isset($meta[$class]) or !is_array($meta[$class]['parameters'] ?? null)) return null;

		$names = [];
		foreach ($meta[$class]['parameters'] as $parameter) {
			if (isset($parameter['name']) and is_string($parameter['name'])) $names[] = $parameter['name'];
		}
		return $names;
	}

}
