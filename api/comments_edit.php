<?php
/**
 * COMMENTS_EDIT.PHP
 * POST /api/comments_edit.php  Body: { id, name, comment }
 *
 * Admin-only — same session gate as comments_delete.php. Same
 * sanitize/length rules as comments_post.php (trim, strip tags, cap at
 * the config.php length limits) so an edit can't introduce anything a
 * fresh post couldn't.
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

$id          = isset($input['id']) ? (int) $input['id'] : 0;
$name        = isset($input['name']) ? trim((string) $input['name']) : '';
$commentText = isset($input['comment']) ? trim((string) $input['comment']) : '';

if ($id <= 0) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid comment id']);
    exit;
}

if ($name === '' || $commentText === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Name and comment are both required']);
    exit;
}

if (mb_strlen($name) > COMMENT_NAME_MAX_LENGTH || mb_strlen($commentText) > COMMENT_TEXT_MAX_LENGTH) {
    http_response_code(400);
    echo json_encode(['error' => 'Name or comment is too long']);
    exit;
}

// Same rule as comments_post.php: render as plain text only, never HTML.
$name        = strip_tags($name);
$commentText = strip_tags($commentText);

try {
    $stmt = $pdo->prepare(
        'UPDATE comments SET name = :name, comment_text = :comment_text WHERE id = :id'
    );
    $stmt->execute(['name' => $name, 'comment_text' => $commentText, 'id' => $id]);

    if ($stmt->rowCount() === 0) {
        // Either the id doesn't exist, or the new values matched the
        // old ones exactly (rowCount is 0 either way) — check
        // existence explicitly so a no-op save isn't reported as a 404.
        $check = $pdo->prepare('SELECT 1 FROM comments WHERE id = :id');
        $check->execute(['id' => $id]);
        if (!$check->fetchColumn()) {
            http_response_code(404);
            echo json_encode(['error' => 'Comment not found']);
            exit;
        }
    }

    echo json_encode([
        'success' => true,
        'comment' => ['id' => $id, 'name' => $name, 'comment_text' => $commentText],
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Could not save comment']);
}
