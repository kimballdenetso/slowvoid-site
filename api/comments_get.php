<?php
/**
 * COMMENTS_GET.PHP
 * GET /api/comments_get.php?track_id=track-1
 * Returns every comment for a track, ordered by where it falls in the
 * track (not by when it was posted), so comments.js can render them in
 * timeline order.
 */

require __DIR__ . '/db.php';

header('Content-Type: application/json');

$trackId = isset($_GET['track_id']) ? trim($_GET['track_id']) : '';

if ($trackId === '') {
    http_response_code(400);
    echo json_encode(['error' => 'track_id is required']);
    exit;
}

try {
    $stmt = $pdo->prepare(
        'SELECT id, timestamp_seconds, name, comment_text, created_at
         FROM comments
         WHERE track_id = :track_id
         ORDER BY timestamp_seconds ASC'
    );
    $stmt->execute(['track_id' => $trackId]);

    echo json_encode(['comments' => $stmt->fetchAll()]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Could not load comments']);
}
