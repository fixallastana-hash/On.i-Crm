package com.oni.crm;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.util.AttributeSet;
import android.view.View;

public class ScanOverlayView extends View {

    private final Paint dimPaint = new Paint();
    private final Paint cornerPaint = new Paint();
    private final Paint linePaint = new Paint();
    private final Paint textPaint = new Paint();
    private final RectF scanRect = new RectF();
    private float scanLineY = 0;
    private float scanLineDir = 1;
    private long lastFrame = 0;

    public ScanOverlayView(Context context) { super(context); init(); }
    public ScanOverlayView(Context context, AttributeSet attrs) { super(context, attrs); init(); }

    private void init() {
        float d = getResources().getDisplayMetrics().density;
        dimPaint.setColor(0x99000000);
        cornerPaint.setColor(0xFF00FF88);
        cornerPaint.setStyle(Paint.Style.STROKE);
        cornerPaint.setStrokeWidth(4 * d);
        cornerPaint.setStrokeCap(Paint.Cap.ROUND);
        linePaint.setColor(0xFF00FF88);
        linePaint.setStrokeWidth(2 * d);
        textPaint.setColor(Color.WHITE);
        textPaint.setTextSize(16 * getResources().getDisplayMetrics().scaledDensity);
        textPaint.setTextAlign(Paint.Align.CENTER);
        textPaint.setAntiAlias(true);
    }

    @Override
    protected void onSizeChanged(int w, int h, int oldw, int oldh) {
        super.onSizeChanged(w, h, oldw, oldh);
        float sw = w * 0.85f;
        float sh = sw * 0.55f;
        float cx = w / 2f;
        float cy = h / 2f;
        scanRect.set(cx - sw / 2, cy - sh / 2, cx + sw / 2, cy + sh / 2);
        scanLineY = scanRect.top;
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        int w = getWidth();
        int h = getHeight();
        canvas.drawRect(0, 0, w, scanRect.top, dimPaint);
        canvas.drawRect(0, scanRect.bottom, w, h, dimPaint);
        canvas.drawRect(0, scanRect.top, scanRect.left, scanRect.bottom, dimPaint);
        canvas.drawRect(scanRect.right, scanRect.top, w, scanRect.bottom, dimPaint);

        float d = getResources().getDisplayMetrics().density;
        float len = 32 * d;
        canvas.drawLine(scanRect.left, scanRect.top, scanRect.left + len, scanRect.top, cornerPaint);
        canvas.drawLine(scanRect.left, scanRect.top, scanRect.left, scanRect.top + len, cornerPaint);
        canvas.drawLine(scanRect.right - len, scanRect.top, scanRect.right, scanRect.top, cornerPaint);
        canvas.drawLine(scanRect.right, scanRect.top, scanRect.right, scanRect.top + len, cornerPaint);
        canvas.drawLine(scanRect.left, scanRect.bottom - len, scanRect.left, scanRect.bottom, cornerPaint);
        canvas.drawLine(scanRect.left, scanRect.bottom, scanRect.left + len, scanRect.bottom, cornerPaint);
        canvas.drawLine(scanRect.right - len, scanRect.bottom, scanRect.right, scanRect.bottom, cornerPaint);
        canvas.drawLine(scanRect.right, scanRect.bottom - len, scanRect.right, scanRect.bottom, cornerPaint);

        canvas.drawLine(scanRect.left + 8 * d, scanLineY, scanRect.right - 8 * d, scanLineY, linePaint);
        canvas.drawText("\u041d\u0430\u0432\u0435\u0434\u0438\u0442\u0435 \u043d\u0430 \u0448\u0442\u0440\u0438\u0445\u043a\u043e\u0434",
                w / 2f, scanRect.bottom + 48 * d, textPaint);

        long now = System.currentTimeMillis();
        if (now - lastFrame > 16) {
            float speed = 2.5f * d;
            scanLineY += scanLineDir * speed;
            if (scanLineY <= scanRect.top) { scanLineY = scanRect.top; scanLineDir = 1; }
            if (scanLineY >= scanRect.bottom) { scanLineY = scanRect.bottom; scanLineDir = -1; }
            lastFrame = now;
        }
        postInvalidateOnAnimation();
    }
}