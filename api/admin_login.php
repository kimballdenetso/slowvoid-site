<?php
/**
 * ADMIN_LOGIN.PHP
 * POST /api/admin_login.php  Body: { "password": "..." }
 *
 * Same password check as admin.php's inline login form, exposed as its
 * own JSON endpoint so the in-page admin panel (js/admin.js) can log in
 * via fetch instead of a full-page POST. Sets the same $_SESSION['is_admin']
 * flag admin.php and comments_delete.php already check, so logging in
 * here also logs you into admin.php (they share one session/cookie).
 */

require __DIR__ . '/db.php';
session_start();

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    $input = $_POST;
}

$password = isset($input['password']) ? (string) $input['password'] : '';

if ($password === '' || !password_verify($password, ADMIN_PASSWORD_HASH)) {
    usleep(400000); // small fixed delay to blunt naive brute-forcing
    http_response_code(401);
    echo json_encode(['error' => 'Incorrect password']);
    exit;
}

session_regenerate_id(true);
$_SESSION['is_admin'] = true;

echo json_encode(['success' => true]);
