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

    $name = trim($_POST['name'] ?? '');
    $email = trim($_POST['email'] ?? '');
    $password = $_POST['password'] ?? '';

    // Debug logging
    error_log("Registration attempt: name=$name, email=$email");

    $errors = [];

    // Validate input
    if (empty($name) || strlen($name) < 3) {
        $errors[] = 'Name must be at least 3 characters';
    }

    if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $errors[] = 'Valid email is required';
    }

    if (empty($password) || strlen($password) < 6) {
        $errors[] = 'Password must be at least 6 characters';
    }

    if (!empty($errors)) {
        echo json_encode(['success' => false, 'message' => implode(', ', $errors)]);
        exit();
    }

    $conn = getDBConnection();

    if (!$conn) {
        error_log("Database connection failed");
        echo json_encode(['success' => false, 'message' => 'Database connection failed']);
        exit();
    }

    // Check if email already exists
    $stmt = $conn->prepare("SELECT id FROM users WHERE email = ?");
    if (!$stmt) {
        error_log("Prepare failed: " . $conn->error);
        echo json_encode(['success' => false, 'message' => 'Database error']);
        exit();
    }

    $stmt->bind_param("s", $email);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result->num_rows > 0) {
        echo json_encode(['success' => false, 'message' => 'Email already registered. Please log in or use a different email address.']);
        $stmt->close();
        $conn->close();
        exit();
    }
    $stmt->close();

    // Hash password
    $hashedPassword = password_hash($password, PASSWORD_DEFAULT);
    
    // Get current time in Manila timezone  
    $createdAt = date('Y-m-d H:i:s');

    // Insert new user with explicit created_at to ensure Manila time is used
    $stmt = $conn->prepare("INSERT INTO users (name, email, password, created_at) VALUES (?, ?, ?, ?)");
    if (!$stmt) {
        error_log("Insert prepare failed: " . $conn->error);
        echo json_encode(['success' => false, 'message' => 'Database error']);
        exit();
    }

    $stmt->bind_param("ssss", $name, $email, $hashedPassword, $createdAt);

    if ($stmt->execute()) {
        error_log("User registered successfully: $email");
        echo json_encode(['success' => true, 'message' => 'Account created successfully']);
    } else {
        error_log("Insert failed: " . $stmt->error);
        echo json_encode(['success' => false, 'message' => 'Failed to create account']);
    }

    $stmt->close();
    $conn->close();

} catch (Exception $e) {
    error_log("Registration error: " . $e->getMessage());
    echo json_encode(['success' => false, 'message' => 'Server error: ' . $e->getMessage()]);
}
?>