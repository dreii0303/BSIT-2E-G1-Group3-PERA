<?php
// Set timezone to Manila (Asia/Manila is UTC+8)
date_default_timezone_set('Asia/Manila');

// Database configuration (InfinityFree)
define('DB_HOST', 'sql105.infinityfree.com');
// InfinityFree usually gives host like sqlXXX.epizy.com. Replace if needed.
define('DB_USER', 'if0_41476500');
define('DB_PASS', '8KUUHvFPP4L51');
define('DB_NAME', 'if0_41476500_pera_db');

// Create connection
function getDBConnection() {
    $conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);

    // Check connection
    if ($conn->connect_error) {
        die("Connection failed: " . $conn->connect_error);
    }

    return $conn;
}

// Start session for user management
session_start();

// Helper function to get current user ID
function getCurrentUserId() {
    return isset($_SESSION['user_id']) ? $_SESSION['user_id'] : null;
}

// Helper function to check if user is logged in
function isLoggedIn() {
    return isset($_SESSION['user_id']);
}

// Helper function to redirect if not logged in
function requireLogin() {
    if (!isLoggedIn()) {
        header('Location: login.php');
        exit();
    }
}
?>