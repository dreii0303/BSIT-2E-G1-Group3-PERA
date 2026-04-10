<?php
// CORS headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once 'config.php';

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['success' => false, 'message' => 'Invalid request method']);
        exit();
    }

    $email = trim($_POST['email'] ?? '');
    $password = $_POST['password'] ?? '';

    // Debug logging
    error_log("Login attempt: email=$email");

    if (empty($email) || empty($password)) {
        echo json_encode(['success' => false, 'message' => 'Email and password are required']);
        exit();
    }

    $conn = getDBConnection();

    if (!$conn) {
        error_log("Database connection failed");
        echo json_encode(['success' => false, 'message' => 'Database connection failed']);
        exit();
    }

    // Get user from database
    $stmt = $conn->prepare("SELECT id, name, email, password FROM users WHERE email = ?");
    if (!$stmt) {
        error_log("Prepare failed: " . $conn->error);
        echo json_encode(['success' => false, 'message' => 'Database prepare failed']);
        exit();
    }

    $stmt->bind_param("s", $email);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result->num_rows === 0) {
        error_log("User not found: $email");
        echo json_encode(['success' => false, 'message' => 'Invalid email or password']);
        $stmt->close();
        $conn->close();
        exit();
    }

    $user = $result->fetch_assoc();

    // Verify password
    if (password_verify($password, $user['password'])) {
        // Set session
        session_start();
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['user_name'] = $user['name'];
        $_SESSION['user_email'] = $user['email'];

        error_log("Login successful: " . $user['email']);
        echo json_encode(['success' => true, 'message' => 'Login successful']);
    } else {
        error_log("Password verification failed for: $email");
        echo json_encode(['success' => false, 'message' => 'Invalid email or password']);
    }

    $stmt->close();
    $conn->close();

} catch (Exception $e) {
    error_log("Login error: " . $e->getMessage());
    echo json_encode(['success' => false, 'message' => 'Server error: ' . $e->getMessage()]);
}
?>