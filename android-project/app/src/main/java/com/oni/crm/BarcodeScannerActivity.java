package com.oni.crm;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.Vibrator;
import android.util.Log;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.Toast;

import androidx.activity.ComponentActivity;
import androidx.annotation.NonNull;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageProxy;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.google.common.util.concurrent.ListenableFuture;
import com.google.mlkit.vision.barcode.BarcodeScanner;
import com.google.mlkit.vision.barcode.BarcodeScannerOptions;
import com.google.mlkit.vision.barcode.BarcodeScanning;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.common.InputImage;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class BarcodeScannerActivity extends ComponentActivity {

    public static final String EXTRA_RESULT = "barcode_result";
    private static final String TAG = "On.i.Barcode";
    private static final int REQ_CAMERA = 2001;

    private PreviewView previewView;
    private ScanOverlayView overlayView;
    private BarcodeScanner scanner;
    private ExecutorService cameraExecutor;
    private ProcessCameraProvider cameraProvider;
    private boolean detected = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0xFF000000);
        setContentView(root);

        previewView = new PreviewView(this);
        previewView.setScaleType(PreviewView.ScaleType.FILL_CENTER);
        root.addView(previewView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));

        overlayView = new ScanOverlayView(this);
        root.addView(overlayView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));

        ImageView closeBtn = new ImageView(this);
        closeBtn.setImageResource(android.R.drawable.ic_menu_close_clear_cancel);
        closeBtn.setColorFilter(0xFFFFFFFF);
        FrameLayout.LayoutParams closeLp = new FrameLayout.LayoutParams(dp(48), dp(48));
        closeLp.gravity = Gravity.TOP | Gravity.END;
        closeLp.topMargin = dp(16);
        closeLp.rightMargin = dp(16);
        closeBtn.setLayoutParams(closeLp);
        closeBtn.setOnClickListener(v -> { setResult(RESULT_CANCELED); finish(); });
        root.addView(closeBtn);

        BarcodeScannerOptions options = new BarcodeScannerOptions.Builder()
                .setBarcodeFormats(
                        Barcode.FORMAT_EAN_13, Barcode.FORMAT_EAN_8,
                        Barcode.FORMAT_CODE_128, Barcode.FORMAT_QR_CODE,
                        Barcode.FORMAT_UPC_A, Barcode.FORMAT_UPC_E)
                .build();
        scanner = BarcodeScanning.getClient(options);
        cameraExecutor = Executors.newSingleThreadExecutor();

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this,
                    new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
        } else {
            startCamera();
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions,
                                           @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_CAMERA) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                startCamera();
            } else {
                Toast.makeText(this,
                        "\u041a\u0430\u043c\u0435\u0440\u0430 \u0437\u0430\u043f\u0440\u0435\u0449\u0435\u043d\u0430",
                        Toast.LENGTH_LONG).show();
                setResult(RESULT_CANCELED);
                finish();
            }
        }
    }

    private void startCamera() {
        ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(this);
        future.addListener(() -> {
            try {
                cameraProvider = future.get();
                bindCameraUseCases();
            } catch (Exception e) {
                Log.e(TAG, "camera provider failed", e);
                Toast.makeText(this, "Camera failed", Toast.LENGTH_LONG).show();
                finish();
            }
        }, ContextCompat.getMainExecutor(this));
    }

    private void bindCameraUseCases() {
        Preview preview = new Preview.Builder().build();
        preview.setSurfaceProvider(previewView.getSurfaceProvider());

        ImageAnalysis analysis = new ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build();
        analysis.setAnalyzer(cameraExecutor, this::analyzeFrame);

        try {
            cameraProvider.unbindAll();
            cameraProvider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA,
                    preview, analysis);
            Log.i(TAG, "camera bound OK");
        } catch (Exception e) {
            Log.e(TAG, "bind failed", e);
        }
    }

    private void analyzeFrame(ImageProxy imageProxy) {
        if (detected) { imageProxy.close(); return; }
        try {
            int rotation = imageProxy.getImageInfo().getRotationDegrees();
            InputImage image = InputImage.fromMediaImage(imageProxy.getImage(), rotation);
            scanner.process(image)
                    .addOnSuccessListener(barcodes -> {
                        if (detected) return;
                        for (Barcode b : barcodes) {
                            String value = b.getRawValue();
                            if (value != null && !value.isEmpty()) {
                                detected = true;
                                onBarcodeDetected(value);
                                return;
                            }
                        }
                    })
                    .addOnFailureListener(e -> Log.e(TAG, "scan failed", e))
                    .addOnCompleteListener(t -> imageProxy.close());
        } catch (Exception e) {
            Log.e(TAG, "analyze failed", e);
            imageProxy.close();
        }
    }

    private void onBarcodeDetected(String value) {
        Log.i(TAG, "DETECTED: " + value);
        try {
            Vibrator v = (Vibrator) getSystemService(VIBRATOR_SERVICE);
            if (v != null) v.vibrate(80);
        } catch (Exception ignored) {}
        Intent result = new Intent();
        result.putExtra(EXTRA_RESULT, value);
        setResult(RESULT_OK, result);
        finish();
    }

    private int dp(int v) {
        return (int) (v * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (cameraProvider != null) cameraProvider.unbindAll();
        if (cameraExecutor != null) cameraExecutor.shutdown();
        if (scanner != null) scanner.close();
    }
}