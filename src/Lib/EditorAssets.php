<?php
namespace Sy\Bootstrap\Wysiwyg\Lib;

/**
 * CKEditor asset locations.
 *
 * Every value can be overridden by an application constant, so a project can
 * host the editor on a CDN or under another path. When neither the constant
 * nor WEB_ROOT is available (CLI, tests, Composer scripts), the methods throw a
 * clear RuntimeException instead of emitting a warning about an undefined
 * constant.
 */
class EditorAssets {

	/**
	 * WYSIWYG engine URL (the shared module rendered by the editor component).
	 *
	 * @return string
	 */
	public static function engine() {
		if (defined('WYSIWYG_ENGINE')) return WYSIWYG_ENGINE;
		self::requireWebRoot();
		return WEB_ROOT . '/assets/js/wysiwyg.js';
	}

	/**
	 * CKEditor 4 main script URL.
	 *
	 * @return string
	 */
	public static function js() {
		if (defined('CKEDITOR_JS')) return CKEDITOR_JS;
		return 'https://cdn.ckeditor.com/4.22.1/full-all/ckeditor.js';
	}

	/**
	 * CKEditor 4 installation root (plugins, templates, skins).
	 *
	 * @return string
	 */
	public static function root() {
		if (defined('CKEDITOR_ROOT')) return CKEDITOR_ROOT;
		self::requireWebRoot();
		return WEB_ROOT . '/assets/ckeditor';
	}

	/**
	 * CKEditor plugins delivered by the framework.
	 *
	 * @return string
	 */
	public static function plugins() {
		if (defined('WYSIWYG_PLUGINS')) return WYSIWYG_PLUGINS;
		self::requireWebRoot();
		return WEB_ROOT . '/assets/js/plugins';
	}

	/**
	 * @throws \RuntimeException
	 */
	private static function requireWebRoot() {
		if (!defined('WEB_ROOT')) {
			throw new \RuntimeException('WEB_ROOT is not defined');
		}
	}

}
