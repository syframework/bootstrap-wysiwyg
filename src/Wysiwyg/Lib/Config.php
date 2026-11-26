<?php
namespace Sy\Bootstrap\Wysiwyg\Lib;

use InvalidArgumentException;

/**
 * Validated, JSON-safe view of the editor component options.
 *
 * The component options are the PHP contract; the JSON produced here is the JS
 * contract (§2.2 of the plan). Every key is written once, in resolve(): the
 * engine never reads a PHP option name, and an unknown PHP option is ignored
 * rather than forwarded.
 *
 * Nothing in the output can be a PHP object. `config` carries a CKEditor
 * configuration that the engine merges into its own options, so an object
 * would silently become `{}` in JSON; values are checked recursively.
 */
class Config {

	const ELEMENT_ID_PATTERN = '/^[A-Za-z][A-Za-z0-9_-]*$/';

	/** @var string[] */
	const MODES = ['inline', 'classic'];

	/** @var string[] */
	const UPLOAD_MODES = ['ajax', 'dialog'];

	/** @var string[] */
	const UPLOAD_TYPES = ['image', 'file'];

	/** Written by the engine itself (§2.4): a consumer must not shadow them. */
	const RESERVED_SAVE_KEYS = ['content', 'csrf'];

	const RESERVED_LOAD_KEYS = ['ts'];

	/** @var array */
	private $options;

	private function __construct(array $options) {
		$this->options = $options;
	}

	/**
	 * Validate raw component options and map them to the JS keys.
	 *
	 * @param array $raw
	 * @return self
	 * @throws InvalidArgumentException
	 */
	public static function resolve(array $raw) {
		$id = self::elementId($raw);
		$assets = self::assets($raw);
		$components = self::components($raw);
		$templates = self::nullableString($raw, 'templates');
		$templatesFiles = self::templatesFiles($raw, $assets);

		if (($templates !== null or $templatesFiles !== []) and $assets['ckeditorRoot'] === '') {
			throw new InvalidArgumentException('assets.ckeditor-root is required when templates or templates-files are set');
		}
		if ($components['enabled'] and $assets['plugins'] === '') {
			throw new InvalidArgumentException('assets.plugins is required when components.enabled is true');
		}

		return new self([
			// Identity
			'id'        => $id,
			'mode'      => self::enum($raw, 'mode', self::MODES, 'inline'),
			'container' => self::bool($raw, 'container', true),
			'editable'  => self::bool($raw, 'editable', true),
			'content'   => self::string($raw, 'content', ''),

			// Network
			'loadUrl'     => self::nullableString($raw, 'load-url'),
			'loadData'    => self::scalarMap($raw, 'load-data', self::RESERVED_LOAD_KEYS),
			'saveUrl'     => self::nullableString($raw, 'save-url'),
			'saveData'    => self::scalarMap($raw, 'save-data', self::RESERVED_SAVE_KEYS),
			'csrf'        => self::nullableString($raw, 'csrf'),
			'csrfUrl'     => self::nullableString($raw, 'csrf-url'),
			'csrfRefresh' => self::int($raw, 'csrf-refresh', 0, 0),
			'request'     => [
				'credentials' => self::string($raw, 'request.credentials', 'same-origin'),
				'headers'     => self::scalarMap($raw, 'request.headers'),
			],

			// Uploads
			'upload' => self::upload($raw),

			// CKEditor
			'config'               => self::jsonSafe($raw['config'] ?? [], 'config'),
			'allowedContent'       => self::allowedContent($raw),
			'preserveEmpty'        => self::stringList($raw, 'preserve-empty', ['span', 'i']),
			'normalizeEmptyBlocks' => self::bool($raw, 'normalize-empty-blocks', true),
			'templates'            => $templates,
			'templatesFiles'       => $templatesFiles,
			'extraPlugins'         => self::stringList($raw, 'extra-plugins', []),
			'removePlugins'        => self::stringList($raw, 'remove-plugins', []),

			// Components
			'components' => $components,

			// Misc
			'translations'    => self::scalarMap($raw, 'translations'),
			'translateUrl'    => self::nullableString($raw, 'translate-url'),
			'translateLang'   => self::nullableString($raw, 'translate-lang'),
			'translateLabels' => self::scalarMap($raw, 'translate-labels'),
			'guardUnload'     => self::bool($raw, 'guard-unload', true),
			'autosave'        => self::autosave($raw),
			'assets'          => $assets,
		]);
	}

	/**
	 * The JS contract, safe to inline in a `<script>` block.
	 *
	 * JSON_HEX_TAG is what keeps a `</script>` inside `config` or `content`
	 * from closing the block.
	 *
	 * @return string
	 */
	public function json() {
		$json = json_encode(
			$this->options,
			JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE
		);
		if ($json === false) {
			throw new InvalidArgumentException('Options are not JSON encodable: ' . json_last_error_msg());
		}
		return $json;
	}

	/**
	 * @return array
	 */
	public function toArray() {
		return $this->options;
	}

	/**
	 * @return string
	 */
	public function id() {
		return $this->options['id'];
	}

	/**
	 * @return string
	 */
	public function mode() {
		return $this->options['mode'];
	}

	/**
	 * @return bool
	 */
	public function container() {
		return $this->options['container'];
	}

	/**
	 * @return bool
	 */
	public function editable() {
		return $this->options['editable'];
	}

	/**
	 * @return string
	 */
	public function content() {
		return $this->options['content'];
	}

	/**
	 * @param string $key engine, ckeditorJs, ckeditorRoot, plugins
	 * @return string
	 */
	public function asset($key) {
		return $this->options['assets'][$key];
	}

	/**
	 * Value at a dot-separated path, null when absent.
	 *
	 * A dotted path is what lets one option name (`components.enabled`) be read
	 * from the nested array without a manual `??` at every level.
	 *
	 * @param array $raw
	 * @param string $path
	 * @return mixed
	 */
	private static function dig(array $raw, $path) {
		$value = $raw;
		foreach (explode('.', $path) as $part) {
			if (!is_array($value) or !array_key_exists($part, $value)) return null;
			$value = $value[$part];
		}
		return $value;
	}

	/**
	 * @param array $raw
	 * @return string
	 */
	private static function elementId(array $raw) {
		$id = self::dig($raw, 'element-id');
		if (!is_string($id) or !preg_match(self::ELEMENT_ID_PATTERN, $id)) {
			throw new InvalidArgumentException('element-id is required and must match ' . self::ELEMENT_ID_PATTERN);
		}
		return $id;
	}

	/**
	 * @param array $raw
	 * @param string $key
	 * @param string[] $allowed
	 * @param string $default
	 * @return string
	 */
	private static function enum(array $raw, $key, array $allowed, $default) {
		$value = self::dig($raw, $key);
		if ($value === null) return $default;
		if (!is_string($value) or !in_array($value, $allowed, true)) {
			throw new InvalidArgumentException("$key must be one of: " . implode(', ', $allowed));
		}
		return $value;
	}

	/**
	 * @param array $raw
	 * @param string $key
	 * @param bool $default
	 * @return bool
	 */
	private static function bool(array $raw, $key, $default) {
		$value = self::dig($raw, $key);
		if ($value === null) return $default;
		if (!is_bool($value)) throw new InvalidArgumentException("$key must be a boolean");
		return $value;
	}

	/**
	 * @param array $raw
	 * @param string $key
	 * @param int $default
	 * @param int $min
	 * @return int
	 */
	private static function int(array $raw, $key, $default, $min) {
		$value = self::dig($raw, $key);
		if ($value === null) return $default;
		if (!is_int($value) or $value < $min) {
			throw new InvalidArgumentException("$key must be an integer >= $min");
		}
		return $value;
	}

	/**
	 * @param array $raw
	 * @param string $key
	 * @param string $default
	 * @return string
	 */
	private static function string(array $raw, $key, $default) {
		$value = self::dig($raw, $key);
		if ($value === null) return $default;
		if (!is_string($value)) throw new InvalidArgumentException("$key must be a string");
		return $value;
	}

	/**
	 * An empty string means "not set": no consumer should have to write null.
	 *
	 * @param array $raw
	 * @param string $key
	 * @return string|null
	 */
	private static function nullableString(array $raw, $key) {
		$value = self::string($raw, $key, '');
		return $value === '' ? null : $value;
	}

	/**
	 * @param array $raw
	 * @param string $key
	 * @param string[] $default
	 * @return string[]
	 */
	private static function stringList(array $raw, $key, array $default) {
		$value = self::dig($raw, $key);
		if ($value === null) return $default;
		if (!is_array($value) or !array_is_list($value)) {
			throw new InvalidArgumentException("$key must be a list of strings");
		}
		foreach ($value as $item) {
			if (!is_string($item)) throw new InvalidArgumentException("$key must contain strings only");
		}
		return array_values($value);
	}

	/**
	 * A map with string keys and scalar values: the shape of a query string or
	 * a POST body.
	 *
	 * @param array $raw
	 * @param string $key
	 * @param string[] $reserved Keys the engine writes itself
	 * @return array
	 */
	private static function scalarMap(array $raw, $key, array $reserved = []) {
		$value = self::dig($raw, $key);
		if ($value === null) return [];
		if (!is_array($value)) throw new InvalidArgumentException("$key must be an array");

		$result = [];
		foreach ($value as $k => $v) {
			if (!is_string($k)) throw new InvalidArgumentException("$key keys must be strings");
			if (in_array($k, $reserved, true)) {
				throw new InvalidArgumentException("$key must not contain the reserved key \"$k\"");
			}
			if (!is_scalar($v) and !is_null($v)) {
				throw new InvalidArgumentException("$key values must be scalars");
			}
			$result[$k] = $v;
		}
		return $result;
	}

	/**
	 * CKEditor configuration: any structure of scalars and arrays, no object.
	 *
	 * @param mixed $value
	 * @param string $name
	 * @return mixed
	 */
	private static function jsonSafe($value, $name) {
		if (is_scalar($value) or is_null($value)) return $value;
		if (!is_array($value)) throw new InvalidArgumentException("$name must be JSON-safe (scalars and arrays only)");
		$result = [];
		foreach ($value as $k => $v) {
			if (!is_string($k) and !is_int($k)) throw new InvalidArgumentException("$name keys must be strings or integers");
			$result[$k] = self::jsonSafe($v, $name . '.' . $k);
		}
		return $result;
	}

	/**
	 * `null` (CKEditor default), `true` (allow everything) or an ACF array.
	 *
	 * @param array $raw
	 * @return bool|array|null
	 */
	private static function allowedContent(array $raw) {
		$value = $raw['allowed-content'] ?? null;
		if (is_null($value) or is_bool($value)) return $value;
		if (!is_array($value)) {
			throw new InvalidArgumentException('allowed-content must be null, true or an array');
		}
		return self::jsonSafe($value, 'allowed-content');
	}

	/**
	 * @param array $raw
	 * @return array
	 */
	private static function upload(array $raw) {
		$upload = [];
		foreach (self::UPLOAD_TYPES as $type) {
			$upload[$type] = [
				'browse' => self::nullableString($raw, "upload.$type.browse"),
				'upload' => self::nullableString($raw, "upload.$type.upload"),
				'mode'   => self::enum($raw, "upload.$type.mode", self::UPLOAD_MODES, 'ajax'),
				'window' => [
					'width'  => self::int($raw, "upload.$type.window.width", 400, 1),
					'height' => self::int($raw, "upload.$type.window.height", 400, 1),
				],
			];
		}
		return $upload;
	}

	/**
	 * @param array $raw
	 * @return array
	 */
	private static function components(array $raw) {
		$allowlist = [];
		foreach (self::stringList($raw, 'components.allowlist', []) as $class) {
			$class = ltrim(trim($class), '\\');
			if ($class !== '') $allowlist[] = $class;
		}
		$allowlist = array_values(array_unique($allowlist));

		$components = [
			'enabled'    => self::bool($raw, 'components.enabled', false),
			'allowlist'  => $allowlist,
			'reportOnly' => self::bool($raw, 'components.report-only', false),
			'renderUrl'  => self::nullableString($raw, 'components.render-url'),
		];

		if ($components['enabled']) {
			$metadata = ComponentMeta::describe($allowlist);
			if ($metadata !== []) $components['metadata'] = $metadata;
		}

		return $components;
	}

	/**
	 * @param array $raw
	 * @return array
	 */
	private static function autosave(array $raw) {
		return [
			'interval'      => self::int($raw, 'autosave.interval', 0, 0),
			'onBlur'        => self::bool($raw, 'autosave.on-blur', false),
			'onDialogClose' => self::bool($raw, 'autosave.on-dialog-close', false),
		];
	}

	/**
	 * @param array $raw
	 * @return array
	 */
	private static function assets(array $raw) {
		$engine = self::string($raw, 'assets.engine', '');
		if ($engine === '') throw new InvalidArgumentException('assets.engine is required');

		$ckeditorJs = self::string($raw, 'assets.ckeditor-js', '');
		if ($ckeditorJs === '') throw new InvalidArgumentException('assets.ckeditor-js is required');

		return [
			'engine'       => $engine,
			'ckeditorJs'   => $ckeditorJs,
			'ckeditorRoot' => self::string($raw, 'assets.ckeditor-root', ''),
			'plugins'      => self::string($raw, 'assets.plugins', ''),
		];
	}

	/**
	 * `{LANG}` and `{CKEDITOR_ROOT}` are substituted by PHP: the JS engine never
	 * builds a path from the current language.
	 *
	 * @param array $raw
	 * @param array $assets
	 * @return string[]
	 */
	private static function templatesFiles(array $raw, array $assets) {
		$files = self::stringList($raw, 'templates-files', []);
		$search = ['{LANG}', '{CKEDITOR_ROOT}'];
		$replace = [defined('LANG') ? LANG : '', $assets['ckeditorRoot']];
		foreach ($files as $i => $file) {
			$files[$i] = str_replace($search, $replace, $file);
		}
		return $files;
	}

}
