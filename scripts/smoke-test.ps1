$ErrorActionPreference = "Stop"
$path = $env:ONI_INDEX_PATH
$assets = $env:ONI_ASSETS_DIR
if(-not $path){ $path = 'C:\oni\Index.html' }
if(-not $assets){ $assets = (Split-Path -Parent $path) }
if(-not (Test-Path -LiteralPath $path)){ Write-Host "Index.html not found: $path" -ForegroundColor Red; exit 2 }

$corePath = Join-Path $assets "core.js"
$stylesPath = Join-Path $assets "styles.css"
$uiExtraPath = Join-Path $assets "ui-extra.js"

$idx = [IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
$core = if(Test-Path $corePath){ [IO.File]::ReadAllText($corePath, [System.Text.Encoding]::UTF8) } else { "" }
$styles = if(Test-Path $stylesPath){ [IO.File]::ReadAllText($stylesPath, [System.Text.Encoding]::UTF8) } else { "" }
$ui = if(Test-Path $uiExtraPath){ [IO.File]::ReadAllText($uiExtraPath, [System.Text.Encoding]::UTF8) } else { "" }

$checks = @(
  @{ name = "index.html exists";                 test = { Test-Path $path } },
  @{ name = "core.js exists";                    test = { Test-Path $corePath } },
  @{ name = "styles.css exists";                 test = { Test-Path $stylesPath } },
  @{ name = "ui-extra.js exists";                test = { Test-Path $uiExtraPath } },
  @{ name = "core.js linked in index.html";      test = { $idx -match '<script\s+src="core\.js"' } },
  @{ name = "styles.css linked in index.html";   test = { $idx -match '<link[^>]+href="styles\.css"' } },
  @{ name = "ui-extra.js linked in index.html";  test = { $idx -match '<script\s+src="ui-extra\.js"' } },
  @{ name = "core.js before main script";        test = { $idx.IndexOf('<script src="core.js">') -lt $idx.IndexOf('// ===== FIREBASE INIT =====') } },
  @{ name = "ui-extra.js after main script";     test = { $idx.IndexOf('<script src="ui-extra.js">') -gt $idx.IndexOf('window.oniScanToSearch') } },
  @{ name = "Firebase initialized";              test = { $idx.Contains("firebase.initializeApp(firebaseConfig)") } },
  @{ name = "_fbRunSync deletes tombstones";     test = { $idx.Contains("tombstones deleted") } },
  @{ name = "onBarcodeScanned defined";          test = { $idx.Contains("function onBarcodeScanned(json)") } },
  @{ name = "Kaspi bridge connected";            test = { $idx.Contains("onKaspiPaymentResult") } },
  @{ name = "onAndroidBack connected";           test = { $idx.Contains("window.onAndroidBack") } },
  @{ name = "No TODO BROKEN markers";            test = { -not ($idx -match "TODO BROKEN") } }
)

$movedFns = @(
  'escapeHtml','fmtMoney','fmtDate','fmtDateTime','todayISO','uid','initials','nowISO','localDateTime',
  'storageGet','storageSet','idbGet','idbSet','idbDelete','openIDB','withTimeout',
  'persist','makeFullBackup','saveFullBackupNow','queueFullBackup','getFullBackup','downloadBackup','restoreFromText','openBackupFile',
  'showToast','bindLiveSearch','smartProductSearch','searchStem','searchVariants','normalizeSearchWord',
  'moduleOn','isModOn','sanitizeModulesConfig','viewAllowedByModules','roleNav','roleAccess','userRole','canAccess','requireAccess','saveUiState',
  'productIcon','productAvailable','productVatRate','productBarcodes','renderBarcodeList','renderPackagingList','salesLevel','stockLevel','salesTextColor','stockTextColor','productSalesQty','productSearchText','getProductPhotos','getProductMainPhoto',
  'viewProducts','bindProducts','renderProductSelectionView','enterProductSelection','exitProductSelection','toggleProductSelection',
  '_pfNum','_pfSave','_pfLoad','_pfCount','_pfApplyFilters','_pfApplySort','_pfSortLabel','openProductSortSheet','openProductFiltersSheet',
  'openProductModal','openProductInfoModal','openProductPhotoLightbox','initProductInfoSwipeClose','confirmProductInfo','openCategoryManager','deleteProduct',
  'getSupplier','supplierName','purchaseProductName','supplierPurchaseRows','productPurchaseRows','requestStatusLabel','requestStatusClass','whatsappNumber','supplierContacts',
  'viewSuppliers','bindSuppliers','openPurchasesHub','openPurchaseHistoryScreen','openLowStockScreen','openProcurementRequestsScreen',
  'openSupplierModal','openSupplierDetail','openSupplierContactModal',
  'openProductPickerSheet','openPurchaseModal','deletePurchase','openProductPurchaseHistory',
  'requestMessage','sendRequestWhatsApp','openProcurementRequestDetail','openRequestStatusPicker','openPurchaseFromRequest',
  '_newCartObject','_renumberCarts','_saveCarts','_loadCarts','_resetCarts','newCart','switchCart','closeCart','calcDiscount','cartSubtotal','calcSale','showPosNotice','viewOrders','viewPOS','viewOrdersHistory','bindOrders','renderCartTabs','renderCartBar','openCartSheet','renderCartSheetContent','checkoutCart','finalizePreparedSale','openFavContextMenu','getProblematicProductIds','saveProblematicProductIds','isProblematicProduct','toggleProblematicProduct','openProblematicScreen','getClient','viewClients','bindClients','openClientModal','openClientDetail','openClientBonusManager','clientOrders','getClientContacts','findOrCreateContact','normalizeWhatsApp','openReceiptWhatsApp','receiptWhatsAppText'
)

foreach($fn in $movedFns){
  $fnPat = '(async\s+)?function\s+' + [regex]::Escape($fn) + '\s*\('
  $checks += @{ name = "  $fn in core.js";    test = { $core -match $fnPat }.GetNewClosure() }
  $checks += @{ name = "  $fn NOT in index.html"; test = { -not ($idx -match $fnPat) }.GetNewClosure() }
}

$node = Get-Command node -ErrorAction SilentlyContinue
if($node){
  $tmp = [IO.Path]::GetTempFileName() + ".js"
  try {
    if(Test-Path $corePath){
      $checks += @{ name = "node --check core.js"; test = {
        [IO.File]::WriteAllText($tmp, $core, (New-Object System.Text.UTF8Encoding($false)))
        $null = & node --check $tmp 2>&1
        $LASTEXITCODE -eq 0
      }.GetNewClosure() }
    }
    if(Test-Path $uiExtraPath){
      $checks += @{ name = "node --check ui-extra.js"; test = {
        [IO.File]::WriteAllText($tmp, $ui, (New-Object System.Text.UTF8Encoding($false)))
        $null = & node --check $tmp 2>&1
        $LASTEXITCODE -eq 0
      }.GetNewClosure() }
    }
  } finally {
    if(Test-Path $tmp){ Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
  }
} else {
  Write-Host "node not available — skipping syntax checks" -ForegroundColor Yellow
}

$failed = 0
foreach($c in $checks){
  if(& $c.test){ Write-Host ("  [PASS] " + $c.name) -ForegroundColor Green }
  else { Write-Host ("  [FAIL] " + $c.name) -ForegroundColor Red; $failed++ }
}
if($failed -gt 0){ Write-Host ("Failed: " + $failed) -ForegroundColor Red; exit 1 }
Write-Host "All checks passed" -ForegroundColor Green
exit 0