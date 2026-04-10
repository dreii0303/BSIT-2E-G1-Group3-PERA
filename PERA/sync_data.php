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

if (!isLoggedIn()) {
    echo json_encode(['success' => false, 'message' => 'Not logged in', 'authenticated' => false]);
    exit();
}

$userId = getCurrentUserId();
$conn = getDBConnection();

function normalizeDate($date) {
    if (!$date || $date === '0000-00-00' || $date === '0000-00-00 00:00:00' || empty($date)) {
        return date('Y-m-d');
    }

    $d = DateTime::createFromFormat('Y-m-d', $date);
    if ($d && $d->format('Y-m-d') === $date) {
        return $date;
    }

    $d = DateTime::createFromFormat('Y-m-d H:i:s', $date);
    if ($d && $d->format('Y-m-d') === date('Y-m-d', strtotime($date))) {
        return date('Y-m-d', strtotime($date));
    }

    return date('Y-m-d');
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $data = [];

    // First, keep any user_data keys for backwards compatibility
    $stmt = $conn->prepare('SELECT storage_key, data FROM user_data WHERE user_id = ?');
    if ($stmt) {
        $stmt->bind_param('i', $userId);
        $stmt->execute();
        $result = $stmt->get_result();

        while ($row = $result->fetch_assoc()) {
            $key = $row['storage_key'];
            $value = json_decode($row['data'], true);
            $data[$key] = is_array($value) ? $value : [];
        }

        $stmt->close();
    }

    // Bank accounts from dedicated table
    $stmt = $conn->prepare('SELECT id, account_name, balance, initial_balance, created_at FROM bank_accounts WHERE user_id = ?');
    if ($stmt) {
        $stmt->bind_param('i', $userId);
        $stmt->execute();
        $result = $stmt->get_result();

        $accounts = [];
        while ($row = $result->fetch_assoc()) {
            $accounts[] = [
                'id' => $row['id'],
                'name' => $row['account_name'],
                'balance' => $row['balance'],
                'initialBalance' => $row['initial_balance'],
                'createdAt' => $row['created_at']
            ];
        }
        $data['bankAccounts'] = $accounts;

        $stmt->close();
    }

    // Transactions from dedicated table
    $stmt = $conn->prepare('SELECT id, account_id, type, amount, description, category, date, created_at FROM transactions WHERE user_id = ? ORDER BY date DESC');
    if ($stmt) {
        $stmt->bind_param('i', $userId);
        $stmt->execute();
        $result = $stmt->get_result();

        $transactions = [];
        while ($row = $result->fetch_assoc()) {
            $transactions[] = [
                'id' => $row['id'],
                'account_id' => $row['account_id'],
                'type' => $row['type'],
                'amount' => $row['amount'],
                'description' => $row['description'],
                'category' => $row['category'],
                'date' => $row['date'],
                'createdAt' => $row['created_at']
            ];
        }
        $data['transactions'] = $transactions;

        $stmt->close();
    }

    // Recurring payments from dedicated table
    $stmt = $conn->prepare('SELECT id, description, category, deduction_source, amount, frequency, start_date, end_date, last_processed, next_due, next_payment_date, failed_attempts, times_deducted, total_paid, times_failed_insufficient_funds, created_at FROM recurring_payments WHERE user_id = ? ORDER BY next_due ASC');
    if ($stmt) {
        $stmt->bind_param('i', $userId);
        $stmt->execute();
        $result = $stmt->get_result();

        $recurringPayments = [];
        while ($row = $result->fetch_assoc()) {
            $startDate = ($row['start_date'] === '0000-00-00' || !$row['start_date']) ? date('Y-m-d') : $row['start_date'];
            $nextPaymentDate = ($row['next_payment_date'] === '0000-00-00' || !$row['next_payment_date']) ? $startDate : $row['next_payment_date'];

            $recurringPayments[] = [
                'id' => $row['id'],
                'description' => $row['description'],
                'category' => $row['category'],
                'deductionSource' => $row['deduction_source'],
                'amount' => $row['amount'],
                'frequency' => $row['frequency'],
                'startDate' => $startDate,
                'endDate' => $row['end_date'],
                'lastProcessed' => $row['last_processed'],
                'nextDue' => $row['next_due'],
                'nextPaymentDate' => $nextPaymentDate,
                'failedAttempts' => $row['failed_attempts'],
                'times_deducted' => $row['times_deducted'],
                'total_paid' => $row['total_paid'],
                'times_failed_insufficient_funds' => $row['times_failed_insufficient_funds'],
                'createdDate' => $row['created_at']
            ];
        }
        $data['recurringPayments'] = $recurringPayments;

        $stmt->close();
    }

    $conn->close();
    echo json_encode(['success' => true, 'data' => $data]);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $key = trim($input['key'] ?? '');
    $payload = $input['data'] ?? null;

    if (!$key || !is_array($payload)) {
        echo json_encode(['success' => false, 'message' => 'Invalid payload']);
        exit();
    }

    // Save dedicated tables when known keys are sent
    if ($key === 'bankAccounts') {
        $conn->begin_transaction();
        $stmt = $conn->prepare('DELETE FROM bank_accounts WHERE user_id = ?');
        if ($stmt) {
            $stmt->bind_param('i', $userId);
            $stmt->execute();
            $stmt->close();
        }

        $insert = $conn->prepare('INSERT INTO bank_accounts (user_id, account_name, balance, initial_balance, created_at) VALUES (?, ?, ?, ?, ?)');
        if ($insert) {
            foreach ($payload as $item) {
                $accountName = $item['name'] ?? '';
                $balance = isset($item['balance']) ? $item['balance'] : 0;
                $initialBalance = isset($item['initialBalance']) ? $item['initialBalance'] : $balance;
                $createdAt = $item['createdAt'] ?? date('Y-m-d H:i:s');
                $insert->bind_param('issss', $userId, $accountName, $balance, $initialBalance, $createdAt);
                $insert->execute();
            }
            $insert->close();
        }
        $conn->commit();
    } elseif ($key === 'transactions') {
        $conn->begin_transaction();
        $stmt = $conn->prepare('DELETE FROM transactions WHERE user_id = ?');
        if ($stmt) {
            $stmt->bind_param('i', $userId);
            $stmt->execute();
            $stmt->close();
        }

        // Prepare account name -> account_id lookup
        $accountMap = [];
        $nameStmt = $conn->prepare('SELECT id, account_name FROM bank_accounts WHERE user_id = ?');
        if ($nameStmt) {
            $nameStmt->bind_param('i', $userId);
            $nameStmt->execute();
            $rs = $nameStmt->get_result();
            while ($row = $rs->fetch_assoc()) {
                $accountMap[$row['account_name']] = $row['id'];
            }
            $nameStmt->close();
        }

        $insert = $conn->prepare('INSERT INTO transactions (user_id, account_id, type, amount, description, category, date, created_at) VALUES (?, NULLIF(?,0), ?, ?, ?, ?, ?, ?)');
        if ($insert) {
            foreach ($payload as $item) {
                $accountId = 0;
                $deductionSource = $item['deductionSource'] ?? '';
                $name = '';

                if ($deductionSource) {
                    // Prefer bank_<name> reference
                    if (strpos($deductionSource, 'bank_') === 0) {
                        $name = substr($deductionSource, 5);
                    } else {
                        $name = $deductionSource;
                    }
                }

                // Backwards compatibility: match by description if account name not available
                if ($name && isset($accountMap[$name])) {
                    $accountId = $accountMap[$name];
                } elseif (!$accountId && isset($item['description']) && isset($accountMap[$item['description']])) {
                    $accountId = $accountMap[$item['description']];
                }

                $type = $item['type'] ?? 'expense';
                $amount = isset($item['amount']) ? $item['amount'] : 0;
                $description = $item['description'] ?? '';
                $category = $item['category'] ?? '';
                $date = isset($item['date']) ? $item['date'] : date('Y-m-d');
                $createdAt = $item['createdAt'] ?? date('Y-m-d H:i:s');

                $insert->bind_param('iisdssss', $userId, $accountId, $type, $amount, $description, $category, $date, $createdAt);
                $insert->execute();
            }
            $insert->close();
        }
        $conn->commit();
    } elseif ($key === 'recurringPayments') {
        $conn->begin_transaction();
        $stmt = $conn->prepare('DELETE FROM recurring_payments WHERE user_id = ?');
        if ($stmt) {
            $stmt->bind_param('i', $userId);
            $stmt->execute();
            $stmt->close();
        }

        $insert = $conn->prepare('INSERT INTO recurring_payments (user_id, description, category, deduction_source, amount, frequency, start_date, end_date, last_processed, next_due, next_payment_date, failed_attempts, times_deducted, total_paid, times_failed_insufficient_funds, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        if ($insert) {
            foreach ($payload as $item) {
                $description = $item['description'] ?? '';
                $category = $item['category'] ?? '';
                $deductionSource = $item['deductionSource'] ?? '';
                $amount = isset($item['amount']) ? (float)$item['amount'] : 0;
                $frequency = $item['frequency'] ?? 'monthly';
                
                // Always normalize the start date - this is critical
                $startDate = !empty($item['startDate']) ? normalizeDate($item['startDate']) : date('Y-m-d');
                
                // Handle optional end date
                $endDateRaw = $item['endDate'] ?? null;
                $endDate = (!empty($endDateRaw) && $endDateRaw !== '0000-00-00') ? normalizeDate($endDateRaw) : null;
                
                // Handle optional last processed date
                $lastProcessedRaw = $item['lastProcessed'] ?? null;
                $lastProcessed = (!empty($lastProcessedRaw) && $lastProcessedRaw !== '0000-00-00') ? normalizeDate($lastProcessedRaw) : null;
                
                // Set next due and next payment date - these are critical for processing
                $nextPaymentDateRaw = $item['nextPaymentDate'] ?? null;
                $nextDue = !empty($nextPaymentDateRaw) ? normalizeDate($nextPaymentDateRaw) : $startDate;
                $nextPaymentDate = !empty($nextPaymentDateRaw) ? normalizeDate($nextPaymentDateRaw) : $startDate;
                
                $failedAttempts = isset($item['failedAttempts']) ? (int)$item['failedAttempts'] : 0;
                $timesDeducted = isset($item['times_deducted']) ? (int)$item['times_deducted'] : 0;
                $totalPaid = isset($item['total_paid']) ? (float)$item['total_paid'] : 0;
                $timesFailedInsufficientFunds = isset($item['times_failed_insufficient_funds']) ? (int)$item['times_failed_insufficient_funds'] : 0;
                
                // Handle created_at - always ensure we have a valid datetime in Manila time
                $createdAtRaw = $item['createdDate'] ?? null;
                if (!empty($createdAtRaw) && $createdAtRaw !== '0000-00-00 00:00:00') {
                    // Use the provided createdDate in YYYY-MM-DD HH:MM:SS format
                    $createdAt = $createdAtRaw;
                } else {
                    // Fallback to current time in Manila timezone (config.php sets this)
                    $createdAt = date('Y-m-d H:i:s');
                }

                $insert->bind_param('isssdssssssiiiii', $userId, $description, $category, $deductionSource, $amount, $frequency, $startDate, $endDate, $lastProcessed, $nextDue, $nextPaymentDate, $failedAttempts, $timesDeducted, $totalPaid, $timesFailedInsufficientFunds, $createdAt);
                $insert->execute();
            }
            $insert->close();
        }
        $conn->commit();
    }

    // Keep old sync data approach for non-dedicated keys
    $jsonData = json_encode($payload);
    $stmt = $conn->prepare('INSERT INTO user_data (user_id, storage_key, data) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)');
    if (!$stmt) {
        echo json_encode(['success' => false, 'message' => 'Database prepare failed']);
        exit();
    }

    $stmt->bind_param('iss', $userId, $key, $jsonData);

    if ($stmt->execute()) {
        echo json_encode(['success' => true, 'message' => 'Data saved']);
    } else {
        echo json_encode(['success' => false, 'message' => 'Failed saving data']);
    }

    $stmt->close();
    $conn->close();
    exit();
}

echo json_encode(['success' => false, 'message' => 'Invalid request method']);
exit();
