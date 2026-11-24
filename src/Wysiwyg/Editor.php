<?php
namespace Sy\Bootstrap\Wysiwyg;

use Sy\Bootstrap\Wysiwyg\Lib\Config;
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
		$this->addJsLink($this->config->asset('engine'), ['position' => self::JS_BOTTOM]);
		$this->addJsCode(
			'SyWysiwyg.create(document.getElementById(' . json_encode($this->config->id()) . '), ' . $this->config->json() . ');',
			['position' => self::JS_BOTTOM, 'type' => '']
		);
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
