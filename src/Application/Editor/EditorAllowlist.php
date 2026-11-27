<?php
namespace Sy\Bootstrap\Application\Editor;

use Sy\Bootstrap\Lib\Str;
use Sy\Bootstrap\Wysiwyg\Lib\ComponentFilter;

/**
 * The component allowlist of one editor endpoint.
 *
 * Two endpoints now answer about the same list — `editor/<item>/render`
 * renders an allowlisted class, `editor/<item>/metadata` describes the same
 * classes — so the resolution lives here instead of in one of them. The method
 * names keep their `render*` prefix: they are documented consumer hooks since
 * `1.9.0`, and renaming them would break every class that overrides one.
 *
 * A consumer inherits the defaults and overrides a hook only when its business
 * differs: `renderDefaultAllowlist()` reads the class constant
 * `COMPONENT_ALLOWLIST`, `renderEditorKey()` derives the `WYSIWYG_COMPONENT_
 * ALLOWLIST` key from the action (`Article` -> `article`).
 *
 * This trait authorizes nothing by itself: it resolves what the consumer
 * declared, and `ComponentFilter` / `ComponentRenderer` / the render endpoint
 * keep enforcing it.
 */
trait EditorAllowlist {

	/**
	 * Resolved allowlist: the project entries merged with the consumer default.
	 *
	 * @return string[]
	 */
	protected function renderAllowlist(): array {
		return ComponentFilter::allowlist($this->renderEditorKey(), $this->renderDefaultAllowlist());
	}

	/**
	 * Editor key used by `WYSIWYG_COMPONENT_ALLOWLIST`, derived from the action
	 * like `CkFile::requestItem()` does for the upload directory: `Article` ->
	 * `article`, `ContentTranslation` -> `content_translation`.
	 *
	 * @return string
	 */
	protected function renderEditorKey(): string {
		return str_replace('_', '-', Str::camlToSnake(is_string($this->action) ? $this->action : ''));
	}

	/**
	 * Consumer default allowlist, read from `COMPONENT_ALLOWLIST` when the class
	 * declares it (empty otherwise: the filter is then disabled, C98).
	 *
	 * @return string[]
	 */
	protected function renderDefaultAllowlist(): array {
		$constant = static::class . '::COMPONENT_ALLOWLIST';
		return defined($constant) ? (array) constant($constant) : [];
	}

}
