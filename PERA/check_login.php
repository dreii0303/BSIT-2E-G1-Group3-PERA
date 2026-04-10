<?php
// CORS and JSON headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once 'config.php';

if (isLoggedIn()) {
    echo json_encode([
        'logged_in' => true,
        'user' => [
            'name' => isset($_SESSION['user_name']) ? $_SESSION['user_name'] : '',
            'email' => isset($_SESSION['user_email']) ? $_SESSION['user_email'] : ''
        ]
    ]);
} else {
    echo json_encode(['logged_in' => false]);
}

exit();
