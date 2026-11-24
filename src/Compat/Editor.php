<?php
namespace Sy\Bootstrap\Application;

/**
 * Backward-compatible controller name for the `/editor` route.
 *
 * The real controller lives in Sy\Bootstrap\Wysiwyg\Application\Editor.
 * Composer's classmap loads this subclass when bootstrap's
 * Application::controllerClass() asks for Sy\Bootstrap\Application\Editor.
 * Without wysiwyg, the class does not exist and /editor returns 404.
 */
class Editor extends \Sy\Bootstrap\Wysiwyg\Application\Editor {

}
