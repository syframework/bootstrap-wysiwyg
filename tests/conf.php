<?php
require __DIR__ . '/../vendor/autoload.php';

// Local monorepo tests: the sibling sy/bootstrap 2.0 sources are not installed
// in this package's vendor yet. Production resolves them through Composer.
spl_autoload_register(function ($class) {
	$prefix = 'Sy\\Bootstrap\\';
	if (strncmp($class, $prefix, strlen($prefix)) !== 0) return;

	$relative = substr($class, strlen($prefix));
	$file = __DIR__ . '/../../bootstrap/src/' . str_replace('\\', '/', $relative) . '.php';
	if (is_file($file)) require $file;
});

spl_autoload_register(function ($class) {
	$prefix = 'Masterminds\\';
	if (strncmp($class, $prefix, strlen($prefix)) !== 0) return;

	$relative = substr($class, strlen($prefix));
	$file = __DIR__ . '/../../bootstrap/vendor/masterminds/html5/src/' . str_replace('\\', '/', $relative) . '.php';
	if (is_file($file)) require $file;
});

define('WEB_ROOT', '/webroot');
define('CONTROLLER_TRIGGER', 'controller');
define('ACTION_TRIGGER', 'action');
define('ACTION_PARAM', 'action_param');
define('LANG_DIR', __DIR__);
define('LANG', 'fr');

if (!defined('UPLOAD_DIR')) {
	define('UPLOAD_DIR', sys_get_temp_dir() . '/sy-wysiwyg-upload-' . getmypid());
}
if (!defined('UPLOAD_ROOT')) {
	define('UPLOAD_ROOT', '/upload');
}


