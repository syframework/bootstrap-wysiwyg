<?php
namespace Sy\Bootstrap\Wysiwyg;

use Sy\Bootstrap\Wysiwyg\Lib\Config;
use Sy\Bootstrap\Wysiwyg\Lib\EditorAssets;
use Sy\Component\WebComponent;

/**
 * Renders the editor container and hands the options to the JS engine.
 *
 * The component owns three things: the container element, the two script
 * links (CKEditor, then the engine), and the single inline call that creates
 * the instance. It knows nothing about the application: no `Project\`, no
 * route, no upload directory. Only `Config` reads the option names.
 *
 * `editable => false` renders the container and nothing else: a reader without
 * the update right gets sanitized HTML, no CKEditor download and no engine.
 */
class Editor extends WebComponent {

	/** @var Config */
	private $config;

	/**
	 * @param array $options See Lib\Config::resolve()
	 * @throws \InvalidArgumentException
	 */
	public function __construct(array $options = []) {
		parent::__construct();

		$this->config = Config::resolve($options);

		$this->setTemplateContent($this->containerHtml());

		if (!$this->config->editable()) return;

		// D19 bis: CKEditor first, the engine second. Both at the bottom, so the
		// inline call below runs after the two files are parsed and executed.
		$this->addJsLink($this->config->asset('ckeditorJs'), ['position' => self::JS_BOTTOM]);
		$this->addJsLink($this->engineUrl(), ['position' => self::JS_BOTTOM]);

		// addJsLink() emits `defer` scripts: the inline call must wait for
		// DOMContentLoaded, otherwise it runs before the engine defines the
		// SyWysiwyg global. The guard turns a missing asset into a readable
		// console error instead of an uncaught ReferenceError.
		$id      = json_encode($this->config->id());
		$options = $this->config->json();
		$this->addJsCode(
			'(function () {'
			. ' function create() {'
			. '  if (typeof SyWysiwyg === "undefined") {'
			. '   console.error("SyWysiwyg engine is not loaded: check assets.engine");'
			. '   return;'
			. '  }'
			. '  SyWysiwyg.create(document.getElementById(' . $id . '), ' . $options . ');'
			. ' }'
			. ' if (document.readyState === "loading") {'
			. '  document.addEventListener("DOMContentLoaded", create);'
			. ' } else {'
			. '  create();'
			. ' }'
			. '})();',
			['position' => self::JS_BOTTOM, 'type' => '']
		);
	}

	/**
	 * Engine URL, stamped with the asset version.
	 *
	 * The engine forwards the stamp to the `sy*` plugin URLs it registers, so
	 * engine and plugins are always refreshed together: CKEditor asks for
	 * external plugins with a fixed `?t=`, which no release ever changes.
	 *
	 * @return string
	 */
	private function engineUrl() {
		$url     = $this->config->asset('engine');
		$version = EditorAssets::version();
		if ($version === '') return $url;
		return $url . (strpos($url, '?') === false ? '?' : '&') . 'v=' . rawurlencode($version);
	}

	/**
	 * @return Config
	 */
	public function getConfig() {
		return $this->config;
	}

	/**
	 * `container => false` means the consumer already rendered the element: the
	 * engine attaches itself to `document.getElementById(element-id)`.
	 *
	 * @return string
	 */
	private function containerHtml() {
		if (!$this->config->container()) return '';

		// The id has passed ELEMENT_ID_PATTERN, so it cannot break out of the
		// attribute. The content is sanitized by the consumer (§2.9) and must
		// stay raw: escaping it would show the HTML source in the editor.
		return $this->config->mode() === 'classic'
			? '<textarea id="' . $this->config->id() . '">' . $this->config->content() . '</textarea>'
			: '<div id="' . $this->config->id() . '">' . $this->config->content() . '</div>';
	}

}
