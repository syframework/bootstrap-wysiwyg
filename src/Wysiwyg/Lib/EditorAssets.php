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
	 * Version stamp of the engine assets.
	 *
	 * `Wysiwyg\Editor` loads the engine with `?v=<stamp>` and the engine
	 * forwards the stamp to the `sy*` plugin URLs. Without it, an upgraded
	 * install keeps the files the browser already fetched: CKEditor requests
	 * external plugins with a fixed `?t=`, and nothing else versioned the
	 * engine itself, so a new plugin could run against a stale engine (or the
	 * other way round) after a release.
	 *
	 * The stamp is the installed package version, then the engine file mtime;
	 * `WYSIWYG_VERSION` overrides both when a project ships the files itself.
	 *
	 * @return string Empty when no stamp is available.
	 */
	public static function version() {
		static $version = null;
		if ($version !== null) return $version;

		if (defined('WYSIWYG_VERSION')) return $version = (string) WYSIWYG_VERSION;

		// A released tag is the stamp a CDN should cache on. A dev install
		// (`dev-develop`) keeps the same version across commits, so the file
		// mtime is the only value that moves there.
		if (class_exists('\\Composer\\InstalledVersions')) {
			$pretty = \Composer\InstalledVersions::getPrettyVersion('sy/bootstrap-wysiwyg');
			if (is_string($pretty) and preg_match('/^v?\d+\.\d+/', $pretty) === 1) {
				return $version = $pretty;
			}
		}

		// src/Wysiwyg/Lib -> package root.
		$file = dirname(__DIR__, 3) . '/assets/js/wysiwyg.js';
		return $version = is_file($file) ? (string) filemtime($file) : '';
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
