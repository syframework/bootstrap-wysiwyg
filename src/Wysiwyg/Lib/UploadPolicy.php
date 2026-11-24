<?php
namespace Sy\Bootstrap\Wysiwyg\Lib;

/**
 * Allowed upload extensions for the CKEditor backend.
 *
 * The default list is owned by the package. A project can override it with
 * the WYSIWYG_UPLOAD_EXTENSIONS constant, either globally (image/file) or per
 * editor (article/content/place). The editor key is not a record id: every
 * editor of the same type shares the same policy.
 */
final class UploadPolicy {

	public const DEFAULT = [
		'image' => ['jpg', 'jpeg', 'png', 'gif', 'webp'],
		'file'  => ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'zip', 'txt', 'csv', 'mp3', 'mp4'],
	];

	/**
	 * Always rejected, even when a project configures them.
	 *
	 * SVG is excluded because it can carry scripts and is served from the
	 * application origin.
	 */
	public const DENIED = ['php', 'phtml', 'phar', 'cgi', 'pl', 'py', 'sh', 'html', 'htm', 'xhtml', 'svg', 'js', 'mjs'];

	/**
	 * @param string      $type   "image" or "file"
	 * @param string|null $editor Editor key (article, content, place)
	 * @return array
	 */
	public static function allowedExtensions(string $type, ?string $editor = null): array {
		$map = defined('WYSIWYG_UPLOAD_EXTENSIONS') ? WYSIWYG_UPLOAD_EXTENSIONS : [];

		// Fallback: global type override, then package default.
		$list = isset($map[$type]) ? $map[$type] : (self::DEFAULT[$type] ?? []);

		// Per-editor override wins when present.
		if ($editor !== null and isset($map[$editor][$type])) {
			$list = $map[$editor][$type];
		}

		$list = is_array($list) ? $list : [];
		$list = array_map(function ($ext) {
			return strtolower(ltrim(trim((string) $ext), '.'));
		}, $list);

		return array_values(array_unique(array_diff($list, self::DENIED)));
	}

}
