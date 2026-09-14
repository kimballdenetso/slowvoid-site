<?php
/**
 * ADMIN_LOGOUT.PHP
 * POST /api/admin_logout.php
 *
 * Clears the admin session — the AJAX equivalent of admin.php's
 * ?logout=1 link, for the in-page panel's Log out button. Logging out
 * here also logs you out of admin.php, since it's the same session.
 */

require __DIR__ . '/db.php';
session_start();

header('Content-Type: application/json');

$_SESSION = [];
session_destroy();

echo json_encode(['success' => true]);
