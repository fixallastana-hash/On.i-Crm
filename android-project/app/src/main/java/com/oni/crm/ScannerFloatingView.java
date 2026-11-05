package com.oni.crm;

import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Vibrator;
import android.util.Log;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageProxy;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.Lifecycle;
import androidx.lifecycle.LifecycleOwner;
import androidx.lifecycle.LifecycleRegistry;

import com.google.common.util.concurrent.ListenableFuture;
import com.google.mlkit.vision.barcode.BarcodeScanner;
import com.google.mlkit.vision.barcode.BarcodeScannerOptions;
import com.google.mlkit.vision.barcode.BarcodeScanning;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.common.InputImage;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class ScannerFloatingView extends FrameLayout {

    private static final String TAG = "On.i.Floating";

    public interface Callback {
        void onBarcodeDetected(String value);
        void onClose();
    }

    private PreviewView previewView;
    private ScanOverlayView overlayView;
    private FrameLayout headerBar;

    private BarcodeScanner scanner;
    private ExecutorService executor;
    private ProcessCameraProvider provider;
    private FloatingLifecycle lifecycle;
    private Callback callback;
    private boolean detected = false;

    public ScannerFloatingView(@NonNull Context context) {
        super(context);
        init();
    }

    private void init() {
        setBackgroundColor(0xFF000000);
        setClickable(true);

        previewView = new PreviewView(getContext());
        previewView.setScaleType(PreviewView.ScaleType.FILL_CENTER);
        previewView.setClickable(true);
        addView(previewView, new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));

        overlayView = new ScanOverlayView(getContext());
        overlayView.setClickable(true);
        addView(overlayView, new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));

        headerBar = new FrameLayout(getContext());
        GradientDrawable gd = new GradientDrawable();
        gd.setColor(0xCC000000);
        headerBar.setBackground(gd);
        LayoutParams hl = new LayoutParams(LayoutParams.MATCH_PARENT, dp(40));
        hl.gravity = Gravity.TOP;
        addView(headerBar, hl);

        TextView label = new TextView(getContext());
        label.setText("\u283F \u0421\u043A\u0430\u043D\u0435\u0440");
        label.setTextColor(Color.WHITE);
        label.setTextSize(12);
        label.setPadding(dp(12), dp(10), 0, 0);
        headerBar.addView(label, new LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.MATCH_PARENT));

        ImageView close = new ImageView(getContext());
        close.setImageResource(android.R.drawable.ic_menu_close_clear_cancel);
        close.setColorFilter(Color.WHITE);
        LayoutParams cl = new LayoutParams(dp(40), dp(40));
        cl.gravity = Gravity.END | Gravity.CENTER_VERTICAL;
        close.setLayoutParams(cl);
        close.setOnClickListener(v -> {
            hide();
            if (callback != null) callback.onClose();
        });
        headerBar.addView(close);

        View resize = new View(getContext());
        GradientDrawable rg = new GradientDrawable();
        rg.setColor(0x9900FF88);
        rg.setCornerRadius(dp(4));
        resize.setBackground(rg);
        LayoutParams rl = new LayoutParams(dp(20), dp(20));
        rl.gravity = Gravity.BOTTOM | Gravity.END;
        rl.rightMargin = dp(4);
        rl.bottomMargin = dp(4);
        resize.setLayoutParams(rl);
        addView(resize);

        headerBar.setOnTouchListener(new OnTouchListener() {
            float startX, startY; int initX, initY;
            @Override public boolean onTouch(View v, MotionEvent e) {
                LayoutParams lp = (LayoutParams) getLayoutParams();
                switch (e.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        startX = e.getRawX(); startY = e.getRawY();
                        initX = lp.leftMargin; initY = lp.topMargin;
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        lp.leftMargin = Math.max(0, initX + (int)(e.getRawX() - startX));
                        lp.topMargin  = Math.max(0, initY + (int)(e.getRawY() - startY));
                        setLayoutParams(lp);
                        return true;
                }
                return false;
            }
        });

        resize.setOnTouchListener(new OnTouchListener() {
            float startX, startY; int initW, initH;
            @Override public boolean onTouch(View v, MotionEvent e) {
                LayoutParams lp = (LayoutParams) getLayoutParams();
                switch (e.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        startX = e.getRawX(); startY = e.getRawY();
                        initW = lp.width; initH = lp.height;
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        lp.width  = Math.max(dp(160), initW + (int)(e.getRawX() - startX));
                        lp.height = Math.max(dp(120), initH + (int)(e.getRawY() - startY));
                        setLayoutParams(lp);
                        return true;
                }
                return false;
            }
        });
    }

    public void start(Activity activity, Callback cb) {
        this.callback = cb;
        this.detected = false;
        setVisibility(VISIBLE);

        BarcodeScannerOptions options = new BarcodeScannerOptions.Builder()
                .setBarcodeFormats(
                        Barcode.FORMAT_EAN_13, Barcode.FORMAT_EAN_8,
                        Barcode.FORMAT_CODE_128, Barcode.FORMAT_QR_CODE,
                        Barcode.FORMAT_UPC_A, Barcode.FORMAT_UPC_E)
                .build();
        scanner = BarcodeScanning.getClient(options);
        executor = Executors.newSingleThreadExecutor();

        lifecycle = new FloatingLifecycle();
        lifecycle.start();

        ListenableFuture<ProcessCameraProvider> f = ProcessCameraProvider.getInstance(activity);
        f.addListener(() -> {
            try {
                provider = f.get();
                Preview preview = new Preview.Builder().build();
                preview.setSurfaceProvider(previewView.getSurfaceProvider());
                ImageAnalysis analysis = new ImageAnalysis.Builder()
                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build();
                analysis.setAnalyzer(executor, this::analyzeFrame);
                provider.unbindAll();
                provider.bindToLifecycle(lifecycle, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis);
                Log.i(TAG, "camera bound OK");
            } catch (Exception e) {
                Log.e(TAG, "camera bind failed", e);
            }
        }, ContextCompat.getMainExecutor(activity));
    }

    private void analyzeFrame(ImageProxy ip) {
        if (detected) { ip.close(); return; }
        try {
            InputImage img = InputImage.fromMediaImage(ip.getImage(),
                    ip.getImageInfo().getRotationDegrees());
            scanner.process(img)
                    .addOnSuccessListener(bcs -> {
                        if (detected) return;
                        for (Barcode b : bcs) {
                            String v = b.getRawValue();
                            if (v != null && !v.isEmpty()) {
                                detected = true;
                                onDetected(v);
                                return;
                            }
                        }
                    })
                    .addOnFailureListener(e -> Log.e(TAG, "process failed", e))
                    .addOnCompleteListener(t -> ip.close());
        } catch (Exception e) {
            Log.e(TAG, "analyze failed", e);
            ip.close();
        }
    }

    private void onDetected(String value) {
        Log.i(TAG, "DETECTED: " + value);
        try {
            Vibrator v = (Vibrator) getContext().getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null) v.vibrate(80);
        } catch (Exception ignored) {}
        Callback cb = callback;
        hide();
        if (cb != null) cb.onBarcodeDetected(value);
    }

    public void hide() {
        try { if (provider != null) provider.unbindAll(); } catch (Exception ignored) {}
        provider = null;
        if (executor != null) { try { executor.shutdown(); } catch (Exception ignored) {} executor = null; }
        if (scanner != null) { try { scanner.close(); } catch (Exception ignored) {} scanner = null; }
        if (lifecycle != null) { try { lifecycle.stop(); } catch (Exception ignored) {} lifecycle = null; }
        setVisibility(GONE);
    }

    public boolean isActive() { return getVisibility() == VISIBLE; }

    private int dp(int v) { return (int)(v * getResources().getDisplayMetrics().density); }

    public static class FloatingLifecycle implements LifecycleOwner {
        private final LifecycleRegistry registry;
        public FloatingLifecycle() { registry = new LifecycleRegistry(this); }
        public void start() {
            registry.handleLifecycleEvent(Lifecycle.Event.ON_CREATE);
            registry.handleLifecycleEvent(Lifecycle.Event.ON_START);
            registry.handleLifecycleEvent(Lifecycle.Event.ON_RESUME);
        }
        public void stop() {
            try { registry.handleLifecycleEvent(Lifecycle.Event.ON_PAUSE); } catch (Exception ignored) {}
            try { registry.handleLifecycleEvent(Lifecycle.Event.ON_STOP); } catch (Exception ignored) {}
            try { registry.handleLifecycleEvent(Lifecycle.Event.ON_DESTROY); } catch (Exception ignored) {}
        }
        @Override public Lifecycle getLifecycle() { return registry; }
    }
}