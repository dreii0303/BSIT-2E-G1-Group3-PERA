<?php
require_once 'config.php';

header('Content-Type: text/html');

echo "<h1>PERA Database Debug</h1>";

$conn = getDBConnection();
if (!$conn) {
    echo "<p style='color: red;'>❌ Database connection failed</p>";
    exit();
}

echo "<p style='color: green;'>✅ Database connection successful</p>";

// Check tables
$result = $conn->query("SHOW TABLES");
echo "<h2>Tables:</h2><ul>";
while ($row = $result->fetch_array()) {
    echo "<li>" . $row[0] . "</li>";
}
echo "</ul>";

// Check users
$result = $conn->query("SELECT id, name, email, created_at FROM users");
echo "<h2>Users (" . $result->num_rows . "):</h2><ul>";
while ($row = $result->fetch_assoc()) {
    echo "<li>ID: " . $row['id'] . ", Name: " . $row['name'] . ", Email: " . $row['email'] . ", Created: " . $row['created_at'] . "</li>";
}
echo "</ul>";

$conn->close();
?>