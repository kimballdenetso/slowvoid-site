<?php
/**
 * DB.PHP
 * Opens the single PDO connection every endpoint uses. require this
 * (not config.php directly) from comments_get.php, comments_post.php,
 * comments_delete.php, and admin.php.
 */

require_once __DIR__ . '/config.php';

try {
    $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', DB_HOST, DB_PORT, DB_NAME);
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Database connection failed. Check config.php credentials.']);
    exit;
}
