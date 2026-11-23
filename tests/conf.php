<?php
require __DIR__ . '/../vendor/autoload.php';

// Config substitutes {LANG} in templates-files; the engine never builds a
// path from the current language.
define('LANG', 'fr');
