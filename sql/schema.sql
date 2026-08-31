-- ==========================================================================
-- SCHEMA.SQL
-- Comments table for timestamp comments. No user accounts — comments are
-- identified only by a name string, per the project plan.
--
-- Import via phpMyAdmin: MAMP's start page -> phpMyAdmin -> select/create
-- the `artist_site` database -> Import -> choose this file.
-- Or from the command line:
--   /Applications/MAMP/Library/bin/mysql -u root -proot -P 8889 -h 127.0.0.1 artist_site < schema.sql
-- ==========================================================================

CREATE DATABASE IF NOT EXISTS artist_site
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE artist_site;

CREATE TABLE IF NOT EXISTS comments (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  track_id           VARCHAR(100)  NOT NULL,          -- matches a track's `id` in js/main.js's TRACKS list
  timestamp_seconds  FLOAT         NOT NULL,          -- position in the track this comment was left at
  name               VARCHAR(80)   NOT NULL,          -- visitor-supplied display name, no account behind it
  comment_text       VARCHAR(500)  NOT NULL,
  created_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_hash            VARCHAR(64)   NULL,               -- sha256 of IP, used only for rate-limiting; never displayed

  INDEX idx_track_id (track_id),
  INDEX idx_ip_hash_created_at (ip_hash, created_at)
) ENGINE=InnoDB;
