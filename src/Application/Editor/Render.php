<?php
namespace Sy\Bootstrap\Application\Editor;

use Sy\Bootstrap\Wysiwyg\Lib\ComponentArgs;

/**
 * Shared `editor/<item>/render` endpoint.
 *
 * The `sycomponent` widget posts `component` and `args` to
 * `components.render-url` after an insertion or an edit and injects the
 * returned HTML. Every consumer needs the same work: check the allowlist,
 * decode the arguments, instantiate, pass the translators, answer `{html}`.
 * Only the language and the translation directories are consumer-specific, so
 * they are hooks with a usable default.
 *
 * A consumer only writes:
 *
 *   class Content extends \Sy\Bootstrap\Component\Api {
 *       use CkFile;
 *       use Render;
 *
 *       protected function renderTranslators(string $lang): array {
 *           return [LANG_DIR, __DIR__ . '/../../../lang/bootstrap-cms'];
 *       }
 *   }
 *
 * The same-origin check is done by `Application\Editor::dispatch()` and the
 * business rule by the consumer's own `security()`, which `Api::dispatch()`
 * calls before this action.
 */
trait Render {

	use EditorAllowlist;

	/**
	 * Render one allowlisted component for the editor preview.
	 *
	 * The response contains the rendered HTML, never the source slot.
	 */
	public function renderAction() {
		$component = $this->post('component');
		$args      = $this->post('args');
		$class     = ltrim(trim((string) $component), '\\');
		$allowlist = $this->renderAllowlist();

		if ($class === '' or !in_array($class, $allowlist, true) or !class_exists($class)) {
			return $this->requestError(['message' => 'Component not allowed']);
		}

		$decoded = [];
		if (is_string($args) and trim($args) !== '') {
			$decoded = json_decode($args, true);
			if (!is_array($decoded)) {
				return $this->requestError(['message' => 'Invalid component arguments']);
			}
		}

		$reason = ComponentArgs::validate($class, $decoded);
		if ($reason !== null) {
			return $this->requestError(['message' => 'Invalid component arguments: ' . $reason]);
		}

		$lang = $this->renderLanguage();
		foreach ($this->renderTranslators($lang) as $directory) {
			$this->addTranslator($directory, 'php', $lang);
		}

		try {
			$html = $this->renderComponent($class, $decoded);
		} catch (\Throwable $e) {
			$this->logWarning($e);
			return $this->requestError(['message' => 'Component render failed']);
		}

		return $this->ok(['status' => 'ok', 'html' => $html]);
	}

	/**
	 * Language of the rendered component.
	 *
	 * @return string
	 */
	protected function renderLanguage(): string {
		$service = \Project\Service\Container::getInstance();
		return $service->lang->getLang();
	}

	/**
	 * Translation directories registered before the render, most specific last.
	 *
	 * @param string $lang
	 * @return string[]
	 */
	protected function renderTranslators(string $lang): array {
		return [LANG_DIR];
	}

	/**
	 * Instantiate and render the component.
	 *
	 * The translators of the endpoint are passed to the component before the
	 * render, so a preview shows the same labels as the page. A consumer that
	 * overrides this hook and needs the default behaviour must alias it in the
	 * `use Render { renderComponent as renderTraitComponent; }` block: `parent::`
	 * designates the parent class, not the trait.
	 *
	 * @param string $class
	 * @param array  $args
	 * @return string
	 */
	protected function renderComponent(string $class, array $args): string {
		$instance = new $class(...$args);
		if ($instance instanceof \Sy\Component) {
			$instance->addTranslators($this->getTranslators());
		}
		return (string) $instance;
	}

}
