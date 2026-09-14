<?php
/**
 * ADMIN_SESSION.PHP
 * GET /api/admin_session.php -> { "is_admin": true|false }
 *
 * Lets the in-page panel (js/admin.js) check whether the visitor is
 * already logged in — e.g. they logged in via admin.php in another
 * tab, or reopened the panel later in the same browser session —
 * without having to infer it from a 401 on comments_all.php.
 */

require __DIR__ . '/db.php';
session_start();

header('Content-Type: application/json');

echo json_encode(['is_admin' => !empty($_SESSION['is_admin'])]);
