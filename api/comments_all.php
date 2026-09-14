<?php
/**
 * COMMENTS_ALL.PHP
 * GET /api/comments_all.php
 *
 * Every comment across every track, for the in-page admin editor
 * (js/admin.js). Same session gate as comments_delete.php / admin.php.
 * comments_get.php stays scoped to one track_id for the public
 * timeline — this is the admin-only, all-tracks version of it.
 */

require __DIR__ . '/db.php';
session_start();

header('Content-Type: application/json');

if (empty($_SESSION['is_admin'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Not authorized']);
    exit;
}

try {
    $stmt = $pdo->query(
        'SELECT id, track_id, timestamp_seconds, name, comment_text, created_at
         FROM comments
         ORDER BY track_id ASC, timestamp_seconds ASC'
    );

    echo json_encode(['comments' => $stmt->fetchAll()]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Could not load comments']);
}
