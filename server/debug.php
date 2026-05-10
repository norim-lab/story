<?php
header('Content-Type: text/html; charset=utf-8');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
$allowedOrigins = ['http://localhost', 'http://localhost:5173', 'http://127.0.0.1', 'http://127.0.0.1:5173', 'https://story.zeitblytz.media'];
if (in_array($origin, $allowedOrigins) || strpos($origin, 'localhost') !== false || strpos($origin, '127.0.0.1') !== false) {
    header('Access-Control-Allow-Origin: ' . $origin);
}

ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

$projectDir = 'track';

echo "<h2>PHP Debug Info</h2>";
echo "<pre>";
echo "Current directory: " . getcwd() . "\n";
echo "Project directory: " . $projectDir . "\n";
echo "Is directory: " . (is_dir($projectDir) ? 'YES' : 'NO') . "\n";
echo "Is writable: " . (is_writable($projectDir) ? 'YES' : 'NO') . "\n";

if (is_dir($projectDir)) {
    echo "Directory permissions: " . substr(sprintf('%o', fileperms($projectDir)), -4) . "\n";
    $files = scandir($projectDir);
    echo "Files in track/: " . count($files) . "\n";
    echo "Files: " . print_r(array_filter($files, fn($f) => $f !== '.' && $f !== '..'), true);
}

echo "\nPHP Version: " . phpversion() . "\n";
echo "PHP User: " . get_current_user() . "\n";

echo "\n--- FFmpeg Check ---\n";
$ffmpegPaths = ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/opt/ffmpeg/ffmpeg'];
foreach ($ffmpegPaths as $p) {
    echo "Check $p: " . (is_executable($p) ? 'FOUND' : 'not found') . "\n";
}

$disabled = ini_get('disable_functions');
echo "Disabled functions: " . ($disabled ?: 'none') . "\n";
echo "\n--- Alle Exec-Funktionen prüfen ---\n";
$execFuncs = ['exec', 'shell_exec', 'system', 'passthru', 'popen', 'proc_open', 'pcntl_exec'];
foreach ($execFuncs as $fn) {
    $avail = function_exists($fn) && !in_array($fn, array_map('trim', explode(',', $disabled)));
    echo "$fn: " . ($avail ? 'AVAILABLE ✅' : 'DISABLED ❌') . "\n";
}
echo "\n--- Test: popen mit FFmpeg ---\n";
if (function_exists('popen')) {
    $handle = @popen('/usr/bin/ffmpeg -version 2>&1', 'r');
    if ($handle) {
        $output = fread($handle, 200);
        pclose($handle);
        echo "popen SUCCESS: " . trim($output) . "\n";
    } else {
        echo "popen fehlgeschlagen\n";
    }
} else {
    echo "popen nicht verfügbar\n";
}
echo "\n--- Test: proc_open mit FFmpeg ---\n";
if (function_exists('proc_open')) {
    $descriptors = [['pipe','r'], ['pipe','w'], ['pipe','w']];
    $proc = @proc_open('/usr/bin/ffmpeg -version 2>&1', $descriptors, $pipes);
    if (is_resource($proc)) {
        $output = stream_get_contents($pipes[1]);
        fclose($pipes[0]); fclose($pipes[1]); fclose($pipes[2]);
        proc_close($proc);
        echo "proc_open SUCCESS: " . trim($output) . "\n";
    } else {
        echo "proc_open fehlgeschlagen\n";
    }
} else {
    echo "proc_open nicht verfügbar\n";
}

if (!is_dir($projectDir)) {
    echo "\nAttempting to create directory...\n";
    $result = mkdir($projectDir, 0777, true);
    echo "mkdir result: " . ($result ? 'SUCCESS' : 'FAILED') . "\n";
    if (!$result) {
        $error = error_get_last();
        echo "Error: " . ($error['message'] ?? 'unknown') . "\n";
    }
}

if (is_dir($projectDir)) {
    $testFile = $projectDir . '/test_' . time() . '.txt';
    echo "\nAttempting to write test file...\n";
    $result = file_put_contents($testFile, 'test');
    echo "file_put_contents result: " . ($result === false ? 'FAILED' : 'SUCCESS (' . $result . ' bytes)') . "\n";
    if ($result !== false) {
        echo "Test file created: $testFile\n";
        unlink($testFile);
        echo "Test file deleted\n";
    } else {
        $error = error_get_last();
        echo "Error: " . ($error['message'] ?? 'unknown') . "\n";
    }
}

echo "</pre>";

echo "<h2>PHP Error Log Location</h2>";
echo "<pre>";
echo "error_log: " . ini_get('error_log') . "\n";
echo "</pre>";

echo "<h2>Test Save Project</h2>";
echo "<form method='POST'>";
echo "<input type='hidden' name='action' value='save'>";
echo "<input type='text' name='test_id' placeholder='Test ID' required>";
echo "<button type='submit'>Test Save</button>";
echo "</form>";

if ($_POST['action'] === 'save' && !empty($_POST['test_id'])) {
    echo "<pre>";
    echo "\nTesting save with ID: " . $_POST['test_id'] . "\n";
    $filepath = $projectDir . '/' . $_POST['test_id'] . '.json';
    $testData = ['id' => $_POST['test_id'], 'test' => true, 'timestamp' => time()];
    $json = json_encode($testData);
    echo "Target: $filepath\n";
    echo "JSON length: " . strlen($json) . "\n";
    
    $result = file_put_contents($filepath, $json);
    echo "Result: " . ($result === false ? 'FAILED' : 'SUCCESS') . "\n";
    
    if ($result !== false) {
        echo "File saved!\n";
        $content = file_get_contents($filepath);
        echo "File content: " . $content . "\n";
        unlink($filepath);
        echo "File cleaned up\n";
    } else {
        $error = error_get_last();
        echo "Error: " . ($error['message'] ?? 'unknown') . "\n";
    }
    echo "</pre>";
}
