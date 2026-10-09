$path = $env:ONI_INDEX_PATH
if(-not $path){ $path = 'C:\oni\Index.html' }
if(-not (Test-Path -LiteralPath $path)){ Write-Host "Index.html not found: $path" -ForegroundColor Red; exit 2 }
$content = [IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)

$checks = @(
  @{ name = "File size > 1 MB";              test = { (Get-Item $path).Length -gt 1000000 } },
  @{ name = "Firebase initialized";          test = { $content.Contains("firebase.initializeApp(firebaseConfig)") } },
  @{ name = "deleteProduct with tombstone";  test = { $content.Contains("sklad_crm_recent_deletes") } },
  @{ name = "_fbRunSync deletes tombstones"; test = { $content.Contains("tombstones deleted") } },
  @{ name = "Mass delete writes tombstone";  test = { $content.Contains("_rdm[String(pid)]") } },
  @{ name = "onBarcodeScanned defined";      test = { $content.Contains("function onBarcodeScanned(json)") } },
  @{ name = "Kaspi bridge connected";        test = { $content.Contains("onKaspiPaymentResult") } },
  @{ name = "onAndroidBack connected";       test = { $content.Contains("window.onAndroidBack") } },
  @{ name = "No TODO BROKEN markers";        test = { -not ($content -match "TODO BROKEN") } }
)

$failed = 0
foreach($c in $checks){
  if(& $c.test){ Write-Host ("  [PASS] " + $c.name) -ForegroundColor Green }
  else { Write-Host ("  [FAIL] " + $c.name) -ForegroundColor Red; $failed++ }
}
if($failed -gt 0){ Write-Host ("Failed: " + $failed) -ForegroundColor Red; exit 1 }
Write-Host "All checks passed" -ForegroundColor Green
exit 0