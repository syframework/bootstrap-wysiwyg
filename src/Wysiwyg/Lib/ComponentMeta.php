<?php
namespace Sy\Bootstrap\Wysiwyg\Lib;

/**
 * Describes the allowlisted components for the insertion dialog.
 *
 * The dialog needs a human-readable label, a source slot and the constructor
 * parameters. They are derived here, once, from reflection: the browser side
 * only renders the fields and builds the arguments object. Unknown or
 * non-instantiable classes are skipped so the dialog falls back to its JSON
 * field for them.
 */
class ComponentMeta {

	/**
	 * @param array $allowlist Component class names
	 * @return array<string, array{label: string, slot: string, parameters: array}>
	 */
	public static function describe(array $allowlist): array {
		$meta = [];
		foreach ($allowlist as $class) {
			$class = ltrim(trim((string) $class), '\\');
			if ($class === '' or isset($meta[$class])) continue;
			if (!class_exists($class)) continue;

			try {
				$reflection = new \ReflectionClass($class);
			} catch (\ReflectionException $e) {
				continue;
			}
			if (!$reflection->isInstantiable()) continue;

			$parameters = [];
			$constructor = $reflection->getConstructor();
			if ($constructor !== null) {
				foreach ($constructor->getParameters() as $parameter) {
					$parameters[] = self::parameter($parameter);
				}
			}

			$meta[$class] = [
				'label'      => self::label($class),
				'slot'       => self::slot($class),
				'parameters' => $parameters,
			];
		}
		return $meta;
	}

	/**
	 * @param \ReflectionParameter $parameter
	 * @return array
	 */
	private static function parameter(\ReflectionParameter $parameter): array {
		$type     = $parameter->getType();
		$typeName = null;
		$nullable = true;

		if ($type instanceof \ReflectionNamedType) {
			$typeName = $type->getName();
			$nullable = $type->allowsNull();
		} elseif ($type instanceof \ReflectionUnionType) {
			$typeName = 'union';
			$nullable = $type->allowsNull();
		} elseif ($type instanceof \ReflectionIntersectionType) {
			$typeName = 'intersection';
			$nullable = $type->allowsNull();
		}

		$default    = null;
		$hasDefault = $parameter->isDefaultValueAvailable();
		if ($hasDefault) {
			try {
				$default = $parameter->getDefaultValue();
			} catch (\Throwable $e) {
				$hasDefault = false;
			}
			// Only JSON-serializable defaults can be previewed in the dialog.
			if ($hasDefault and !is_scalar($default) and $default !== null and !is_array($default)) {
				$hasDefault = false;
			}
			if ($hasDefault and json_encode($default) === false) {
				$hasDefault = false;
			}
		}

		return [
			'name'       => $parameter->getName(),
			'type'       => self::inputType($typeName),
			'required'   => !$parameter->isOptional(),
			'nullable'   => $nullable,
			'hasDefault' => $hasDefault,
			'default'    => $hasDefault ? $default : null,
			'variadic'   => $parameter->isVariadic(),
		];
	}

	/**
	 * @param string|null $type
	 * @return string
	 */
	private static function inputType(?string $type): string {
		return match ($type) {
			'string' => 'string',
			'int'    => 'int',
			'float'  => 'float',
			'bool'   => 'bool',
			'array'  => 'array',
			'mixed',
			null     => 'text',
			default  => 'json',
		};
	}

	/**
	 * Two last namespace segments, in CamelCase: Form\Contact → "Form Contact".
	 *
	 * @param string $class
	 * @return string
	 */
	private static function label(string $class): string {
		$parts = array_slice(explode('\\', $class), -2);
		$parts = array_map(function ($part) {
			return trim((string) preg_replace('/[_-]+/', ' ', $part));
		}, $parts);
		return implode(' ', $parts);
	}

	/**
	 * The source slot is derived from the class name: InlineStyle → {INLINE_STYLE}.
	 *
	 * @param string $class
	 * @return string
	 */
	private static function slot(string $class): string {
		$parts = explode('\\', $class);
		$short = (string) end($parts);
		$snake = self::snakeCase($short);
		return '{' . ($snake === '' ? 'SLOT' : $snake) . '}';
	}

	/**
	 * @param string $value
	 * @return string
	 */
	private static function humanize(string $value): string {
		$value = preg_replace('/([a-z0-9])([A-Z])/', '$1 $2', $value);
		$value = preg_replace('/([A-Z])([A-Z][a-z])/', '$1 $2', $value);
		return trim((string) preg_replace('/\s+/', ' ', $value));
	}

	/**
	 * @param string $value
	 * @return string
	 */
	private static function snakeCase(string $value): string {
		$value = preg_replace('/([a-z0-9])([A-Z])/', '$1_$2', $value);
		$value = preg_replace('/([A-Z])([A-Z][a-z])/', '$1_$2', $value);
		return strtoupper((string) $value);
	}

}
