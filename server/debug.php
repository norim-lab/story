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

echo "<h2>FFmpeg & Exec Functions Debug</h2>";
echo "<pre>";

echo "PHP Version: " . phpversion() . "\n";
echo "PHP User: " . get_current_user() . "\n\n";

echo "=== DISABLED FUNCTIONS ===\n";
$disabled = ini_get('disable_functions');
echo $disabled ?: 'none';
echo "\n\n";

echo "=== FFmpeg PATH CHECK ===\n";
$ffmpegPaths = ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/opt/ffmpeg/ffmpeg'];
foreach ($ffmpegPaths as $p) {
    $exists = file_exists($p);
    $isExec = is_executable($p);
    echo "$p: exists=" . ($exists ? 'YES' : 'NO') . " executable=" . ($isExec ? 'YES' : 'NO') . "\n";
}
echo "\n";

echo "=== EXEC FUNCTION AVAILABILITY ===\n";
$execFuncs = ['exec', 'shell_exec', 'system', 'passthru', 'popen', 'proc_open', 'pcntl_exec'];
$disabledList = array_map('trim', explode(',', $disabled ?: ''));
foreach ($execFuncs as $fn) {
    $exists = function_exists($fn);
    $inDisabled = in_array($fn, $disabledList);
    $avail = $exists && !$inDisabled;
    echo "$fn: function_exists=" . ($exists ? 'YES' : 'NO') . " in_disabled=" . ($inDisabled ? 'YES' : 'NO') . " => " . ($avail ? 'AVAILABLE ✅' : 'BLOCKED ❌') . "\n";
}
echo "\n";

echo "=== POPEN TEST ===\n";
if (function_exists('popen') && !in_array('popen', $disabledList)) {
    echo "Attempting popen('/usr/bin/ffmpeg -version 2>&1', 'r')...\n";
    $handle = @popen('/usr/bin/ffmpeg -version 2>&1', 'r');
    if ($handle !== false) {
        $output = '';
        while (!feof($handle)) {
            $output .= fread($handle, 1024);
        }
        pclose($handle);
        echo "popen SUCCESS ✅\n";
        echo "Output (first 500 chars): " . substr(trim($output), 0, 500) . "\n";
    } else {
        $err = error_get_last();
        echo "popen FAILED: " . ($err['message'] ?? 'unknown error') . "\n";
    }
} else {
    echo "popen not available, skipping\n";
}
echo "\n";

echo "=== PROC_OPEN TEST ===\n";
if (function_exists('proc_open') && !in_array('proc_open', $disabledList)) {
    echo "Attempting proc_open('/usr/bin/ffmpeg -version 2>&1')...\n";
    $descriptors = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w']
    ];
    $proc = @proc_open('/usr/bin/ffmpeg -version 2>&1', $descriptors, $pipes);
    if (is_resource($proc)) {
        $stdout = stream_get_contents($pipes[1]);
        $stderr = stream_get_contents($pipes[2]);
        fclose($pipes[0]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        proc_close($proc);
        echo "proc_open SUCCESS ✅\n";
        echo "STDOUT (first 500 chars): " . substr(trim($stdout), 0, 500) . "\n";
        if ($stderr) echo "STDERR (first 200 chars): " . substr(trim($stderr), 0, 200) . "\n";
    } else {
        $err = error_get_last();
        echo "proc_open FAILED: " . ($err['message'] ?? 'unknown error') . "\n";
    }
} else {
    echo "proc_open not available, skipping\n";
}
echo "\n";

echo "=== POPEN TEST 2: simple echo ===\n";
if (function_exists('popen') && !in_array('popen', $disabledList)) {
    $handle = @popen('echo HELLO_FROM_POPEN 2>&1', 'r');
    if ($handle !== false) {
        $out = trim(fread($handle, 200));
        pclose($handle);
        echo "Result: $out\n";
    } else {
        $err = error_get_last();
        echo "FAILED: " . ($err['message'] ?? 'unknown') . "\n";
    }
}

echo "</pre>";
