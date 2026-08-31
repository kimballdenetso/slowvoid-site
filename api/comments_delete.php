<?php
/**
 * COMMENTS_DELETE.PHP
 * POST /api/comments_delete.php  Body: { "id": 17 }
 *
 * Admin-only. Requires the PHP session flag set by a successful login on
 * admin.php — this endpoint is never called from the public-facing
 * comments.js, only from admin.php's own delete buttons.
 */

require __DIR__ . '/db.php';
session_start();

header('Content-Type: application/json');

if (empty($_SESSION['is_admin'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Not authorized']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    $input = $_POST;
}

$id = isset($input['id']) ? (int) $input['id'] : 0;

if ($id <= 0) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid comment id']);
    exit;
}

try {
    $stmt = $pdo->prepare('DELETE FROM comments WHERE id = :id');
    $stmt->execute(['id' => $id]);

    echo json_encode(['success' => true, 'deleted' => $id]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Could not delete comment']);
}
