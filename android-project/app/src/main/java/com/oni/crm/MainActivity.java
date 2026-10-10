package com.oni.crm;

import com.googlecode.tesseract.android.TessBaseAPI;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.provider.MediaStore;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.content.SharedPreferences;
import org.json.JSONObject;
import org.json.JSONException;
import org.json.JSONArray;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocketFactory;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import android.util.Base64;
import android.util.Log;
import java.net.ConnectException;
import java.net.SocketTimeoutException;
import java.util.Locale;
import javax.net.ssl.SSLHandshakeException;

public class MainActivity extends Activity {
    private static final int FILE_CHOOSER = 7001;
    private static final int EXCEL_PICKER = 7003;
    private static final int SAVE_FILE = 7004;
    private static final int CHAT_GALLERY = 7005;
    private static final int CHAT_CAMERA_PHOTO = 7006;
    private static final int CHAT_CAMERA_VIDEO = 7007;
    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraUri;
    private Uri chatCameraUri;
    private int pendingChatCameraMode = 0;
    private WebView printWebView;
    private String pendingSaveBase64;
    private String pendingSaveName;
    private final java.util.concurrent.ExecutorService kaspiExecutor = java.util.concurrent.Executors.newSingleThreadExecutor();
    private final java.util.concurrent.ExecutorService ocrExecutor = java.util.concurrent.Executors.newSingleThreadExecutor();
    private volatile String aiIdToken = null;
    private static final String AI_PROXY_URL = "https://us-central1-oni-crm-b4975.cloudfunctions.net/aiProxy";

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(0xFFFFFFFF);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        webView = new WebView(this);
        setContentView(webView);
        configureWebView();
        webView.addJavascriptInterface(new AndroidBridge(), "Android");
        webView.loadUrl("file:///android_asset/index.html");
        webView.postDelayed(new Runnable() { public void run() { injectProductHandlers(); } }, 500);
        webView.postDelayed(new Runnable() { public void run() { injectProductHandlers(); } }, 1500);
        webView.postDelayed(new Runnable() { public void run() { injectProductHandlers(); } }, 3500);
        webView.postDelayed(new Runnable() { public void run() { injectAIChat(); } }, 500);
        webView.postDelayed(new Runnable() { public void run() { injectAIChat(); } }, 1500);
        webView.postDelayed(new Runnable() { public void run() { injectAIChat(); } }, 3500);
        webView.postDelayed(new Runnable() { public void run() { injectGuideChat(); } }, 500);
        webView.postDelayed(new Runnable() { public void run() { injectGuideChat(); } }, 1500);
        webView.postDelayed(new Runnable() { public void run() { injectGuideChat(); } }, 3500);
    }

    private void configureWebView() {
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setSupportZoom(false);
        s.setLoadWithOverviewMode(false);
        s.setUseWideViewPort(false);
        CookieManager.getInstance().setAcceptCookie(true);

        webView.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                try {
                    Uri u = request.getUrl();
                    if (u != null && "oni.local".equalsIgnoreCase(u.getHost()) && u.getPath() != null && u.getPath().startsWith("/media/")) {
                        String name = u.getPath().substring("/media/".length());
                        if (name.contains("..") || name.contains("/") || name.isEmpty()) return null;
                        File root = new File(getFilesDir(), "media");
                        File f = new File(root, name);
                        if (!f.exists() || !f.isFile()) return null;
                        String mime = android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(android.webkit.MimeTypeMap.getFileExtensionFromUrl(name));
                        if (mime == null) mime = "application/octet-stream";
                        return new WebResourceResponse(mime, null, new FileInputStream(f));
                    }
                } catch (Exception ignored) {}
                return super.shouldInterceptRequest(view, request);
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u=request.getUrl();
                String scheme=u.getScheme()==null?"":u.getScheme().toLowerCase(Locale.ROOT);
                if (scheme.equals("http") || scheme.equals("https") || scheme.equals("whatsapp") || scheme.equals("tel")) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW,u)); } catch(ActivityNotFoundException ignored) {}
                    return true;
                }
                return false;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                launchFileChooser(params);
                return true;
            }
        });
    }

    private final class AndroidBridge {
        @JavascriptInterface
        public void pickExcelFile() {
            runOnUiThread(() -> {
                Intent document = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                document.addCategory(Intent.CATEGORY_OPENABLE);
                document.setType("*/*");
                document.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        "application/vnd.ms-excel",
                        "text/csv",
                        "text/comma-separated-values"
                });
                try { startActivityForResult(document, EXCEL_PICKER); }
                catch (ActivityNotFoundException e) {
                    webView.evaluateJavascript("window.onAndroidExcelError && window.onAndroidExcelError('Не удалось открыть выбор файла')", null);
                }
            });
        }

        @JavascriptInterface
        public void saveExcelTemplate(String base64, String fileName) {
            pendingSaveBase64 = base64;
            pendingSaveName = (fileName == null || fileName.trim().isEmpty()) ? "On-i-CRM-Шаблон.xlsx" : fileName;
            runOnUiThread(() -> {
                Intent create = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                create.addCategory(Intent.CATEGORY_OPENABLE);
                create.setType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
                create.putExtra(Intent.EXTRA_TITLE, pendingSaveName);
                try { startActivityForResult(create, SAVE_FILE); }
                catch (ActivityNotFoundException e) {
                    webView.evaluateJavascript("window.onAndroidSaveError && window.onAndroidSaveError('Не удалось открыть сохранение файла')", null);
                }
            });
        }


        @JavascriptInterface
        public void pickChatGallery() {
            runOnUiThread(() -> {
                Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType("*/*");
                pick.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/*", "video/*"});
                try { startActivityForResult(pick, CHAT_GALLERY); }
                catch (ActivityNotFoundException e) { webView.evaluateJavascript("window.onChatMediaError&&window.onChatMediaError(" + JSONObject.quote("Не удалось открыть галерею") + ")", null); }
            });
        }

        @JavascriptInterface
        public void openChatCameraPhoto() { startChatCamera(1); }

        @JavascriptInterface
        public void openChatCameraVideo() { startChatCamera(2); }



        @JavascriptInterface
        public String getAISettings() {
            SharedPreferences sp = getSharedPreferences("oni_ai", MODE_PRIVATE);
            JSONObject o = new JSONObject();
            try {
                boolean legacyEnabled=sp.getBoolean("enabled", false);
                o.put("enabled", legacyEnabled);
                o.put("openaiEnabled", sp.getBoolean("openaiEnabled", legacyEnabled));
                o.put("deepseekEnabled", sp.getBoolean("deepseekEnabled", false));
                o.put("model", sp.getString("model", "gpt-5.6-luna"));
                o.put("deepseekModel", sp.getString("deepseekModel", "deepseek-chat"));
                o.put("apiKeySet", !sp.getString("apiKey", "").trim().isEmpty());
                o.put("openaiApiKeySet", !sp.getString("apiKey", "").trim().isEmpty());
                o.put("deepseekApiKeySet", !sp.getString("deepseekApiKey", "").trim().isEmpty());
            } catch (Exception ignored) {}
            return o.toString();
        }

        @JavascriptInterface
        public void saveAISettings(String enabled, String openaiEnabled, String deepseekEnabled, String model, String apiKey, String deepseekModel, String deepseekApiKey) {
            SharedPreferences sp = getSharedPreferences("oni_ai", MODE_PRIVATE);
            SharedPreferences.Editor e = sp.edit();
            e.putBoolean("enabled", "true".equalsIgnoreCase(enabled));
            e.putBoolean("openaiEnabled", "true".equalsIgnoreCase(openaiEnabled));
            e.putBoolean("deepseekEnabled", "true".equalsIgnoreCase(deepseekEnabled));
            if (model != null && !model.trim().isEmpty()) e.putString("model", model.trim());
            if (deepseekModel != null && !deepseekModel.trim().isEmpty()) e.putString("deepseekModel", deepseekModel.trim());
            if (apiKey != null && !apiKey.trim().isEmpty()) e.putString("apiKey", apiKey.trim());
            if (deepseekApiKey != null && !deepseekApiKey.trim().isEmpty()) e.putString("deepseekApiKey", deepseekApiKey.trim());
            e.apply();
        }

        @JavascriptInterface
        public boolean getAIAssistantAutoApply() {
            return getSharedPreferences("oni_ai", MODE_PRIVATE).getBoolean("assistantAutoApply", true);
        }

        @JavascriptInterface
        public void setAIAssistantAutoApply(boolean enabled) {
            getSharedPreferences("oni_ai", MODE_PRIVATE).edit().putBoolean("assistantAutoApply", enabled).apply();
        }

























        // Категория может быть введена вручную. Пол/цвет/объём сами по себе категорией не считаются.








        private String[] buildRussianProductInfoQueries(String q, String category) {
            if ("Парфюм".equals(category)) return new String[]{
                    q + " парфюм ноты верхние средние базовые",
                    q + " год выпуска парфюм",
                    q + " стойкость часов парфюм",
                    q + " шлейф проекция парфюм",
                    q + " сезон весна лето осень зима парфюм",
                    "site:fragrantica.ru " + q + " ноты год",
                    "site:fragrantica.ru " + q + " стойкость шлейф",
                    "site:fragrantica.ru " + q + " весна лето осень зима",
                    "site:aromo.ru " + q + " парфюм ноты стойкость шлейф"
            };
            if ("БАД / витамины".equals(category)) return new String[]{
                    q + " БАД состав польза как принимать дозировка противопоказания",
                    q + " витамины состав инструкция применение",
                    q + " БАД инструкция дозировка курс",
                    "site:apteka.ru " + q
            };
            if ("Книга".equals(category)) return new String[]{
                    q + " книга автор жанр о чем содержание",
                    q + " автор книга сюжет описание",
                    q + " ISBN автор издательство жанр"
            };
            if ("Электроника".equals(category)) return new String[]{
                    q + " характеристики обзор совместимость батарея",
                    q + " технические характеристики инструкция",
                    q + " характеристики отзывы"
            };
            if ("Косметика".equals(category)) return new String[]{
                    q + " косметика состав назначение эффект как применять",
                    q + " шампунь зубная паста миноксидил инструкция",
                    q + " официальный сайт производителя состав применение",
                    "site:apteka.ru " + q,
                    "site:goldapple.ru " + q
            };
            return new String[]{q + " характеристики описание применение"};
        }

        private String[] buildForeignProductInfoQueries(String q, String category) {
            if ("Парфюм".equals(category)) return new String[]{
                    q + " perfume fragrance notes top middle base",
                    q + " perfume release year",
                    q + " perfume longevity hours",
                    q + " perfume sillage projection",
                    q + " perfume season spring summer autumn winter",
                    q + " official fragrance notes longevity sillage"
            };
            if ("БАД / витамины".equals(category)) return new String[]{
                    q + " supplement ingredients benefits dosage directions warnings",
                    q + " official supplement facts directions"
            };
            if ("Книга".equals(category)) return new String[]{q + " book author genre synopsis", q + " official publisher"};
            if ("Электроника".equals(category)) return new String[]{q + " specifications manual compatibility battery", q + " official product specifications"};
            if ("Косметика".equals(category)) return new String[]{q + " ingredients benefits how to use hair teeth minoxidil", q + " official manufacturer product directions"};
            return new String[]{q + " product information details"};
        }





        /**
         * Гибридный поиск: Google -> Yandex -> Bing.
         * Каждый движок независим: сбой одного не ломает весь поиск.
         * Результаты нормализуются в единый формат {url,title,snippet,source}.
         */

























        @JavascriptInterface
        public void registerKaspiCashier(String host, String port, String cashierName, boolean verifyCertificate) {
            kaspiExecutor.execute(() -> { try {
                String h=host==null?"":host.trim(); int p=parsePort(port); String name=(cashierName==null||cashierName.trim().isEmpty())?"On.i CRM":cashierName.trim();
                JSONObject r=kaspiRequest(h,p,"/v2/register?name="+enc(name),null,verifyCertificate);
                if(r.optInt("statusCode",-1)==0&&r.optJSONObject("data")!=null){JSONObject d=r.getJSONObject("data");getSharedPreferences("kaspi_smart_pos",MODE_PRIVATE).edit().putString("accessToken",d.optString("accessToken","")).putString("refreshToken",d.optString("refreshToken","")).putString("host",h).putInt("port",p).putString("cashierName",name).apply();sendKaspiRegisterResult("{\"status\":\"success\"}");}else sendKaspiRegisterResult(errorJson(r));
            }catch(Exception e){Log.e("OniKaspi","registerKaspiCashier failed: "+safeMessage(e),e);
        sendKaspiRegisterResult("{\"status\":\"fail\",\"message\":"+JSONObject.quote(safeMessage(e))+"}");}});
        }
        @JavascriptInterface
        public void startKaspiPayment(String amount,String requestedMethod,String host,String port,String terminalId,String cashierName,boolean verifyCertificate){
            kaspiExecutor.execute(() -> {try{
                String h=host==null?"":host.trim();int p=parsePort(port);int a=Math.max(0,(int)Math.round(Double.parseDouble(String.valueOf(amount).replace(',','.'))));if(a<=0)throw new IllegalArgumentException("Сумма оплаты должна быть больше нуля");
                SharedPreferences sp=getSharedPreferences("kaspi_smart_pos",MODE_PRIVATE);String token=sp.getString("accessToken","");if(token.isEmpty()){sendKaspiResult("{\"status\":\"fail\",\"message\":\"Kaspi Smart POS не зарегистрирован\"}");return;}
                JSONObject start=kaspiRequest(h,p,"/v2/payment?amount="+a+"&owncheque=true",token,verifyCertificate);if(start.optInt("statusCode",-1)!=0||start.optJSONObject("data")==null){sendKaspiResult(errorJson(start));return;}String pid=start.getJSONObject("data").optString("processId","");if(pid.isEmpty())throw new IllegalStateException("Smart POS не вернул processId");
                long t=System.currentTimeMillis();while(System.currentTimeMillis()-t<245000L){JSONObject st=kaspiRequest(h,p,"/v2/status?processId="+enc(pid),token,verifyCertificate,"terminalId",terminalId==null?"":terminalId.trim());JSONObject d=st.optJSONObject("data");if(d==null){if(st.optInt("statusCode",-1)!=0){sendKaspiResult(errorJson(st));return;}Thread.sleep(1000);continue;}String s=d.optString("status","");sendKaspiProgress(s,d.optString("subStatus",""));if("success".equalsIgnoreCase(s)){JSONObject out=new JSONObject();out.put("status","success");out.put("processId",d.optString("processId",pid));out.put("transactionId",d.optString("transactionId",""));out.put("productType",d.optJSONObject("addInfo")==null?"":d.getJSONObject("addInfo").optString("ProductType",""));out.put("addInfo",d.optJSONObject("addInfo")==null?new JSONObject():d.getJSONObject("addInfo"));out.put("chequeInfo",d.optJSONObject("chequeInfo")==null?new JSONObject():d.getJSONObject("chequeInfo"));sendKaspiResult(out.toString());return;}if("fail".equalsIgnoreCase(s)){JSONObject out=new JSONObject();out.put("status","fail");out.put("processId",d.optString("processId",pid));out.put("message",d.optString("message","Оплата не выполнена"));sendKaspiResult(out.toString());return;}if("unknown".equalsIgnoreCase(s)){JSONObject ac=kaspiRequest(h,p,"/v2/actualize?processId="+enc(pid),token,verifyCertificate);JSONObject ad=ac.optJSONObject("data");if(ad!=null&&!"unknown".equalsIgnoreCase(ad.optString("status",""))){JSONObject out=new JSONObject();out.put("status",ad.optString("status","fail"));out.put("processId",ad.optString("processId",pid));out.put("message",ad.optString("message",""));if("success".equalsIgnoreCase(ad.optString("status",""))){out.put("transactionId",ad.optString("transactionId",""));out.put("productType",ad.optJSONObject("addInfo")==null?"":ad.getJSONObject("addInfo").optString("ProductType",""));out.put("addInfo",ad.optJSONObject("addInfo")==null?new JSONObject():ad.getJSONObject("addInfo"));out.put("chequeInfo",ad.optJSONObject("chequeInfo")==null?new JSONObject():ad.getJSONObject("chequeInfo"));}sendKaspiResult(out.toString());return;}}Thread.sleep(1000);}
                sendKaspiResult("{\"status\":\"unknown\",\"message\":\"Время ожидания оплаты истекло\"}");
            }catch(Exception e){Log.e("OniKaspi","startKaspiPayment failed: "+safeMessage(e),e);
        sendKaspiResult("{\"status\":\"fail\",\"message\":"+JSONObject.quote(safeMessage(e))+"}");}});
        }
        private String runOfflineOcr(Bitmap bitmap, String languages) throws Exception {
            File base = new File(getFilesDir(), "oni_ocr");
            File tessdata = new File(base, "tessdata");
            if (!tessdata.exists() && !tessdata.mkdirs()) throw new IOException("Не удалось подготовить OCR-хранилище");
            String[] files = {"eng.traineddata","rus.traineddata","tur.traineddata","chi_sim.traineddata","kor.traineddata","ara.traineddata","kaz.traineddata"};
            for (String name : files) {
                File dst = new File(tessdata, name);
                if (!dst.exists() || dst.length() < 1024) {
                    try (InputStream in = getAssets().open("tessdata/" + name); OutputStream out = new FileOutputStream(dst)) {
                        byte[] buf = new byte[8192]; int n;
                        while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
                    }
                }
            }
            Bitmap input = bitmap;
            int max = Math.max(bitmap.getWidth(), bitmap.getHeight());
            if (max > 2200) {
                float scale = 2200f / max;
                input = Bitmap.createScaledBitmap(bitmap, Math.max(1, Math.round(bitmap.getWidth()*scale)), Math.max(1, Math.round(bitmap.getHeight()*scale)), true);
            }
            TessBaseAPI tess = new TessBaseAPI();
            try {
                if (!tess.init(base.getAbsolutePath(), languages)) throw new IOException("Не удалось загрузить языковые модели OCR");
                tess.setImage(input);
                String text = tess.getUTF8Text();
                return text == null ? "" : text;
            } finally {
                tess.end();
                if (input != bitmap) input.recycle();
            }
        }







        private int parsePort(String s){try{return Integer.parseInt(s==null?"8080":s.trim());}catch(Exception e){return 8080;}}
        private String enc(String s)throws Exception{return URLEncoder.encode(s==null?"":s,StandardCharsets.UTF_8.name());}
        private String safeMessage(Exception e){String m=e.getMessage();return m==null||m.trim().isEmpty()?e.getClass().getSimpleName():m;}
        private String errorJson(JSONObject r){String m=r.optString("errorText","");JSONObject d=r.optJSONObject("data");if(m.isEmpty()&&d!=null)m=d.optString("message","");if(m.isEmpty())m="Ошибка Smart POS";return "{\"status\":\"fail\",\"message\":"+JSONObject.quote(m)+"}";}
        private void sendKaspiProgress(String s,String sub){String js="window.onKaspiPaymentProgress&&window.onKaspiPaymentProgress("+JSONObject.quote(s==null?"":s)+","+JSONObject.quote(sub==null?"":sub)+")";runOnUiThread(()->webView.evaluateJavascript(js,null));}
        private void sendKaspiResult(String json){String js="window.onKaspiPaymentResult&&window.onKaspiPaymentResult("+JSONObject.quote(json)+")";runOnUiThread(()->webView.evaluateJavascript(js,null));}
        private void sendKaspiRegisterResult(String json){String js="window.onKaspiRegisterResult&&window.onKaspiRegisterResult("+JSONObject.quote(json)+")";runOnUiThread(()->webView.evaluateJavascript(js,null));}
        private JSONObject kaspiRequest(String host,int port,String path,String token,boolean verify,String... headers)throws Exception{
    URL u=new URL("https://"+host+":"+port+path);
    HttpsURLConnection c=(HttpsURLConnection)u.openConnection();
    c.setConnectTimeout(10000); c.setReadTimeout(15000);
    c.setRequestMethod("GET"); c.setUseCaches(false);
    c.setRequestProperty("Accept","application/json");
    if(token!=null&&!token.isEmpty()) c.setRequestProperty("accesstoken",token);
    for(int i=0;i+1<headers.length;i+=2)c.setRequestProperty(headers[i],headers[i+1]);
    if(!verify){ c.setSSLSocketFactory(insecureSocketFactory()); c.setHostnameVerifier((h,s)->true); }

    Log.i("OniKaspi","GET https://"+host+":"+port+path
        +(token!=null&&!token.isEmpty()?" [token]":""));
    if(headers.length>=2){
        StringBuilder hb=new StringBuilder();
        for(int i=0;i+1<headers.length;i+=2) hb.append(headers[i]).append("=").append(headers[i+1]).append(" ");
        Log.i("OniKaspi","headers: "+hb.toString().trim());
    }

    int code;
    try{
        code=c.getResponseCode();
    }catch(SSLHandshakeException e){
        Log.e("OniKaspi","SSLHandshakeException: "+e.getMessage(),e);
        throw new IOException("TLS не согласован: "+safeMessage(e),e);
    }catch(ConnectException e){
        Log.e("OniKaspi","ConnectException: "+e.getMessage(),e);
        throw new IOException("Терминал недоступен: "+safeMessage(e),e);
    }catch(SocketTimeoutException e){
        Log.e("OniKaspi","SocketTimeoutException: "+e.getMessage(),e);
        throw new IOException("Тайм-аут: "+safeMessage(e),e);
    }catch(IOException e){
        Log.e("OniKaspi","IOException: "+e.getMessage(),e);
        throw new IOException("Соединение прервано: "+safeMessage(e),e);
    }

    InputStream is=code>=200&&code<400?c.getInputStream():c.getErrorStream();
    String body="";
    if(is!=null){
        try(InputStream in=is){
            body=new String(in.readAllBytes(),StandardCharsets.UTF_8);
        }catch(IOException e){
            Log.e("OniKaspi","read body IOException: "+e.getMessage(),e);
        }
    }

    Log.i("OniKaspi","HTTP "+code+" body="+(body.length()>300?body.substring(0,300)+"…":body));

    if(code>=400){
        if(body.isEmpty()) throw new IOException("Терминал вернул HTTP "+code+" без тела");
        throw new IOException("Терминал вернул HTTP "+code+": "
            +(body.length()>200?body.substring(0,200)+"…":body));
    }
    if(body.isEmpty()) return new JSONObject();
    try{
        return new JSONObject(body);
    }catch(JSONException e){
        Log.e("OniKaspi","JSONException: "+e.getMessage()+" body="+body,e);
        throw new IOException("Некорректный ответ терминала: "+safeMessage(e),e);
    }
}
        private SSLSocketFactory insecureSocketFactory()throws Exception{TrustManager[] tm=new TrustManager[]{new X509TrustManager(){public X509Certificate[] getAcceptedIssuers(){return new X509Certificate[0];}public void checkClientTrusted(X509Certificate[] c,String a){}public void checkServerTrusted(X509Certificate[] c,String a){}}};SSLContext ctx=SSLContext.getInstance("TLSv1.2");ctx.init(null,tm,new SecureRandom());return ctx.getSocketFactory();}

        @JavascriptInterface
        public void shareToWhatsApp(String text) {
            runOnUiThread(() -> {
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType("text/plain");
                send.putExtra(Intent.EXTRA_TEXT, text == null ? "" : text);
                try {
                    send.setPackage("com.whatsapp");
                    startActivity(send);
                } catch (ActivityNotFoundException e) {
                    try {
                        send.setPackage(null);
                        startActivity(Intent.createChooser(send, "Поделиться сообщением"));
                    } catch (Exception ignored) {}
                }
            });
        }

private String readAll(InputStream in) throws IOException {
    if (in == null) return "";
    byte[] buf = new byte[8192];
    int n;
    StringBuilder sb = new StringBuilder();
    while ((n = in.read(buf)) > 0) sb.append(new String(buf, 0, n, StandardCharsets.UTF_8));
    return sb.toString();
}

private String callGemini(String input) throws Exception {
    SharedPreferences sp = getSharedPreferences("oni_ai", MODE_PRIVATE);
    String key = sp.getString("geminiApiKey", "").trim();
    if (key.isEmpty()) throw new IOException("Добавьте Gemini API-ключ");
    String model = sp.getString("geminiModel", "gemini-3.6-flash").trim();
    if (model.isEmpty()) model = "gemini-3.6-flash";
    return GeminiClient.generateText(key, model, input);
}

private String callGeminiWithSearch(String input) throws Exception {
    SharedPreferences sp = getSharedPreferences("oni_ai", MODE_PRIVATE);
    String key = sp.getString("geminiApiKey", "").trim();
    if (key.isEmpty()) throw new IOException("Добавьте Gemini API-ключ");
    String model = sp.getString("geminiModel", "gemini-3.6-flash").trim();
    if (model.isEmpty()) model = "gemini-3.6-flash";
    return GeminiClient.generateWithSearch(key, model, input);
}

private String callDeepSeek(String input) throws Exception {
    SharedPreferences sp = getSharedPreferences("oni_ai", MODE_PRIVATE);
    String key = sp.getString("deepseekApiKey", "").trim();
    if (key.isEmpty()) throw new IOException("Добавьте DeepSeek API-ключ");
    String model = sp.getString("deepseekModel", "deepseek-chat").trim();
    if (model.isEmpty() || model.startsWith("deepseek-reasoner")) model = "deepseek-chat";
    URL url = new URL("https://api.deepseek.com/chat/completions");
    HttpsURLConnection c = (HttpsURLConnection) url.openConnection();
    c.setRequestMethod("POST");
    c.setConnectTimeout(20000);
    c.setReadTimeout(60000);
    c.setDoOutput(true);
    c.setRequestProperty("Authorization", "Bearer " + key);
    c.setRequestProperty("Content-Type", "application/json");
    JSONObject body = new JSONObject();
    body.put("model", model);
    body.put("stream", false);
    JSONArray msgs = new JSONArray();
    msgs.put(new JSONObject().put("role", "user").put("content", input));
    body.put("messages", msgs);
    try (OutputStream os = c.getOutputStream()) { os.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
    int code = c.getResponseCode();
    InputStream is = code >= 200 && code < 300 ? c.getInputStream() : c.getErrorStream();
    String response = readAll(is);
    if (code < 200 || code >= 300) throw new IOException("Ошибка DeepSeek API: " + code);
    JSONObject r = new JSONObject(response);
    JSONArray choices = r.optJSONArray("choices");
    if (choices == null || choices.length() == 0) return "";
    JSONObject msg = choices.getJSONObject(0).optJSONObject("message");
    return msg == null ? "" : msg.optString("content", "");
}

private String callOpenAI(String input, boolean webSearch) throws Exception {
    SharedPreferences sp = getSharedPreferences("oni_ai", MODE_PRIVATE);
    String key = sp.getString("apiKey", "").trim();
    if (key.isEmpty()) throw new IOException("Добавьте API-ключ в разделе AI");
    String model = sp.getString("model", "gpt-4o-mini").trim();
    if (model.isEmpty()) model = "gpt-4o-mini";
    URL url = new URL("https://api.openai.com/v1/responses");
    HttpsURLConnection c = (HttpsURLConnection) url.openConnection();
    c.setRequestMethod("POST");
    c.setConnectTimeout(20000);
    c.setReadTimeout(90000);
    c.setDoOutput(true);
    c.setRequestProperty("Authorization", "Bearer " + key);
    c.setRequestProperty("Content-Type", "application/json");
    JSONObject body = new JSONObject();
    body.put("model", model);
    body.put("input", input);
    byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
    try (OutputStream os = c.getOutputStream()) { os.write(bytes); }
    int code = c.getResponseCode();
    InputStream is = code >= 200 && code < 300 ? c.getInputStream() : c.getErrorStream();
    String response = readAll(is);
    if (code < 200 || code >= 300) throw new IOException("Ошибка OpenAI API: " + code);
    JSONObject r = new JSONObject(response);
    String text = r.optString("output_text", "");
    if (!text.isEmpty()) return text;
    JSONArray output = r.optJSONArray("output");
    if (output != null) for (int i = 0; i < output.length(); i++) {
        JSONObject item = output.optJSONObject(i);
        if (item == null) continue;
        JSONArray content = item.optJSONArray("content");
        if (content == null) continue;
        for (int j = 0; j < content.length(); j++) {
            JSONObject part = content.optJSONObject(j);
            if (part != null && "output_text".equals(part.optString("type"))) return part.optString("text", "");
        }
    }
    return "";
}

private String callDeepSeekReasoner(String input) throws Exception {
    SharedPreferences sp = getSharedPreferences("oni_ai", MODE_PRIVATE);
    String key = sp.getString("deepseekApiKey", "").trim();
    if (key.isEmpty()) throw new IOException("Добавьте DeepSeek API-ключ");
    URL url = new URL("https://api.deepseek.com/chat/completions");
    HttpsURLConnection c = (HttpsURLConnection) url.openConnection();
    c.setRequestMethod("POST");
    c.setConnectTimeout(20000);
    c.setReadTimeout(120000);
    c.setDoOutput(true);
    c.setRequestProperty("Authorization", "Bearer " + key);
    c.setRequestProperty("Content-Type", "application/json");
    JSONObject body = new JSONObject();
    body.put("model", "deepseek-reasoner");
    body.put("stream", false);
    JSONArray msgs = new JSONArray();
    msgs.put(new JSONObject().put("role", "user").put("content", input));
    body.put("messages", msgs);
    try (OutputStream os = c.getOutputStream()) { os.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
    int code = c.getResponseCode();
    InputStream is = code >= 200 && code < 300 ? c.getInputStream() : c.getErrorStream();
    String response = readAll(is);
    if (code < 200 || code >= 300) throw new IOException("Ошибка DeepSeek Reasoner: " + code);
    JSONObject r = new JSONObject(response);
    JSONArray choices = r.optJSONArray("choices");
    if (choices == null || choices.length() == 0) return "";
    JSONObject msg = choices.getJSONObject(0).optJSONObject("message");
    return msg == null ? "" : msg.optString("content", "");
}

private String callAiProxy(String prompt, String provider, String imageBase64, String imageMime) throws Exception {
    if (aiIdToken == null || aiIdToken.isEmpty()) {
        throw new IOException("Нет авторизации для AI");
    }
    URL url = new URL(AI_PROXY_URL);
    HttpsURLConnection c = (HttpsURLConnection) url.openConnection();
    c.setRequestMethod("POST");
    c.setConnectTimeout(20000);
    c.setReadTimeout(120000);
    c.setDoOutput(true);
    c.setRequestProperty("Content-Type", "application/json");
    c.setRequestProperty("Authorization", "Bearer " + aiIdToken);

    JSONObject data = new JSONObject();
    data.put("provider", provider == null ? "auto" : provider);
    data.put("prompt", prompt == null ? "" : prompt);
    if (imageBase64 != null && !imageBase64.isEmpty()) {
        data.put("imageBase64", imageBase64);
        data.put("imageMime", imageMime == null ? "image/jpeg" : imageMime);
    }
    JSONObject body = new JSONObject();
    body.put("data", data);

    try (OutputStream os = c.getOutputStream()) {
        os.write(body.toString().getBytes(StandardCharsets.UTF_8));
    }

    int code = c.getResponseCode();
    InputStream is = code >= 200 && code < 300 ? c.getInputStream() : c.getErrorStream();
    String response = readAll(is);

    if (code < 200 || code >= 300) {
        String errMsg = "AI proxy HTTP " + code;
        try {
            JSONObject er = new JSONObject(response);
            JSONObject errorObj = er.optJSONObject("error");
            if (errorObj != null) {
                String m = errorObj.optString("message", "");
                if (m != null && !m.isEmpty()) errMsg = m;
            }
        } catch (Exception ignored) {}
        throw new IOException(errMsg);
    }

    JSONObject r = new JSONObject(response);
    JSONObject result = r.optJSONObject("result");
    if (result == null) {
        throw new IOException("Некорректный ответ AI proxy");
    }
    String text = result.optString("text", "");
    String usedProvider = result.optString("provider", "");
    android.util.Log.i("On.i AI", "aiProxy OK via " + usedProvider);
    return text;
}

private String callSelectedProvider(String input, boolean webSearch) throws Exception {
    // 1. Пытаемся через серверный AI-прокси (ключи на сервере, безопасно)
    if (aiIdToken != null && !aiIdToken.isEmpty()) {
        try {
            android.util.Log.i("On.i AI", "Using aiProxy (server)");
            String r = callAiProxy(input, "auto", null, null);
            if (r != null && !r.trim().isEmpty()) {
                return r;
            }
            android.util.Log.w("On.i AI", "aiProxy returned empty, fallback to direct");
        } catch (Exception e) {
            android.util.Log.w("On.i AI", "aiProxy failed: " + (e.getMessage() == null ? "" : e.getMessage()));
        }
    }

    // 2. Fallback: прямые вызовы (старое поведение, если функция недоступна)
    SharedPreferences sp = getSharedPreferences("oni_ai", MODE_PRIVATE);
    boolean geminiOn = sp.getBoolean("geminiEnabled", true);
    boolean openaiOn = sp.getBoolean("openaiEnabled", false);
    boolean deepseekOn = sp.getBoolean("deepseekEnabled", false);
    String geminiKey = sp.getString("geminiApiKey", "").trim();
    String openaiKey = sp.getString("apiKey", "").trim();
    String deepseekKey = sp.getString("deepseekApiKey", "").trim();
    boolean geminiUsable = geminiOn && !geminiKey.isEmpty();
    boolean openaiUsable = openaiOn && !openaiKey.isEmpty();
    boolean deepseekUsable = deepseekOn && !deepseekKey.isEmpty();

    if (geminiUsable) {
        try {
            if (webSearch) return callGeminiWithSearch(input);
            return callGemini(input);
        } catch (Exception e) {
            android.util.Log.w("On.i AI", "Gemini direct failed", e);
        }
    }
    if (openaiUsable) return callOpenAI(input, webSearch);
    if (deepseekUsable) {
        boolean useReasoner = false;
        if (input != null) {
            String lower = input.toLowerCase();
            String kaz = "\u04d9\u0493\u049b\u04a3\u04e9\u04b1\u04af\u04bb\u0456";
            for (int i = 0; i < lower.length(); i++) {
                if (kaz.indexOf(lower.charAt(i)) >= 0) { useReasoner = true; break; }
            }
        }
        if (useReasoner) {
            try { return callDeepSeekReasoner(input); } catch (Exception e) { return callDeepSeek(input); }
        }
        return callDeepSeek(input);
    }
    throw new IOException("Все AI-провайдеры недоступны.");
}

private String extractAnswerText(String raw) {
    if (raw == null) return "";
    String text = raw.trim();
    if (text.startsWith("```")) {
        text = text.replaceAll("^```[a-zA-Z]*\\s*", "").replaceAll("```\\s*$", "").trim();
    }
    if (!text.startsWith("{")) return text;
    int firstBrace = text.indexOf('{');
    int lastBrace = text.lastIndexOf('}');
    if (firstBrace < 0 || lastBrace <= firstBrace) return text;
    String jsonPart = text.substring(firstBrace, lastBrace + 1);
    try {
        JSONObject obj = new JSONObject(jsonPart);
        String found = pickStringFromJson(obj, 0);
        if (found != null && !found.isEmpty()) return found;
        return text;
    } catch (Exception e) {
        return text;
    }
}

private String pickStringFromJson(JSONObject obj, int depth) {
    if (obj == null || depth > 5) return null;
    String[] knownKeys = {
        "answer","response","reply","text","message","content",
        "result","output","data","body","msg","value","string",
        "replyText","answerText","messageText","responseText",
        "textResponse","answer_text","response_text","ai_answer",
        "aiAnswer","aiResponse","ai_reply","aiReply","assistant",
        "assistantReply","assistant_answer","completion","completions",
        "generated_text","generatedText","outputText","output_text",
        "returnValue","return_value","payload","valueText",
        "chat_response","chatResponse","chat_reply","chatReply",
        "conversation","dialog","dialogue","speech","say","spoken",
        "plainText","plain_text","cleanText","clean_text",
        "finalAnswer","final_answer","shortAnswer","short_answer",
        "summary","details","explanation","info","information"
    };
    for (String k : knownKeys) {
        if (obj.has(k)) {
            Object v = obj.opt(k);
            if (v instanceof String) {
                String s = ((String) v).trim();
                if (!s.isEmpty()) return s;
            } else if (v instanceof JSONObject) {
                String s = pickStringFromJson((JSONObject) v, depth + 1);
                if (s != null && !s.isEmpty()) return s;
            } else if (v instanceof JSONArray) {
                String s = pickStringFromArray((JSONArray) v, depth + 1);
                if (s != null && !s.isEmpty()) return s;
            }
        }
    }
    java.util.Iterator<String> it = obj.keys();
    while (it.hasNext()) {
        String k = it.next();
        Object v = obj.opt(k);
        if (v instanceof String) {
            String s = ((String) v).trim();
            if (!s.isEmpty()) return s;
        }
    }
    it = obj.keys();
    while (it.hasNext()) {
        String k = it.next();
        Object v = obj.opt(k);
        if (v instanceof JSONObject) {
            String s = pickStringFromJson((JSONObject) v, depth + 1);
            if (s != null && !s.isEmpty()) return s;
        } else if (v instanceof JSONArray) {
            String s = pickStringFromArray((JSONArray) v, depth + 1);
            if (s != null && !s.isEmpty()) return s;
        }
    }
    return null;
}

private String pickStringFromArray(JSONArray arr, int depth) {
    if (arr == null || depth > 5) return null;
    for (int i = 0; i < arr.length(); i++) {
        try {
            Object v = arr.get(i);
            if (v instanceof String) {
                String s = ((String) v).trim();
                if (!s.isEmpty()) return s;
            } else if (v instanceof JSONObject) {
                String s = pickStringFromJson((JSONObject) v, depth + 1);
                if (s != null && !s.isEmpty()) return s;
            } else if (v instanceof JSONArray) {
                String s = pickStringFromArray((JSONArray) v, depth + 1);
                if (s != null && !s.isEmpty()) return s;
            }
        } catch (Exception ignored) {}
    }
    return null;
}

@JavascriptInterface
public void testAIConnection() {
    new Thread(new Runnable() { public void run() {
        SharedPreferences sp = getSharedPreferences("oni_ai", MODE_PRIVATE);
        SharedPreferences.Editor editor = sp.edit();
        StringBuilder report = new StringBuilder();

        boolean geminiOn = sp.getBoolean("geminiEnabled", true);
        String geminiKey = sp.getString("geminiApiKey", "").trim();
        if (!geminiOn) {
            editor.putString("geminiStatus", "disabled");
            report.append("Gemini: выключен. ");
        } else if (geminiKey.isEmpty()) {
            editor.putString("geminiStatus", "no_key");
            report.append("Gemini: ключ не задан. ");
        } else {
            try {
                String model = sp.getString("geminiModel", "gemini-3.6-flash").trim();
                if (model.isEmpty()) model = "gemini-3.6-flash";
                String r = GeminiClient.generateText(geminiKey, model, "OK");
                if (r != null && !r.trim().isEmpty()) {
                    editor.putString("geminiStatus", "ready");
                    report.append("Gemini: подключён. ");
                } else {
                    editor.putString("geminiStatus", "error");
                    report.append("Gemini: пустой ответ. ");
                }
            } catch (Exception e) {
                String m = e.getMessage() == null ? "неизвестно" : e.getMessage();
                String status = "error";
                if (m.contains("429")) status = "rate_limited";
                else if (m.contains("401") || m.contains("403") || m.toLowerCase().contains("api key")) status = "invalid_key";
                editor.putString("geminiStatus", status);
                if (m.length() > 100) m = m.substring(0, 100) + "…";
                report.append("Gemini: ").append(m).append(". ");
            }
        }

        boolean dsOn = sp.getBoolean("deepseekEnabled", false);
        String dsKey = sp.getString("deepseekApiKey", "").trim();
        if (!dsOn) {
            editor.putString("deepseekStatus", "disabled");
            report.append("DeepSeek: выключен. ");
        } else if (dsKey.isEmpty()) {
            editor.putString("deepseekStatus", "no_key");
            report.append("DeepSeek: ключ не задан. ");
        } else {
            try {
                String r = callDeepSeek("OK");
                if (r != null && !r.trim().isEmpty()) {
                    editor.putString("deepseekStatus", "ready");
                    report.append("DeepSeek: подключён. ");
                } else {
                    editor.putString("deepseekStatus", "error");
                    report.append("DeepSeek: пустой ответ. ");
                }
            } catch (Exception e) {
                String m = e.getMessage() == null ? "неизвестно" : e.getMessage();
                String status = "error";
                if (m.contains("429")) status = "rate_limited";
                else if (m.contains("401") || m.contains("403")) status = "invalid_key";
                editor.putString("deepseekStatus", status);
                if (m.length() > 100) m = m.substring(0, 100) + "…";
                report.append("DeepSeek: ").append(m).append(". ");
            }
        }

        boolean oaOn = sp.getBoolean("openaiEnabled", false);
        String oaKey = sp.getString("apiKey", "").trim();
        if (!oaOn) {
            editor.putString("openaiStatus", "disabled");
            report.append("OpenAI: выключен. ");
        } else if (oaKey.isEmpty()) {
            editor.putString("openaiStatus", "no_key");
            report.append("OpenAI: ключ не задан. ");
        } else {
            try {
                String r = callOpenAI("OK", false);
                if (r != null && !r.trim().isEmpty()) {
                    editor.putString("openaiStatus", "ready");
                    report.append("OpenAI: подключён. ");
                } else {
                    editor.putString("openaiStatus", "error");
                    report.append("OpenAI: пустой ответ. ");
                }
            } catch (Exception e) {
                String m = e.getMessage() == null ? "неизвестно" : e.getMessage();
                String status = "error";
                if (m.contains("429")) status = "rate_limited";
                else if (m.contains("401") || m.contains("403")) status = "invalid_key";
                editor.putString("openaiStatus", status);
                if (m.length() > 100) m = m.substring(0, 100) + "…";
                report.append("OpenAI: ").append(m).append(". ");
            }
        }

        editor.apply();

        JSONObject out = new JSONObject();
        try {
            out.put("status", "success");
            out.put("message", report.toString().trim());
            out.put("state", new JSONObject(getAIState()));
        } catch (Exception ignored) {}

        final String js = "if(window.onAITestResult){try{window.onAITestResult(" + JSONObject.quote(out.toString()) + ");}catch(e){}}";
        if (webView != null) {
            webView.post(new Runnable() { public void run() {
                try { webView.evaluateJavascript(js, null); } catch (Exception ignored) {}
            }});
        }
    }}).start();
}

@JavascriptInterface
public void askAIChat(final String message, final String historyJson, final String webSearchFlag, final String catalogJson) {
    final String msg = message == null ? "" : message.trim();
    final boolean useSearch = "1".equals(webSearchFlag) || "true".equalsIgnoreCase(webSearchFlag);
    final String catalog = catalogJson == null ? "" : catalogJson.trim();
    final String hist = historyJson == null ? "" : historyJson.trim();
    if (msg.isEmpty()) {
        postAIChatResult("{\"status\":\"fail\",\"message\":\"Пустое сообщение\"}");
        return;
    }
    new Thread(new Runnable() { public void run() {
        try {
            StringBuilder prompt = new StringBuilder();
            prompt.append("Ты — продавец-консультант магазина On.i. Покупатель спрашивает про товары, которые есть в НАШЕМ магазине.\n\n");
            prompt.append("ГЛАВНАЯ ЗАДАЧА:\n");
            prompt.append("Покупатель может задать вопрос двумя способами:\n");
            prompt.append("А) По категории — «Какие БАДы у вас есть?», «Какой парфюм?», «Какие книги?»\n");
            prompt.append("Б) По симптому / проблеме — «Что от головной боли?», «Что от кашля?», «Что для иммунитета?»\n\n");
            prompt.append("КАК ОТВЕЧАТЬ:\n");
            prompt.append("1. По КАТЕГОРИИ — перечисли товары этой категории из каталога (название, цена, остаток).\n");
            prompt.append("2. По СИМПТОМУ — найди товары, которые помогают от этого симптома.\n");
            prompt.append("3. Покажи покупателю с ценой и остатком.\n");
            prompt.append("4. Если товаров нет — честно скажи: «В нашем магазине сейчас нет товаров от [симптом]. Можем завезти под заказ».\n");
            prompt.append("5. НЕ придумывай товары, которых нет в каталоге.\n");
            prompt.append("6. Не задавай встречных вопросов, не извиняйся.\n\n");
            prompt.append("ФОРМАТ ОТВЕТА:\n");
            prompt.append("— Только обычный текст. Никакого JSON.\n");
            prompt.append("— На русском (или казахском, если вопрос на казахском).\n");
            prompt.append("— Без markdown.\n");
            prompt.append("— Короткий список через тире.\n\n");

            if (!catalog.isEmpty()) {
                prompt.append("КАТАЛОГ МАГАЗИНА (по категориям, только товары в наличии):\n");
                prompt.append(catalog);
                prompt.append("\n\n");
            } else {
                prompt.append("КАТАЛОГ ПУСТ — товаров в наличии сейчас нет. Скажи покупателю честно и предложи завезти под заказ.\n\n");
            }

            if (!hist.isEmpty()) {
                prompt.append("ИСТОРИЯ ДИАЛОГА:\n");
                prompt.append(hist);
                prompt.append("\n");
            }

            prompt.append("ВОПРОС ПОКУПАТЕЛЯ: ").append(msg);

            String raw = callSelectedProvider(prompt.toString(), useSearch);
            String answer = extractAnswerText(raw);

            JSONObject out = new JSONObject();
            out.put("status", "success");
            out.put("answer", answer == null ? "" : answer);
            postAIChatResult(out.toString());
        } catch (Exception e) {
            try {
                JSONObject out = new JSONObject();
                out.put("status", "fail");
                out.put("message", e.getMessage() == null ? "Ошибка запроса" : e.getMessage());
                postAIChatResult(out.toString());
            } catch (Exception ignored) {}
        }
    }}).start();
}

private void postAIChatResult(final String json) {
    if (webView == null) return;
    final String js = "if(window.onAIChatResult){try{window.onAIChatResult(" + JSONObject.quote(json) + ");}catch(e){}}";
    webView.post(new Runnable() { public void run() {
        try { webView.evaluateJavascript(js, null); } catch (Exception ignored) {}
    }});
}

@JavascriptInterface
public void saveGeminiSettings(String apiKey, String model) {
    SharedPreferences sp = getSharedPreferences("oni_ai", MODE_PRIVATE);
    SharedPreferences.Editor e = sp.edit();
    if (apiKey != null && !apiKey.trim().isEmpty()) {
        e.putString("geminiApiKey", apiKey.trim());
    }
    if (model != null && !model.trim().isEmpty()) {
        e.putString("geminiModel", model.trim());
    }
    e.apply();
}

@JavascriptInterface
public String getGeminiSettings() {
    SharedPreferences sp = getSharedPreferences("oni_ai", MODE_PRIVATE);
    JSONObject o = new JSONObject();
    try {
        String stored = sp.getString("geminiModel", "gemini-3.6-flash");
        if (stored == null || stored.trim().isEmpty()
                || stored.startsWith("gemini-2.")
                || stored.contains("gemini-2.0")
                || stored.contains("gemini-1.")) {
            stored = "gemini-3.6-flash";
            SharedPreferences.Editor e = sp.edit();
            e.putString("geminiModel", stored);
            e.apply();
        }
        o.put("keySet", !sp.getString("geminiApiKey", "").trim().isEmpty());
        o.put("model", stored);
        o.put("enabled", sp.getBoolean("geminiEnabled", true));
    } catch (Exception ignored) {}
    return o.toString();
}

@JavascriptInterface
public void saveProviderFlags(String openaiFlag, String deepseekFlag, String geminiFlag) {
    SharedPreferences sp = getSharedPreferences("oni_ai", MODE_PRIVATE);
    SharedPreferences.Editor e = sp.edit();
    boolean oaB = "true".equalsIgnoreCase(openaiFlag) || "1".equals(openaiFlag);
    boolean dsB = "true".equalsIgnoreCase(deepseekFlag) || "1".equals(deepseekFlag);
    boolean gB  = "true".equalsIgnoreCase(geminiFlag) || "1".equals(geminiFlag);
    e.putBoolean("openaiEnabled", oaB);
    e.putBoolean("deepseekEnabled", dsB);
    e.putBoolean("geminiEnabled", gB);
    e.putBoolean("enabled", oaB || dsB || gB);
    e.apply();
}

@JavascriptInterface
public String getProviderFlags() {
    SharedPreferences sp = getSharedPreferences("oni_ai", MODE_PRIVATE);
    JSONObject o = new JSONObject();
    try {
        o.put("openai", sp.getBoolean("openaiEnabled", false));
        o.put("deepseek", sp.getBoolean("deepseekEnabled", false));
        o.put("gemini", sp.getBoolean("geminiEnabled", true));
    } catch (Exception ignored) {}
    return o.toString();
}

@JavascriptInterface
public String getAIState() {
    SharedPreferences sp = getSharedPreferences("oni_ai", MODE_PRIVATE);
    JSONObject out = new JSONObject();
    try {
        JSONObject g = new JSONObject();
        String gModel = sp.getString("geminiModel", "gemini-3.6-flash");
        if (gModel.startsWith("gemini-2.") || gModel.contains("gemini-2.0") || gModel.contains("gemini-1.")) {
            gModel = "gemini-3.6-flash";
        }
        g.put("enabled", sp.getBoolean("geminiEnabled", true));
        g.put("keySet", !sp.getString("geminiApiKey", "").trim().isEmpty());
        g.put("model", gModel);
        g.put("status", sp.getString("geminiStatus", "unknown"));

        JSONObject oa = new JSONObject();
        oa.put("enabled", sp.getBoolean("openaiEnabled", false));
        oa.put("keySet", !sp.getString("apiKey", "").trim().isEmpty());
        oa.put("model", sp.getString("model", "gpt-4o-mini"));
        oa.put("status", sp.getString("openaiStatus", "unknown"));

        JSONObject ds = new JSONObject();
        ds.put("enabled", sp.getBoolean("deepseekEnabled", false));
        ds.put("keySet", !sp.getString("deepseekApiKey", "").trim().isEmpty());
        ds.put("model", sp.getString("deepseekModel", "deepseek-chat"));
        ds.put("status", sp.getString("deepseekStatus", "unknown"));

        out.put("gemini", g);
        out.put("openai", oa);
        out.put("deepseek", ds);
    } catch (Exception ignored) {}
    return out.toString();
}

@JavascriptInterface
public void saveAIState(String json) {
    try {
        JSONObject o = new JSONObject(json);
        SharedPreferences sp = getSharedPreferences("oni_ai", MODE_PRIVATE);
        SharedPreferences.Editor e = sp.edit();

        boolean anyEnabled = false;

        if (o.has("gemini")) {
            JSONObject g = o.getJSONObject("gemini");
            boolean newEnabled = g.optBoolean("enabled", true);
            String newKey = g.optString("key", "").trim();
            String oldKey = sp.getString("geminiApiKey", "").trim();
            boolean oldEnabled = sp.getBoolean("geminiEnabled", true);
            String newModel = g.optString("model", "").trim();

            e.putBoolean("geminiEnabled", newEnabled);
            if (!newKey.isEmpty()) e.putString("geminiApiKey", newKey);
            if (!newModel.isEmpty()) e.putString("geminiModel", newModel);

            if (!newEnabled) e.putString("geminiStatus", "disabled");
            else if (newKey.isEmpty() && oldKey.isEmpty()) e.putString("geminiStatus", "no_key");
            else if (!newKey.isEmpty() && !newKey.equals(oldKey)) e.putString("geminiStatus", "unknown");
            else if (newEnabled != oldEnabled) e.putString("geminiStatus", "unknown");

            if (newEnabled) anyEnabled = true;
        }

        if (o.has("openai")) {
            JSONObject oa = o.getJSONObject("openai");
            boolean newEnabled = oa.optBoolean("enabled", false);
            String newKey = oa.optString("key", "").trim();
            String oldKey = sp.getString("apiKey", "").trim();
            boolean oldEnabled = sp.getBoolean("openaiEnabled", false);
            String newModel = oa.optString("model", "").trim();

            e.putBoolean("openaiEnabled", newEnabled);
            if (!newKey.isEmpty()) e.putString("apiKey", newKey);
            if (!newModel.isEmpty()) e.putString("model", newModel);

            if (!newEnabled) e.putString("openaiStatus", "disabled");
            else if (newKey.isEmpty() && oldKey.isEmpty()) e.putString("openaiStatus", "no_key");
            else if (!newKey.isEmpty() && !newKey.equals(oldKey)) e.putString("openaiStatus", "unknown");
            else if (newEnabled != oldEnabled) e.putString("openaiStatus", "unknown");

            if (newEnabled) anyEnabled = true;
        }

        if (o.has("deepseek")) {
            JSONObject ds = o.getJSONObject("deepseek");
            boolean newEnabled = ds.optBoolean("enabled", false);
            String newKey = ds.optString("key", "").trim();
            String oldKey = sp.getString("deepseekApiKey", "").trim();
            boolean oldEnabled = sp.getBoolean("deepseekEnabled", false);
            String newModel = ds.optString("model", "").trim();

            e.putBoolean("deepseekEnabled", newEnabled);
            if (!newKey.isEmpty()) e.putString("deepseekApiKey", newKey);
            if (!newModel.isEmpty()) e.putString("deepseekModel", newModel);

            if (!newEnabled) e.putString("deepseekStatus", "disabled");
            else if (newKey.isEmpty() && oldKey.isEmpty()) e.putString("deepseekStatus", "no_key");
            else if (!newKey.isEmpty() && !newKey.equals(oldKey)) e.putString("deepseekStatus", "unknown");
            else if (newEnabled != oldEnabled) e.putString("deepseekStatus", "unknown");

            if (newEnabled) anyEnabled = true;
        }

        e.putBoolean("enabled", anyEnabled);
        e.apply();
    } catch (Exception e) {
        android.util.Log.e("On.i AI", "saveAIState failed: " + e.getMessage());
    }
}

@JavascriptInterface
public void lookupProductByAI(final String query, final String typeHint, final String description) {
    final String q = query == null ? "" : query.trim();
    if (q.isEmpty()) {
        postProductLookupResult("{\"status\":\"fail\",\"message\":\"Пустой запрос\"}");
        return;
    }
    new Thread(new Runnable() { public void run() {
        try {
            String promptTemplate = """
Ты — эксперт по товарам с широкой базой знаний. Ты знаешь миллионы книг, товаров, брендов на разных языках, включая казахские книги.

ОПРЕДЕЛИ ЯЗЫК ПО НАЗВАНИЮ:
1. Казахские буквы (ә, ғ, қ, ң, ө, ұ, ү, һ, і) или казахские слова → ЯЗЫК: КАЗАХСКИЙ
2. Русские буквы без казахских → ЯЗЫК: РУССКИЙ
3. Латинские буквы → язык оригинала может быть любым (iPhone, Louis Vuitton, Nivea)

ОТВЕЧАЙ НА ТОМ ЖЕ ЯЗЫКЕ:
— Казахская книга → description, purpose, subtype на КАЗАХСКОМ. Название и автор тоже на казахском.
— Русская книга → на русском
— Товары и бренды (iPhone, Nivea, Louis Vuitton) → на русском (для удобства русскоязычных покупателей)
— Бренды и названия моделей НЕ переводить (Louis Vuitton, Nivea, iPhone)

ВСПОМИНАЙ ИЗ БАЗЫ:
Ты обучался на миллионах казахских страниц (kitap.kz, abai.kz, adebiportal.kz, massaget.kz, goodreads). Вспоминай казахские книги. Если помнишь — дай полное название, автора, год, описание.
Пример казахской классики, которую ты знаешь:
— Абай жолы (Мухтар Әуезов, 1942)
— Көшпенділер (Ілияс Есенберлин, 1969)
— Қан мен тер (Әбдіжәміл Нұрпейісов, 1961)
— Адамзаттың асыл тәжі (Дамира Өмірзақызы, 2004)

НЕ ВЫДУМЫВАЙ:
Если не уверен — оставь поле пустым или поставь identified=false. НЕ придумывай автора, год, содержание, которых не знаешь.

КАК ПИСАТЬ:
— Без "возможно", "вероятно", "похоже" в основных полях. Сомнения → в confidence (0-100) и reasoning.
— productName — точное оригинальное название
— author — для книги (Мухтар Әуезов, Фёдор Достоевский, Дамира Өмірзақызы)
— year — год выпуска/публикации
— brand — для товаров
— category — Парфюм, БАД / витамины, Книга, Электроника, Косметика, Другое
— description — 3-5 предложений
— purpose — для чего
— notes — только для парфюма (ноты)
— composition, dosage — для БАД и косметики
— warnings — предупреждения
— reasoning — 1-2 предложения: как помнишь/определил

ПРИМЕРЫ:

"Абай жолы":
{"identified":true,"confidence":85,"productName":"Абай жолы","author":"Мұхтар Әуезов","category":"Книга","subtype":"Роман-эпопея","description":"Мұхтар Әуезовтің қазақ ақыны Абай Құнанбаевтың өмірі туралы роман-эпопеясы. 1942-1947 жылдары төрт кітап болып жарық көрген. Қазақ әдебиетінің басты шығармаларының бірі. Абайдың қалыптасуы, әділеттілік пен ағарту үшін күресі баяндалады.","purpose":"Көркем әдебиет, қазақ прозасының классикасы","year":"1942","reasoning":"Қазақ әдебиетінің классикалық шығармасын білемін"}

"Адамзаттың асыл тәжі":
{"identified":true,"confidence":55,"productName":"Адамзаттың асыл тәжі: Мұхаммед пайғамбардың өмірі","author":"Дамира Өмірзақызы","category":"Книга","subtype":"Рухани-ағарту әдебиеті","description":"Хазіреті Мұхаммед (с.а.у.) пайғамбардың өмірі туралы қазақ тіліндегі рухани-ағарту кітабы. Пайғамбардың дүниеге келуі, балалық және жастық шағы, пайғамбарлықты қабылдауы, алғашқы мұсылмандар және Мәдинаға көшуі баяндалады.","purpose":"Рухани ағарту, имандылыққа тәрбиелеу","year":"2004","reasoning":"Қазақ дереккөздерінен білемін"}

"Nivea Creme":
{"identified":true,"confidence":95,"productName":"Nivea Creme","brand":"Nivea","category":"Косметика","subtype":"Универсальный крем","description":"Классический универсальный крем Nivea в синей жестяной банке. Производится с 1911 года компанией Beiersdorf (Германия). Увлажняет кожу лица, рук и тела.","purpose":"Увлажнение и уход за кожей","composition":"Вода, пантенол, глицерин, ланолин, минеральное масло","dosage":"Наносить на очищенную кожу по мере необходимости","reasoning":"Знаю бренд и продукт"}

"Louis Vuitton L'Immensité":
{"identified":true,"confidence":92,"productName":"Louis Vuitton L'Immensité","brand":"Louis Vuitton","category":"Парфюм","subtype":"Мужской древесно-пряный парфюм","description":"Мужской парфюм от Louis Vuitton, выпущен в 2018 году. Создан парфюмером Жаком Кавалье. Древесно-пряный аромат с нотами цитрусов, специй и тёплого дерева.","purpose":"Создание выразительного мужского образа","notes":"бергамот, грейпфрут, мандарин, перец, ладан, имбирь, кедр, сандал, амбра","year":"2018","reasoning":"Знаю бренд и конкретный аромат"}

"Преступление и наказание":
{"identified":true,"confidence":95,"productName":"Преступление и наказание","author":"Фёдор Михайлович Достоевский","category":"Книга","subtype":"Роман","description":"Роман Фёдора Достоевского, опубликован в 1866 году. История бывшего студента Раскольникова, совершившего убийство и переживающего нравственные терзания.","purpose":"Художественная литература, классика","year":"1866","reasoning":"Знаю классическое произведение"}

Если совсем не знаешь:
{"identified":false,"confidence":0,"description":"Информация не найдена","reasoning":"Не могу распознать товар"}

ФОРМАТ — ТОЛЬКО JSON без Markdown:
{"identified":true,"confidence":0,"productName":"","brand":"","category":"","subtype":"","description":"","purpose":"","composition":"","dosage":"","notes":"","year":"","author":"","warnings":"","reasoning":""}

ТОВАР: """;
            String prompt = promptTemplate + q;
            String raw = callSelectedProvider(prompt, false);
            String text = raw == null ? "" : raw.trim();

            if (text.startsWith("```")) {
                text = text.replaceAll("^```[a-zA-Z]*\\s*", "").replaceAll("```\\s*$", "").trim();
            }
            int startBrace = text.indexOf('{');
            int endBrace = text.lastIndexOf('}');
            if (startBrace >= 0 && endBrace > startBrace) text = text.substring(startBrace, endBrace + 1);

            org.json.JSONObject parsed = new org.json.JSONObject(text);

            org.json.JSONObject out = new org.json.JSONObject();
            out.put("status", "success");
            out.put("identified", parsed.optBoolean("identified", true));
            out.put("confidence", parsed.optInt("confidence", 0));
            out.put("productName", parsed.optString("productName", q));
            out.put("brand", parsed.optString("brand", ""));
            out.put("category", parsed.optString("category", "Другое"));
            out.put("subtype", parsed.optString("subtype", ""));
            out.put("description", parsed.optString("description", ""));
            out.put("purpose", parsed.optString("purpose", ""));
            out.put("composition", parsed.optString("composition", ""));
            out.put("dosage", parsed.optString("dosage", ""));
            out.put("notes", parsed.optString("notes", ""));
            out.put("year", parsed.optString("year", ""));
            out.put("author", parsed.optString("author", ""));
            out.put("warnings", parsed.optString("warnings", ""));
            out.put("reasoning", parsed.optString("reasoning", ""));
            postProductLookupResult(out.toString());
        } catch (Exception e) {
            String msg = e.getMessage() == null ? String.valueOf(e) : e.getMessage();
            try {
                org.json.JSONObject err = new org.json.JSONObject();
                err.put("status", "fail");
                err.put("message", msg);
                postProductLookupResult(err.toString());
            } catch (Exception ignored) {
                postProductLookupResult("{\"status\":\"fail\",\"message\":\"Ошибка при поиске товара\"}");
            }
        }
    }}).start();
}

@JavascriptInterface
public void lookupProductByName(final String query, final String typeHint, final String description) {
    lookupProductByAI(query, typeHint, description);
}

@JavascriptInterface
public void lookupProductDescriptionFull(final String query, final String typeHint, final String description) {
    lookupProductByAI(query, typeHint, description);
}

private void postProductLookupResult(final String json) {
    if (webView == null) return;
    webView.post(new Runnable() { public void run() {
        try {
            String js =
                "(function(){try{" +
                "var d=" + json + ";" +
                "var st=document.getElementById('name-lookup-status');" +
                "if(!d||d.status!=='success'){if(st)st.textContent='Ошибка: '+((d&&d.message)||'поиск не удался');return;}" +
                "if(d.identified===false){if(st)st.textContent='ИИ: товар не распознан'+(d.reasoning?(' — '+d.reasoning):'');return;}" +
                "var ne=document.getElementById('f-name');" +
                "var ce=document.getElementById('f-category');" +
                "var de=document.getElementById('f-description');" +
                "var pe=document.getElementById('f-purpose');" +
                "if(d.productName&&ne&&!ne.value.trim())ne.value=d.productName;" +
                "if(d.category&&ce)ce.value=d.category;" +
                "if(de){" +
                "  var L=[];" +
                "  if(d.author)L.push('Автор: '+d.author);" +
                "  if(d.year)L.push('Год: '+d.year);" +
                "  if(d.brand)L.push('Бренд: '+d.brand);" +
                "  if(d.subtype)L.push('Тип: '+d.subtype);" +
                "  if(d.description)L.push(d.description);" +
                "  if(d.composition)L.push('Состав: '+d.composition);" +
                "  if(d.dosage)L.push('Применение: '+d.dosage);" +
                "  if(d.notes)L.push('Ноты: '+d.notes);" +
                "  if(d.warnings)L.push('Важно: '+d.warnings);" +
                "  if(L.length)de.value=L.join('\\n\\n');" +
                "}" +
                "if(pe&&d.purpose)pe.value=d.purpose;" +
                "if(st)st.textContent='Готово: '+(d.category||'товар')+(d.confidence?(' · уверенность '+d.confidence+'%'):'');" +
                "}catch(e){console.error('lookupResult',e);}})();";
            webView.evaluateJavascript(js, null);
        } catch (Exception ignored) {}
    }});
}

@JavascriptInterface
public void recognizeProductPhoto(final String dataUrl, final String langs) {
    if (dataUrl == null || dataUrl.isEmpty()) {
        postOcrResult("{\"status\":\"fail\",\"message\":\"Нет данных изображения\"}");
        return;
    }
    new Thread(new Runnable() { public void run() {
        String mime = "image/jpeg";
        String b64 = dataUrl;
        try {
            int comma = dataUrl.indexOf(',');
            if (dataUrl.startsWith("data:") && comma > 0) {
                String header = dataUrl.substring(5, comma);
                int semi = header.indexOf(';');
                if (semi > 0) mime = header.substring(0, semi);
                b64 = dataUrl.substring(comma + 1);
            }
        } catch (Exception ignored) {}

        // ============ ПОПЫТКА 1: GEMINI VISION ============
        try {
            SharedPreferences sp = getSharedPreferences("oni_ai", MODE_PRIVATE);
            String key = sp.getString("geminiApiKey", "").trim();
            if (key.isEmpty()) throw new IOException("Нет Gemini API-ключа");
            String model = sp.getString("geminiModel", "gemini-3.6-flash").trim();
            if (model.isEmpty()
                    || model.startsWith("gemini-2.")
                    || model.contains("gemini-2.0")
                    || model.contains("gemini-1.")) {
                model = "gemini-3.6-flash";
                SharedPreferences.Editor e = sp.edit();
                e.putString("geminiModel", model);
                e.apply();
            }

            String prompt =
                "Ты — эксперт по товарам. Посмотри на фото и определи, что это за товар.\n\n" +
                "ПРАВИЛА:\n" +
                "1. Верни ТОЛЬКО валидный JSON без markdown.\n" +
                "2. Если на фото книга — обязательно прочитай название и автора с обложки.\n" +
                "3. Все поля заполняй на русском языке (кроме названий брендов и оригинальных названий книг).\n" +
                "4. Если на фото несколько товаров — выбери главный.\n" +
                "5. Если вообще не можешь распознать — верни {\"productName\":\"\",\"category\":\"Товар\",\"description\":\"Не удалось распознать\"}.\n\n" +
                "ФОРМАТ:\n" +
                "{\n" +
                "  \"productName\": \"точное название с этикетки\",\n" +
                "  \"author\": \"автор, если книга\",\n" +
                "  \"brand\": \"бренд, если товар\",\n" +
                "  \"category\": \"Парфюм, БАД / витамины, Книга, Электроника, Косметика, Продукты, Дом, Одежда, Игрушки, Средство для суставов, Товар\",\n" +
                "  \"subtype\": \"уточнение типа\",\n" +
                "  \"description\": \"3-5 предложений описания\",\n" +
                "  \"purpose\": \"для чего нужен\",\n" +
                "  \"composition\": \"состав, если видно\",\n" +
                "  \"dosage\": \"как применять\",\n" +
                "  \"warnings\": \"предупреждения\"\n" +
                "}";

            String raw = GeminiClient.generateVision(key, model, prompt, b64, mime);
            String text = raw == null ? "" : raw.trim();
            if (text.startsWith("```")) {
                text = text.replaceAll("^```[a-zA-Z]*\\s*", "").replaceAll("```\\s*$", "").trim();
            }
            int a = text.indexOf('{');
            int b = text.lastIndexOf('}');
            if (a >= 0 && b > a) text = text.substring(a, b + 1);

            org.json.JSONObject parsed = new org.json.JSONObject(text);

            org.json.JSONObject vision = new org.json.JSONObject();
            vision.put("productName", parsed.optString("productName", ""));
            vision.put("author", parsed.optString("author", ""));
            vision.put("brand", parsed.optString("brand", ""));
            vision.put("category", parsed.optString("category", ""));
            vision.put("subtype", parsed.optString("subtype", ""));
            vision.put("form", parsed.optString("subtype", ""));
            vision.put("description", parsed.optString("description", ""));
            vision.put("purpose", parsed.optString("purpose", ""));
            vision.put("composition", parsed.optString("composition", ""));
            vision.put("dosage", parsed.optString("dosage", ""));
            vision.put("warnings", parsed.optString("warnings", ""));

            org.json.JSONObject out = new org.json.JSONObject();
            out.put("status", "success");
            out.put("visionUsed", true);
            out.put("text", parsed.optString("description", ""));
            out.put("vision", vision);
            postOcrResult(out.toString());
            return;
        } catch (Exception eGemini) {
            android.util.Log.w("On.i AI", "Gemini Vision failed, fallback to Tesseract: " + eGemini.getMessage(), eGemini);
        }

        // ============ ПОПЫТКА 2: TESSERACT (ОФЛАЙН) ============
        try {
            byte[] decoded = android.util.Base64.decode(b64, android.util.Base64.DEFAULT);
            android.graphics.Bitmap bmp = android.graphics.BitmapFactory.decodeByteArray(decoded, 0, decoded.length);
            if (bmp == null) throw new IOException("Не удалось прочитать изображение");

            String useLangs = (langs == null || langs.trim().isEmpty()) ? "eng+rus" : langs;
            String text = runOfflineOcr(bmp, useLangs);

            org.json.JSONObject out = new org.json.JSONObject();
            out.put("status", "success");
            out.put("visionUsed", false);
            out.put("text", text == null ? "" : text);
            postOcrResult(out.toString());
        } catch (Exception eTess) {
            String msg = eTess.getMessage() == null ? String.valueOf(eTess) : eTess.getMessage();
            try {
                org.json.JSONObject err = new org.json.JSONObject();
                err.put("status", "fail");
                err.put("message", "Gemini недоступен, Tesseract тоже: " + msg);
                postOcrResult(err.toString());
            } catch (Exception ignored) {
                postOcrResult("{\"status\":\"fail\",\"message\":\"Фото не распознано\"}");
            }
        }
    }}).start();
}

private void postOcrResult(final String json) {
    if (webView == null) return;
    webView.post(new Runnable() { public void run() {
        try {
            String js = "if(window.onProductOcrResult){try{window.onProductOcrResult(" + org.json.JSONObject.quote(json) + ");}catch(e){console.error(e);}}";
            webView.evaluateJavascript(js, null);
        } catch (Exception ignored) {}
    }});
}

@JavascriptInterface
public void askGuide(final String message, final String historyJson) {
    final String q = message == null ? "" : message.trim();
    if (q.isEmpty()) {
        postGuideResult("{\"status\":\"fail\",\"message\":\"Пустой вопрос\"}");
        return;
    }

    new Thread(new Runnable() {
        @Override
        public void run() {
            try {
                String history = historyJson == null ? "[]" : historyJson;

                String prompt =
                    "Ты — On.i Гид, встроенный помощник CRM \"On.i CRM\" для магазина.\n" +
                    "Отвечай кратко, по-русски, по делу. Без markdown, без воды, без извинений.\n" +
                    "Не выдумывай функции, которых нет в описании ниже.\n" +
                    "Если не знаешь — скажи \"Такого в программе нет\" или \"Уточните вопрос\".\n\n" +
                    "УСТРОЙСТВО ПРОГРАММЫ:\n\n" +
                    "Верхнее меню ⋮ (по секциям):\n" +
                    "- Смена: Мой аккаунт, Сообщения, Касса и товары, Штрихкоды и этикетки\n" +
                    "- Справочники: Поставщики, Клиенты, Сертификаты\n" +
                    "- Финансы: Инвентаризация, Закупки, Долги, Реализация\n" +
                    "- Отчёты: Чеки, Отчёты, Аналитика кассиров\n" +
                    "- Настройки: Настройки магазина, Smart POS, On.i чат, ИИ, Кассиры,\n" +
                    "  Сохранить резервную копию, Восстановить из файла\n\n" +
                    "Нижняя навигация: Dashboard, Товары, Движения, Касса.\n\n" +
                    "РОЛИ:\n" +
                    "- admin — всё, включая настройки, сотрудников, бэкап.\n" +
                    "- manager — всё кроме настроек, сотрудников, бэкапа.\n" +
                    "- storekeeper — товары, движения, закупки, поставщики, инвентаризация.\n" +
                    "- cashier — касса и клиенты, только свои продажи.\n\n" +
                    "ТОВАРЫ (раздел \"Товары\"):\n" +
                    "- Добавить: кнопка + в правом верхнем углу.\n" +
                    "- Обязательны: название, артикул (генерируется автоматически).\n" +
                    "- Фото: несколько, главное выбирается тапом.\n" +
                    "- Штрихкоды: EAN-13, генерируется по артикулу или сканируется.\n" +
                    "  Этикетки 43×25 мм печатаются из \"Штрихкоды и этикетки\".\n" +
                    "- Импорт Excel: кнопка \"↓ Импорт Excel\". Колонки: артикул (опц.),\n" +
                    "  наименование (обяз.), категория, описание, назначение, единица,\n" +
                    "  закупочная цена, цена продажи, остаток, мин.остаток,\n" +
                    "  дата изготовления, срок годности, штрихкод.\n\n" +
                    "ДВИЖЕНИЯ (раздел \"Движения\"):\n" +
                    "- Приход, расход, инвентаризация.\n" +
                    "- Продажи создаются автоматически при оформлении чека.\n" +
                    "- Инвентаризация: ⋮ → Инвентаризация. Можно считать часть товаров.\n\n" +
                    "КАССА (раздел \"Касса\"):\n" +
                    "- Продажа: тап по плитке → товар в корзину. В корзине: количество,\n" +
                    "  цена (меняется прямо в чеке), скидка % или сумма, клиент,\n" +
                    "  комментарий, способ оплаты.\n" +
                    "- Способы оплаты: наличные, Kaspi Pay, Kaspi Red, перевод,\n" +
                    "  сертификат, долг.\n" +
                    "- Kaspi работает только в Android с настроенным Smart POS.\n" +
                    "- Чек: печать или отправка в WhatsApp.\n" +
                    "- Возврат: \"История чеков\" → чек → кнопка \"Возврат\".\n" +
                    "- Смена кассира: ⋮ → Мой аккаунт. Там открытие/закрытие смены,\n" +
                    "  Z-отчёт, инкассация.\n\n" +
                    "КЛИЕНТЫ (⋮ → Клиенты):\n" +
                    "- База, история покупок, бонусы.\n" +
                    "- Бонусы включаются в настройках кассы. Настройки: % начисления,\n" +
                    "  макс. % оплаты бонусами.\n\n" +
                    "ЗАКУПКИ (⋮ → Закупки):\n" +
                    "- Поставщики (⋮ → Поставщики). У каждого может быть несколько контактов.\n" +
                    "- Новая закупка → выбрать поставщика, товары, количество, цену закупки.\n" +
                    "- Статус оплаты: оплачено / частично / долг.\n" +
                    "- Заявка поставщику: \"Что нужно пополнить\" → выбрать товары → заявка\n" +
                    "  → отправить в WhatsApp.\n\n" +
                    "ДОЛГИ (⋮ → Долги):\n" +
                    "- Создаются при продаже (способ \"Долг\") или вручную.\n" +
                    "- Погашение: кнопка \"Погасить\".\n" +
                    "- Просроченные видны в уведомлениях (иконка 🔔 вверху).\n\n" +
                    "РЕАЛИЗАЦИЯ (⋮ → Реализация):\n" +
                    "- Товар от поставщика, продаётся, поставщику платится после факта.\n" +
                    "- Прибыль = цена продажи − цена поставщика.\n" +
                    "- Расчёт: кнопка \"Рассчитаться\".\n\n" +
                    "ОТЧЁТЫ:\n" +
                    "- ⋮ → Отчёты. Вкладки: Сводка, Кассиры, Оплаты, Товары, Категории,\n" +
                    "  Оборачиваемость (ABC). Период выбирается сверху. Экспорт в Excel,\n" +
                    "  печать.\n" +
                    "- Аналитика кассиров: ⋮ → Аналитика кассиров.\n\n" +
                    "НАСТРОЙКИ:\n" +
                    "- Магазин: название, адрес, телефон — печатаются на чеке.\n" +
                    "- Касса и товары: налог, комиссии Kaspi, лимит расхождения наличных,\n" +
                    "  таймауты сессии, бонусы, визуальные индикаторы остатков.\n" +
                    "- Smart POS: IP, порт, ID терминала (только Android).\n" +
                    "- ИИ: ключи для поиска информации о товаре и распознавания фото.\n" +
                    "- Бэкап: ⋮ → Сохранить резервную копию / Восстановить из файла.\n\n" +
                    "ПАРОЛИ:\n" +
                    "- Забыл пароль кассира: администратор открывает ⋮ → Кассиры →\n" +
                    "  выбирает сотрудника → Изменить → задаёт новый пароль.\n" +
                    "- Забыл пароль администратора: экран входа → ссылка\n" +
                    "  \"Забыли пароль администратора?\" → ввод кода восстановления →\n" +
                    "  задать новый пароль. Код восстановления знает только владелец\n" +
                    "  магазина, в программе он не показывается.\n" +
                    "- Забыл пароль обычного пользователя без админа: восстановить нельзя,\n" +
                    "  нужен администратор.\n\n" +
                    "ДЕЙСТВИЯ:\n" +
                    "- Указывай точный путь кнопок: например, \"⋮ → Закупки → Новая закупка\".\n" +
                    "- Если вопрос про товар в каталоге — не выдумывай товары.\n" +
                    "- Если вопрос не про программу — коротко скажи, что ты только\n" +
                    "  по On.i CRM.\n\n" +
                    "ИСТОРИЯ ДИАЛОГА:\n" +
                    history + "\n\n" +
                    "ВОПРОС ПОЛЬЗОВАТЕЛЯ:\n" +
                    q;

                String raw = callSelectedProvider(prompt, false);
                String answer = extractAnswerText(raw);

                if (answer == null || answer.trim().isEmpty()) {
                    postGuideResult("{\"status\":\"fail\",\"message\":\"Пустой ответ ИИ\"}");
                    return;
                }

                JSONObject result = new JSONObject();
                result.put("status", "success");
                result.put("answer", answer);
                postGuideResult(result.toString());

            } catch (Exception e) {
                try {
                    JSONObject result = new JSONObject();
                    result.put("status", "fail");
                    result.put("message", e.getMessage() == null
                            ? "Не удалось получить ответ"
                            : e.getMessage());
                    postGuideResult(result.toString());
                } catch (Exception ignored) {
                    postGuideResult("{\"status\":\"fail\",\"message\":\"Не удалось получить ответ\"}");
                }
            }
        }
    }).start();
}

private void postGuideResult(final String json) {
    if (webView == null) return;

    final String safe = json == null ? "{}" : json;

    runOnUiThread(new Runnable() {
        @Override
        public void run() {
            if (webView == null) return;

            try {
                String escaped = JSONObject.quote(safe);
                webView.evaluateJavascript(
                    "window.onGuideResult && window.onGuideResult(" + escaped + ");",
                    null
                );
            } catch (Exception ignored) {
            }
        }
    });
}

        @JavascriptInterface
        public void setIdToken(String token) {
            aiIdToken = token;
        }

        @JavascriptInterface
        public void closeApp() { runOnUiThread(() -> { try { finishAndRemoveTask(); } catch (Exception e) { finish(); } }); }

        @JavascriptInterface
        public void printReceipt(String html) {
            runOnUiThread(() -> {
                try {
                    if (printWebView != null) {
                        printWebView.destroy();
                        printWebView = null;
                    }
                    printWebView = new WebView(MainActivity.this);
                    WebSettings ps = printWebView.getSettings();
                    ps.setJavaScriptEnabled(false);
                    printWebView.setVisibility(View.INVISIBLE);
                    printWebView.setWebViewClient(new WebViewClient() {
                        @Override public void onPageFinished(WebView view, String url) {
                            try {
                                PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
                                if (pm == null) throw new IllegalStateException("PrintManager unavailable");
                                PrintAttributes attrs = new PrintAttributes.Builder()
                                        .setMediaSize(PrintAttributes.MediaSize.ISO_A7)
                                        .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                                        .build();
                                pm.print("On.i CRM — Чек", view.createPrintDocumentAdapter("On.i CRM — Чек"), attrs);
                            } catch (Exception e) {
                                try { android.util.Log.e("On.i CRM", "Print failed", e); } catch (Exception ignored) {}
                            }
                        }
                    });
                    addContentView(printWebView, new android.view.ViewGroup.LayoutParams(1, 1));
                    printWebView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
                } catch (Exception e) {
                    try { android.util.Log.e("On.i CRM", "Print setup failed", e); } catch (Exception ignored) {}
                }
            });
        }
    }

    private void launchFileChooser(WebChromeClient.FileChooserParams params) {
        boolean wantsImage = false;
        boolean wantsDocument = false;
        String[] acceptTypes = params != null ? params.getAcceptTypes() : null;
        if (acceptTypes != null) {
            for (String type : acceptTypes) {
                if (type == null) continue;
                String t = type.toLowerCase(Locale.ROOT).trim();
                if (t.startsWith("image/") || t.contains("image")) wantsImage = true;
                // WebView on Android often reports HTML accept extensions (.xlsx/.xls/.csv),
                // not MIME types. Treat those extensions as documents too, so Excel never
                // falls through to the photo chooser/camera.
                if (t.contains("spreadsheet") || t.contains("excel") || t.contains("csv")
                        || t.contains("text/csv") || t.contains("application/vnd.ms-excel")
                        || t.contains(".xlsx") || t.contains(".xls") || t.contains(".csv")
                        || t.equals("*/*")) wantsDocument = true;
            }
        }

        // Для Excel/CSV никогда не показываем камеру — только системный выбор документов.
        if (wantsDocument && !wantsImage) {
            Intent document = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            document.addCategory(Intent.CATEGORY_OPENABLE);
            document.setType("*/*");
            document.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    "application/vnd.ms-excel",
                    "text/csv",
                    "text/comma-separated-values"
            });
            try { startActivityForResult(document, FILE_CHOOSER); }
            catch (ActivityNotFoundException e) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = null;
            }
            return;
        }

        // Для фотографий товара сохраняем выбор Галерея + Камера.
        Intent gallery = new Intent(Intent.ACTION_PICK, MediaStore.Images.Media.EXTERNAL_CONTENT_URI);
        gallery.setType("image/*");

        Intent camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        if (camera.resolveActivity(getPackageManager()) != null) {
            try {
                File dir = new File(getCacheDir(), "images");
                if (!dir.exists()) dir.mkdirs();
                File photo = File.createTempFile("oni_camera_", ".jpg", dir);
                cameraUri = Uri.parse("content://com.oni.crm.fileprovider/" + photo.getName());
                camera.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
                camera.setClipData(ClipData.newRawUri("output", cameraUri));
                camera.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            } catch (IOException e) { cameraUri = null; }
        }

        Intent chooser = new Intent(Intent.ACTION_CHOOSER);
        chooser.putExtra(Intent.EXTRA_INTENT, gallery);
        if (cameraUri != null) chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camera});
        try { startActivityForResult(chooser, FILE_CHOOSER); }
        catch (ActivityNotFoundException e) { if (fileCallback != null) fileCallback.onReceiveValue(null); fileCallback=null; }
    }

    private void startChatCamera(int mode) {
        runOnUiThread(() -> {
            pendingChatCameraMode = mode;
            try {
                File dir = new File(getCacheDir(), "images");
                if (!dir.exists()) dir.mkdirs();
                String prefix = mode == 2 ? "oni_chat_video_" : "oni_chat_photo_";
                String suffix = mode == 2 ? ".mp4" : ".jpg";
                File media = File.createTempFile(prefix, suffix, dir);
                chatCameraUri = Uri.parse("content://com.oni.crm.fileprovider/" + media.getName());
                Intent camera = mode == 2 ? new Intent(MediaStore.ACTION_VIDEO_CAPTURE) : new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                if (mode == 2) {
                    camera.putExtra(MediaStore.EXTRA_VIDEO_QUALITY, 1);
                    camera.putExtra(MediaStore.EXTRA_DURATION_LIMIT, 30);
                }
                camera.putExtra(MediaStore.EXTRA_OUTPUT, chatCameraUri);
                camera.setClipData(ClipData.newRawUri("output", chatCameraUri));
                camera.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                if (camera.resolveActivity(getPackageManager()) == null) throw new ActivityNotFoundException();
                startActivityForResult(camera, mode == 2 ? CHAT_CAMERA_VIDEO : CHAT_CAMERA_PHOTO);
            } catch (Exception e) {
                chatCameraUri = null;
                pendingChatCameraMode = 0;
                webView.evaluateJavascript("window.onChatMediaError&&window.onChatMediaError(" + JSONObject.quote("Не удалось открыть камеру") + ")", null);
            }
        });
    }

    private void sendChatMedia(Uri source, String forcedMime) {
        try {
            if (source == null) throw new IOException("Файл не выбран");
            String mime = forcedMime;
            if (mime == null || mime.isEmpty()) mime = getContentResolver().getType(source);
            if (mime == null || mime.isEmpty()) mime = "application/octet-stream";
            File root = new File(getFilesDir(), "media");
            if (!root.exists() && !root.mkdirs()) throw new IOException("Не удалось создать хранилище материалов");
            String ext = android.webkit.MimeTypeMap.getSingleton().getExtensionFromMimeType(mime);
            if (ext == null || ext.isEmpty()) ext = mime.startsWith("video/") ? "mp4" : "jpg";
            File outFile = new File(root, "msg_" + System.currentTimeMillis() + "_" + java.util.UUID.randomUUID().toString().replace("-", "") + "." + ext);
            try (InputStream in = getContentResolver().openInputStream(source); OutputStream out = new FileOutputStream(outFile)) {
                if (in == null) throw new IOException("Не удалось прочитать материал");
                byte[] buf = new byte[8192]; int n;
                while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
            }
            String name = outFile.getName();
            android.database.Cursor c = getContentResolver().query(source, null, null, null, null);
            if (c != null) {
                int idx = c.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME);
                if (c.moveToFirst() && idx >= 0 && c.getString(idx) != null) name = c.getString(idx);
                c.close();
            }
            JSONObject result = new JSONObject();
            result.put("mediaType", mime.startsWith("video/") ? "video" : "image");
            result.put("mediaUrl", "https://oni.local/media/" + outFile.getName());
            result.put("mediaName", name);
            runOnUiThread(() -> webView.evaluateJavascript("window.onChatMediaSelected&&window.onChatMediaSelected(" + JSONObject.quote(result.toString()) + ")", null));
        } catch (Exception e) {
            runOnUiThread(() -> webView.evaluateJavascript("window.onChatMediaError&&window.onChatMediaError(" + JSONObject.quote(e.getMessage() == null ? "Не удалось обработать материал" : e.getMessage()) + ")", null));
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode,resultCode,data);

        if (requestCode == EXCEL_PICKER) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                Uri uri = data.getData();
                try {
                    getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                } catch (Exception ignored) {}
                try (InputStream in = getContentResolver().openInputStream(uri)) {
                    if (in == null) throw new IOException("Не удалось открыть файл");
                    java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
                    byte[] buf = new byte[8192]; int n;
                    while ((n = in.read(buf)) != -1) out.write(buf,0,n);
                    String b64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
                    String name = "Excel";
                    android.database.Cursor c = getContentResolver().query(uri, null, null, null, null);
                    if (c != null) {
                        int idx = c.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME);
                        if (c.moveToFirst() && idx >= 0) name = c.getString(idx);
                        c.close();
                    }
                    String js = "window.onAndroidExcelFile && window.onAndroidExcelFile(" +
                            org.json.JSONObject.quote(b64) + "," + org.json.JSONObject.quote(name) + ")";
                    webView.evaluateJavascript(js, null);
                } catch (Exception e) {
                    String msg = e.getMessage() == null ? "Не удалось прочитать файл" : e.getMessage();
                    webView.evaluateJavascript("window.onAndroidExcelError && window.onAndroidExcelError(" + org.json.JSONObject.quote(msg) + ")", null);
                }
            } else {
                webView.evaluateJavascript("window.onAndroidExcelCancel && window.onAndroidExcelCancel()", null);
            }
            return;
        }

        if (requestCode == SAVE_FILE) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null && pendingSaveBase64 != null) {
                try {
                    byte[] bytes = Base64.decode(pendingSaveBase64, Base64.DEFAULT);
                    try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
                        if (out == null) throw new IOException("Не удалось сохранить файл");
                        out.write(bytes);
                    }
                    webView.evaluateJavascript("window.onAndroidSaveOk && window.onAndroidSaveOk()", null);
                } catch (Exception e) {
                    String msg = e.getMessage() == null ? "Не удалось сохранить файл" : e.getMessage();
                    webView.evaluateJavascript("window.onAndroidSaveError && window.onAndroidSaveError(" + org.json.JSONObject.quote(msg) + ")", null);
                }
            } else {
                webView.evaluateJavascript("window.onAndroidSaveCancel && window.onAndroidSaveCancel()", null);
            }
            pendingSaveBase64=null; pendingSaveName=null;
            return;
        }

        if (requestCode == CHAT_GALLERY) {
            if (resultCode == RESULT_OK && data != null) {
                Uri selected = data.getData();
                if (selected == null && data.getClipData() != null && data.getClipData().getItemCount() > 0) {
                    selected = data.getClipData().getItemAt(0).getUri();
                }
                if (selected != null) {
                    try { getContentResolver().takePersistableUriPermission(selected, Intent.FLAG_GRANT_READ_URI_PERMISSION); } catch (Exception ignored) {}
                    sendChatMedia(selected, null);
                } else {
                    webView.evaluateJavascript("window.onChatMediaError&&window.onChatMediaError(" + JSONObject.quote("Файл не выбран") + ")", null);
                }
            } else {
                webView.evaluateJavascript("window.onChatMediaError&&window.onChatMediaError(" + JSONObject.quote("Выбор материала отменён") + ")", null);
            }
            return;
        }

        if (requestCode == CHAT_CAMERA_PHOTO || requestCode == CHAT_CAMERA_VIDEO) {
            Uri u = chatCameraUri;
            int mode = pendingChatCameraMode;
            chatCameraUri = null; pendingChatCameraMode = 0;
            if (resultCode == RESULT_OK && u != null) {
                sendChatMedia(u, requestCode == CHAT_CAMERA_VIDEO ? "video/mp4" : "image/jpeg");
            } else {
                webView.evaluateJavascript("window.onChatMediaError&&window.onChatMediaError(" + JSONObject.quote("Запись отменена") + ")", null);
            }
            return;
        }

        if (requestCode != FILE_CHOOSER || fileCallback == null) return;
        Uri[] results = null;
        if (resultCode == RESULT_OK) {
            if (data != null && data.getClipData() != null && data.getClipData().getItemCount() > 0) {
                int count = data.getClipData().getItemCount();
                results = new Uri[count];
                for (int i = 0; i < count; i++) results[i] = data.getClipData().getItemAt(i).getUri();
            } else if (data != null && data.getData() != null) results = new Uri[]{data.getData()};
            else if (cameraUri != null) results = new Uri[]{cameraUri};
        }
        fileCallback.onReceiveValue(results);
        fileCallback=null;
        cameraUri=null;
    }

private void triggerVisionFromUri(final Uri uri) {
    webView.evaluateJavascript("(function(){try{var n=document.getElementById('f-name');return n && n.value.trim().length>0;}catch(e){return false;}})();", value -> {
        boolean alreadyFilled = "true".equalsIgnoreCase(String.valueOf(value).trim());
        if (alreadyFilled) return;
        doTriggerVision(uri);
    });
}

private void doTriggerVision(final Uri uri) {
    new Thread(new Runnable() { public void run() {
        try {
            String mime = getContentResolver().getType(uri);
            if (mime == null || !mime.startsWith("image/")) return;
            InputStream in = getContentResolver().openInputStream(uri);
            if (in == null) return;
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[8192]; int n;
            while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
            in.close();
            byte[] bytes = out.toByteArray();
            if (bytes.length == 0 || bytes.length > 15000000) return;
            final String b64 = Base64.encodeToString(bytes, Base64.NO_WRAP);
            final String finalMime = mime;
            webView.post(new Runnable() { public void run() {
                try {
                    String dataUrl = "data:" + finalMime + ";base64," + b64;
                    String js = "setTimeout(function(){try{var st=document.getElementById('name-lookup-status');if(st)st.textContent='Читаю текст с фото...';if(window.Android&&typeof window.Android.recognizeProductPhoto==='function'){window.Android.recognizeProductPhoto(" + JSONObject.quote(dataUrl) + ",'eng+rus');}}catch(e){}},300);";
                    webView.evaluateJavascript(js, null);
                } catch (Exception ignored) {}
            }});
        } catch (Exception e) {
            try { android.util.Log.e("On.i CRM", "vision failed", e); } catch (Exception ignored) {}
        }
    }}).start();
}

private void injectProductHandlers() {
    String js =
        "(function(){" +
        "if(document.readyState==='loading'){return;}" +
        "var NL=String.fromCharCode(10);" +

        "var OCR=function(raw){" +
        "  try{" +
        "    var d=typeof raw==='string'?JSON.parse(raw):(raw||{});" +
        "    var st=document.getElementById('name-lookup-status');" +
        "    if(d.status==='fail'){if(st)st.textContent='Ошибка OCR: '+(d.message||'');return;}" +
        "    var v=d.vision||{};" +
        "    var t=String(d.text||'').trim();" +
        "    var ne=document.getElementById('f-name');" +
        "    var ce=document.getElementById('f-category');" +
        "    var de=document.getElementById('f-description');" +
        "    var pe=document.getElementById('f-purpose');" +
        "    if(v.productName&&ne&&!ne.value.trim())ne.value=v.productName;" +
        "    if(v.category&&ce&&!ce.value.trim())ce.value=v.category;" +
        "    var L=[];" +
        "    if(v.productName)L.push(v.productName);" +
        "    if(v.author)L.push('Автор: '+v.author);" +
        "    if(v.brand)L.push('Бренд: '+v.brand);" +
        "    if(v.form)L.push('Форма: '+v.form);" +
        "    if(v.quantity)L.push('Количество: '+v.quantity);" +
        "    if(v.description)L.push(v.description);" +
        "    if(v.composition)L.push('Состав: '+v.composition);" +
        "    if(v.dosage)L.push('Как принимать: '+v.dosage);" +
        "    if(v.warnings)L.push('Важно: '+v.warnings);" +
        "    if(de&&!de.value.trim()){" +
        "      if(L.length)de.value=L.filter(Boolean).join(NL+NL);" +
        "      else if(t)de.value=t;" +
        "    }" +
        "    if(pe&&!pe.value.trim()){" +
        "      if(v.purpose)pe.value=v.purpose;" +
        "      else if(v.dosage)pe.value='Применение: '+v.dosage;" +
        "    }" +
        "    if(st){" +
        "      if(d.visionUsed)st.textContent='Распознано через ИИ';" +
        "      else if(t)st.textContent='Текст с фото ('+t.length+' симв.)';" +
        "      else st.textContent='OCR не нашёл текст';" +
        "    }" +
        "  }catch(e){console.error('ocr err',e);}" +
        "};" +
        "try{Object.defineProperty(window,'onProductOcrResult',{configurable:true,get:function(){return OCR;},set:function(){}});}catch(e){window.onProductOcrResult=OCR;}" +

        "window.onAITestResult=function(raw){" +
        "  try{" +
        "    var d=typeof raw==='string'?JSON.parse(raw):(raw||{});" +
        "    var st=document.getElementById('oni-ai-status');" +
        "    if(st) st.textContent = d.message || 'проверка завершена';" +
        "    if(d.state) window.__oniAIState = d.state;" +
        "  }catch(e){console.error('test result',e);}" +
        "};" +

        "window.openAISettings=function(){" +
        "  var ex=document.getElementById('oni-ai-settings-ov');if(ex)ex.remove();" +
        "  var state={gemini:{enabled:true,keySet:false,model:'gemini-3.6-flash',status:'unknown'},openai:{enabled:false,keySet:false,model:'gpt-4o-mini',status:'unknown'},deepseek:{enabled:false,keySet:false,model:'deepseek-chat',status:'unknown'}};" +
        "  try{if(window.Android&&typeof window.Android.getAIState==='function'){var s=JSON.parse(window.Android.getAIState()||'{}');if(s&&typeof s==='object')state=Object.assign(state,s);}}catch(e){}" +
        "  window.__oniAIState = state;" +
        "  var ov=document.createElement('div');ov.className='sheet-overlay';ov.id='oni-ai-settings-ov';" +
        "  function statusBadge(s){" +
        "    if(s==='ready')return '🟢 подключён';" +
        "    if(s==='disabled')return '⚪ выключен';" +
        "    if(s==='no_key')return '🔑 ключ не задан';" +
        "    if(s==='rate_limited')return '🟡 лимит исчерпан';" +
        "    if(s==='invalid_key')return '🔴 ключ неверный';" +
        "    if(s==='error')return '🔴 ошибка';" +
        "    return '⚪ не проверен';" +
        "  }" +
        "  var html='<div class=\"sheet\" style=\"max-height:92vh;overflow-y:auto;\">';" +
        "  html+='<div class=\"sheet-handle\"></div>';" +
        "  html+='<div class=\"sheet-head\"><div class=\"sheet-title\">Настройки ИИ</div><button class=\"sheet-close\" id=\"oni-ai-set-close\">✕</button></div>';" +
        "  html+='<div class=\"sheet-body\">';" +

        "  html+='<div class=\"panel\" style=\"margin-bottom:10px;\"><div class=\"panel-body\" style=\"padding:10px 14px;\">';" +
        "  html+='<div class=\"ai-provider-row\"><div class=\"ai-provider-meta\"><div class=\"ai-provider-name\">OpenAI</div><div class=\"ai-provider-state\">'+statusBadge(state.openai.status)+'</div></div><label class=\"ai-switch\"><input id=\"oni-ai-openai\" type=\"checkbox\" '+(state.openai.enabled?'checked':'')+'><span class=\"ai-switch-track\"></span></label></div>';" +
        "  html+='<div class=\"form-field\" style=\"margin-top:10px;\"><label class=\"form-label\">Модель</label><input class=\"form-input\" id=\"oni-ai-openai-model\" value=\"'+(state.openai.model||'gpt-4o-mini')+'\"></div>';" +
        "  html+='<div class=\"form-field\"><label class=\"form-label\">API-ключ</label><input class=\"form-input\" id=\"oni-ai-openai-key\" type=\"password\" placeholder=\"'+(state.openai.keySet?'уже сохранён':'sk-...')+'\"></div>';" +
        "  html+='</div></div>';" +

        "  html+='<div class=\"panel\" style=\"margin-bottom:10px;\"><div class=\"panel-body\" style=\"padding:10px 14px;\">';" +
        "  html+='<div class=\"ai-provider-row\"><div class=\"ai-provider-meta\"><div class=\"ai-provider-name\">DeepSeek</div><div class=\"ai-provider-state\">'+statusBadge(state.deepseek.status)+'</div></div><label class=\"ai-switch\"><input id=\"oni-ai-deepseek\" type=\"checkbox\" '+(state.deepseek.enabled?'checked':'')+'><span class=\"ai-switch-track\"></span></label></div>';" +
        "  html+='<div class=\"form-field\" style=\"margin-top:10px;\"><label class=\"form-label\">Модель</label><input class=\"form-input\" id=\"oni-ai-deepseek-model\" value=\"'+(state.deepseek.model||'deepseek-chat')+'\"></div>';" +
        "  html+='<div class=\"form-field\"><label class=\"form-label\">API-ключ</label><input class=\"form-input\" id=\"oni-ai-deepseek-key\" type=\"password\" placeholder=\"'+(state.deepseek.keySet?'уже сохранён':'sk-...')+'\"></div>';" +
        "  html+='</div></div>';" +

        "  html+='<div class=\"panel\" style=\"margin-bottom:10px;\"><div class=\"panel-body\" style=\"padding:10px 14px;\">';" +
        "  html+='<div class=\"ai-provider-row\"><div class=\"ai-provider-meta\"><div class=\"ai-provider-name\">Google Gemini</div><div class=\"ai-provider-state\">'+statusBadge(state.gemini.status)+'</div></div><label class=\"ai-switch\"><input id=\"oni-ai-gemini\" type=\"checkbox\" '+(state.gemini.enabled?'checked':'')+'><span class=\"ai-switch-track\"></span></label></div>';" +
        "  html+='<div class=\"form-field\" style=\"margin-top:10px;\"><label class=\"form-label\">Модель</label><input class=\"form-input\" id=\"oni-ai-gemini-model\" value=\"'+(state.gemini.model||'gemini-3.6-flash')+'\"></div>';" +
        "  html+='<div class=\"form-field\"><label class=\"form-label\">API-ключ</label><input class=\"form-input\" id=\"oni-ai-gemini-key\" type=\"password\" placeholder=\"'+(state.gemini.keySet?'уже сохранён':'AIza...')+'\"></div>';" +
        "  html+='</div></div>';" +

        "  html+='<div class=\"panel\" style=\"margin-bottom:10px;\"><div class=\"panel-head\"><div class=\"panel-title\">Проверка подключения</div></div><div class=\"panel-body\"><div id=\"oni-ai-status\" class=\"form-hint\">Нажмите Проверить, чтобы узнать статус.</div></div></div>';" +

        "  html+='</div>';" +
        "  html+='<div class=\"sheet-foot\" style=\"display:grid;grid-template-columns:1fr 1fr;gap:8px;\"><button class=\"btn\" id=\"oni-ai-test\">Проверить</button><button class=\"btn btn-primary\" id=\"oni-ai-save\">Сохранить</button></div>';" +
        "  html+='</div>';" +
        "  ov.innerHTML=html;" +
        "  document.body.appendChild(ov);" +
        "  document.getElementById('oni-ai-set-close').onclick=function(){ov.remove();};" +
        "  ov.onclick=function(e){if(e.target===ov)ov.remove();};" +

        "  function collectState(){" +
        "    return {" +
        "      gemini:{enabled:document.getElementById('oni-ai-gemini').checked,key:document.getElementById('oni-ai-gemini-key').value.trim(),model:document.getElementById('oni-ai-gemini-model').value.trim()||'gemini-3.6-flash'}," +
        "      openai:{enabled:document.getElementById('oni-ai-openai').checked,key:document.getElementById('oni-ai-openai-key').value.trim(),model:document.getElementById('oni-ai-openai-model').value.trim()||'gpt-4o-mini'}," +
        "      deepseek:{enabled:document.getElementById('oni-ai-deepseek').checked,key:document.getElementById('oni-ai-deepseek-key').value.trim(),model:document.getElementById('oni-ai-deepseek-model').value.trim()||'deepseek-chat'}" +
        "    };" +
        "  }" +

        "  document.getElementById('oni-ai-test').onclick=function(){" +
        "    var st=document.getElementById('oni-ai-status');" +
        "    if(st)st.textContent='Проверяю подключение…';" +
        "    try{if(window.Android&&typeof window.Android.saveAIState==='function'){window.Android.saveAIState(JSON.stringify(collectState()));}}catch(e){console.error('presave',e);}" +
        "    try{if(window.Android&&typeof window.Android.testAIConnection==='function'){window.Android.testAIConnection();}}catch(e){if(st)st.textContent='Метод недоступен';}" +
        "  };" +

        "  document.getElementById('oni-ai-save').onclick=function(){" +
        "    try{" +
        "      if(window.Android&&typeof window.Android.saveAIState==='function'){" +
        "        window.Android.saveAIState(JSON.stringify(collectState()));" +
        "      }" +
        "      if(window.showToast)showToast('Настройки сохранены');" +
        "      ov.remove();" +
        "    }catch(e){console.error('save err',e);}" +
        "  };" +
        "};" +

        "var rebind=function(){" +
        "  var btn=document.getElementById('name-lookup');" +
        "  if(!btn||btn.__oniPatched)return;" +
        "  btn.__oniPatched=true;" +
        "  btn.onclick=function(){" +
        "    var q=String((document.getElementById('f-name')||{}).value||'').trim();" +
        "    var st=document.getElementById('name-lookup-status');" +
        "    if(!q){if(st)st.textContent='Сначала введите название товара';return;}" +
        "    var type=(document.getElementById('f-category')||{}).value||'';" +
        "    var desc=(document.getElementById('f-description')||{}).value||'';" +
        "    if(window.Android && typeof window.Android.lookupProductByAI==='function'){" +
        "      if(st)st.textContent='ИИ определяет товар…';" +
        "      window.Android.lookupProductByAI(q,type,desc);" +
        "    } else {" +
        "      if(st)st.textContent='ИИ доступен только в приложении Android';" +
        "    }" +
        "  };" +
        "};" +


        "var observer=function(){rebind();};" +
        "try{new MutationObserver(observer).observe(document.body,{childList:true,subtree:true});}catch(e){}" +
        "observer();setTimeout(observer,1000);setTimeout(observer,2500);setTimeout(observer,5000);" +
        "console.log('[On.i] injected v9 (test button)');" +
        "})();";
    webView.evaluateJavascript(js, null);
}
private void injectAIChat() {
    String js =
        "(function(){" +
        "if(document.readyState==='loading'){return;}" +
        "if(window.__aiChatInjected){return;}" +
        "window.__aiChatInjected=true;" +

        "var history=[];" +
        "var webSearchOn=(localStorage.getItem('oni_websearch')==='1');" +
        "var catalogOn=(localStorage.getItem('oni_catalog')!=='0');" +

        "function checkAIStatus(){" +
        "  try{" +
        "    var st={};" +
        "    if(window.Android&&typeof window.Android.getAIState==='function'){st=JSON.parse(window.Android.getAIState()||'{}');}" +
        "    else if(window.__oniAIState){st=window.__oniAIState;}" +
        "    var g = st.gemini && st.gemini.enabled && st.gemini.keySet;" +
        "    var oa = st.openai && st.openai.enabled && st.openai.keySet;" +
        "    var ds = st.deepseek && st.deepseek.enabled && st.deepseek.keySet;" +
        "    return !!(g||oa||ds);" +
        "  }catch(e){return false;}" +
        "}" +

        "function buildCatalog(){" +
        "  try{" +
        "    if(typeof products==='undefined'||!products)return '';" +
        "    var byCat={};" +
        "    var order=[];" +
        "    var total=0;" +
        "    for(var i=0;i<products.length && total<500;i++){" +
        "      var p=products[i];" +
        "      if(!p)continue;" +
        "      if(p.isCategoryPlaceholder)continue;" +
        "      if(Number(p.qty||0)<=0)continue;" +
        "      var name=String(p.name||'').trim();" +
        "      if(!name)continue;" +
        "      var cat=String(p.category||'Без категории');" +
        "      if(!byCat[cat]){byCat[cat]=[];order.push(cat);}" +
        "      var price=Math.round(Number(p.price||0));" +
        "      var qty=Number(p.qty||0);" +
        "      var unit=String(p.unit||'шт');" +
        "      byCat[cat].push('- '+name+' | '+price+'тг | '+qty+' '+unit);" +
        "      total++;" +
        "    }" +
        "    if(total===0)return '';" +
        "    var lines=[];" +
        "    var cats=order.slice().sort();" +
        "    lines.push('ДОСТУПНЫЕ КАТЕГОРИИ: '+cats.join(', '));" +
        "    lines.push('');" +
        "    for(var c=0;c<cats.length;c++){" +
        "      var ct=cats[c];" +
        "      var items=byCat[ct];" +
        "      lines.push(ct.toUpperCase()+' ('+items.length+' шт):');" +
        "      for(var k=0;k<items.length;k++)lines.push(items[k]);" +
        "      lines.push('');" +
        "    }" +
        "    return lines.join('\\n');" +
        "  }catch(e){return '';}" +
        "}" +

        "function doSearchInProducts(q){" +
        "  try{" +
        "    var ov=document.getElementById('oni-chat-ov');if(ov)ov.remove();" +
        "    try{currentView='products';}catch(e){}" +
        "    try{if(typeof saveUiState==='function')saveUiState();}catch(e){}" +
        "    try{if(typeof safeRender==='function')safeRender();}catch(e){}" +
        "    setTimeout(function(){" +
        "      var input=document.getElementById('product-search');" +
        "      if(input){input.value=q||'';try{input.dispatchEvent(new Event('input',{bubbles:true}));}catch(e){}}" +
        "    },350);" +
        "  }catch(e){}" +
        "}" +

        "function doOpenSection(s){" +
        "  try{" +
        "    var ov=document.getElementById('oni-chat-ov');if(ov)ov.remove();" +
        "    var v=s;" +
        "    if(s==='debts'){v='orders';try{ordersSubView='debts';}catch(e){}}" +
        "    else if(s==='consignment'){v='orders';try{ordersSubView='consignment';}catch(e){}}" +
        "    else if(s==='purchases'){v='suppliers';}" +
        "    try{currentView=v;}catch(e){}" +
        "    try{if(typeof saveUiState==='function')saveUiState();}catch(e){}" +
        "    try{if(typeof safeRender==='function')safeRender();}catch(e){}" +
        "  }catch(e){}" +
        "}" +

        "function doFillProduct(q){" +
        "  try{" +
        "    var ov=document.getElementById('oni-chat-ov');if(ov)ov.remove();" +
        "    try{currentView='products';}catch(e){}" +
        "    try{if(typeof saveUiState==='function')saveUiState();}catch(e){}" +
        "    try{if(typeof safeRender==='function')safeRender();}catch(e){}" +
        "    setTimeout(function(){" +
        "      var input=document.getElementById('product-search');" +
        "      if(input){input.value=q||'';try{input.dispatchEvent(new Event('input',{bubbles:true}));}catch(e){}}" +
        "      setTimeout(function(){" +
        "        var rows=document.querySelectorAll('.live-search-row[data-search-text]');" +
        "        for(var i=0;i<rows.length;i++){if(rows[i].style.display!=='none'){var b=rows[i].querySelector('[data-open]');if(b){b.click();break;}}}" +
        "        setTimeout(function(){var g=document.getElementById('name-lookup');if(g)g.click();},700);" +
        "      },400);" +
        "    },350);" +
        "  }catch(e){}" +
        "}" +

        "window.openAIChat=function(){" +
        "  try{" +
        "    var old=document.getElementById('oni-chat-ov');if(old)old.remove();" +
        "    var ov=document.createElement('div');ov.className='sheet-overlay';ov.id='oni-chat-ov';" +
        "    ov.style.background='#FFFFFF';" +
        "    var FONT=\"-apple-system,BlinkMacSystemFont,'Segoe UI Variable','Segoe UI',Roboto,'Helvetica Neue',Arial,system-ui,sans-serif\";" +
        "    var html='<div style=\"background:#FFFFFF;width:100%;max-width:480px;margin:0 auto;display:flex;flex-direction:column;height:100vh;font-family:'+FONT+';-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility;\">';" +
        "    html+='<div style=\"display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #ECECEC;\">';" +
        "    html+='<div style=\"display:flex;align-items:center;gap:8px;\">';" +
        "    html+='<div style=\"font-size:16px;font-weight:600;color:#0D0D0D;letter-spacing:-0.01em;\">AI</div>';" +
        "    html+='<span id=\"oni-ai-status-dot\" style=\"width:8px;height:8px;border-radius:50%;background:#BDBDBD;display:inline-block;\"></span>';" +
        "    html+='<span id=\"oni-ai-status-text\" style=\"font-size:11px;color:#888;\">отключено</span>';" +
        "    html+='</div>';" +
        "    html+='<div style=\"display:flex;gap:8px;align-items:center;\">';" +
        "    html+='<button id=\"oni-chat-search\" style=\"height:32px;padding:0 12px;border:1px solid #E5E5E5;background:#FFFFFF;border-radius:16px;color:#666;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:5px;font-family:inherit;\"><span style=\"font-size:14px;\">🌐</span><span id=\"oni-chat-search-label\" style=\"font-weight:600;\">Поиск</span></button>';" +
        "    html+='<button id=\"oni-chat-catalog\" style=\"height:32px;padding:0 12px;border:1px solid #E5E5E5;background:#FFFFFF;border-radius:16px;color:#666;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:5px;font-family:inherit;\"><span style=\"font-size:14px;\">📋</span><span id=\"oni-chat-catalog-label\" style=\"font-weight:600;\">Каталог</span></button>';" +
        "    html+='<button id=\"oni-chat-close\" style=\"width:34px;height:34px;border:0;background:#F4F4F4;border-radius:50%;color:#666;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;\">✕</button>';" +
        "    html+='</div>';" +
        "    html+='</div>';" +
        "    html+='<div id=\"oni-chat-body\" style=\"flex:1;overflow-y:auto;padding:24px 18px;background:#FFFFFF;\">';" +
        "    html+='<div style=\"display:flex;margin-bottom:20px;\"><div style=\"max-width:86%;padding:11px 15px;background:#F7F7F8;border-radius:18px;font-size:15px;line-height:1.65;color:#0D0D0D;letter-spacing:-0.005em;\">Здравствуйте! Я продавец-консультант. Опишите, что нужно — подберу товар из нашего магазина.</div></div>';" +
        "    html+='</div>';" +
        "    html+='<div style=\"padding:10px 14px calc(14px + env(safe-area-inset-bottom));border-top:1px solid #ECECEC;background:#FFFFFF;\">';" +
        "    html+='<div style=\"display:flex;gap:8px;align-items:flex-end;background:#F4F4F4;border-radius:26px;padding:5px 5px 5px 16px;\">';" +
        "    html+='<textarea id=\"oni-chat-input\" rows=\"1\" placeholder=\"Спросите что угодно…\" style=\"flex:1;resize:none;min-height:36px;max-height:120px;border:0;outline:none;background:transparent;font:inherit;font-size:15px;color:#0D0D0D;padding:8px 0;line-height:1.5;letter-spacing:-0.005em;\"></textarea>';" +
        "    html+='<button id=\"oni-chat-send\" style=\"width:34px;height:34px;border-radius:50%;background:#0A84FF;border:0;color:#fff;flex:0 0 auto;cursor:pointer;display:flex;align-items:center;justify-content:center;\"><svg viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"#fff\" stroke-width=\"2.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 19 V5\"/><path d=\"M5 12 L12 5 L19 12\"/></svg></button>';" +
        "    html+='</div>';" +
        "    html+='</div>';" +
        "    html+='</div>';" +
        "    ov.innerHTML=html;" +
        "    document.body.appendChild(ov);" +

        "    var body=document.getElementById('oni-chat-body');" +
        "    var input=document.getElementById('oni-chat-input');" +
        "    var sendBtn=document.getElementById('oni-chat-send');" +
        "    var searchBtn=document.getElementById('oni-chat-search');" +
        "    var searchLabel=document.getElementById('oni-chat-search-label');" +
        "    var catalogBtn=document.getElementById('oni-chat-catalog');" +
        "    var catalogLabel=document.getElementById('oni-chat-catalog-label');" +

        "    function paintStatus(){" +
        "      var active=checkAIStatus();" +
        "      var dot=document.getElementById('oni-ai-status-dot');" +
        "      var txt=document.getElementById('oni-ai-status-text');" +
        "      if(dot)dot.style.background=active?'#4CAF50':'#BDBDBD';" +
        "      if(txt)txt.textContent=active?'подключено':'отключено';" +
        "    }" +
        "    paintStatus();" +
        "    var statusTimer=setInterval(paintStatus,3000);" +

        "    function paintSearch(){" +
        "      if(webSearchOn){" +
        "        searchBtn.style.background='#0A84FF';searchBtn.style.borderColor='#0A84FF';searchBtn.style.color='#FFFFFF';" +
        "        searchLabel.textContent='Поиск вкл';" +
        "      }else{" +
        "        searchBtn.style.background='#FFFFFF';searchBtn.style.borderColor='#E5E5E5';searchBtn.style.color='#666';" +
        "        searchLabel.textContent='Поиск';" +
        "      }" +
        "    }" +
        "    paintSearch();" +
        "    searchBtn.onclick=function(){ webSearchOn=!webSearchOn; try{localStorage.setItem('oni_websearch',webSearchOn?'1':'0');}catch(e){} paintSearch(); };" +

        "    function paintCatalog(){" +
        "      if(catalogOn){" +
        "        catalogBtn.style.background='#0A84FF';catalogBtn.style.borderColor='#0A84FF';catalogBtn.style.color='#FFFFFF';" +
        "        catalogLabel.textContent='Каталог вкл';" +
        "      }else{" +
        "        catalogBtn.style.background='#FFFFFF';catalogBtn.style.borderColor='#E5E5E5';catalogBtn.style.color='#666';" +
        "        catalogLabel.textContent='Каталог';" +
        "      }" +
        "    }" +
        "    paintCatalog();" +
        "    catalogBtn.onclick=function(){ catalogOn=!catalogOn; try{localStorage.setItem('oni_catalog',catalogOn?'1':'0');}catch(e){} paintCatalog(); };" +

        "    function esc(s){return String(s||'').replace(/[&<>\"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'})[c];});}" +
        "    function scrollDown(){body.scrollTop=body.scrollHeight;}" +
        "    function addUser(text){var d=document.createElement('div');d.style.cssText='display:flex;justify-content:flex-end;margin-bottom:20px;';d.innerHTML='<div style=\"max-width:86%;padding:11px 15px;background:#0A84FF;color:#fff;border-radius:18px;font-size:15px;line-height:1.5;letter-spacing:-0.005em;word-break:break-word;\">'+esc(text).replace(/\\n/g,'<br>')+'</div>';body.appendChild(d);scrollDown();}" +
        "    function addAI(text){var d=document.createElement('div');d.style.cssText='display:flex;margin-bottom:20px;';d.innerHTML='<div style=\"max-width:86%;padding:11px 15px;background:#F7F7F8;border-radius:18px;font-size:15px;line-height:1.65;letter-spacing:-0.005em;color:#0D0D0D;word-break:break-word;\">'+esc(text).replace(/\\n/g,'<br>')+'</div>';body.appendChild(d);scrollDown();}" +
        "    function addLoading(){var d=document.createElement('div');d.id='oni-chat-loading';d.style.cssText='display:flex;margin-bottom:20px;';d.innerHTML='<div style=\"padding:11px 15px;background:#F7F7F8;border-radius:18px;font-size:15px;color:#999;letter-spacing:2px;\">● ● ●</div>';body.appendChild(d);scrollDown();}" +
        "    function removeLoading(){var l=document.getElementById('oni-chat-loading');if(l)l.remove();}" +

        "    window.onAIChatResult=function(raw){" +
        "      removeLoading();" +
        "      var d={};try{d=typeof raw==='string'?JSON.parse(raw):(raw||{});}catch(e){}" +
        "      if(d.status!=='success'){addAI('Ошибка: '+(d.message||'не удалось получить ответ'));return;}" +
        "      addAI(d.answer||'');" +
        "      history.push({q:window.__oniLastQ||'',a:d.answer||''});" +
        "      if(history.length>5)history.shift();" +
        "      var act=d.action;" +
        "      if(act && typeof act==='string' && act.length && act!=='null'){" +
        "        var args=d.args||{};" +
        "        setTimeout(function(){" +
        "          if(act==='search')doSearchInProducts(args.query||'');" +
        "          else if(act==='open')doOpenSection(args.section||'');" +
        "          else if(act==='fill')doFillProduct(args.query||'');" +
        "        },600);" +
        "      }" +
        "    };" +

        "    function send(){" +
        "      var q=String(input.value||'').trim();" +
        "      if(!q)return;" +
        "      addUser(q);" +
        "      window.__oniLastQ=q;" +
        "      input.value='';input.style.height='auto';" +
        "      addLoading();" +
        "      var hist='';" +
        "      for(var i=0;i<history.length;i++){hist+='Покупатель: '+history[i].q+'\\nПродавец: '+history[i].a+'\\n\\n';}" +
        "      var catalog='';" +
        "      if(catalogOn){ catalog=buildCatalog(); }" +
        "      if(window.Android&&typeof window.Android.askAIChat==='function'){" +
        "        window.Android.askAIChat(q,hist,webSearchOn?'1':'0',catalog);" +
        "      }else{" +
        "        removeLoading();addAI('AI доступен только в Android-приложении.');" +
        "      }" +
        "    }" +

        "    sendBtn.onclick=send;" +
        "    input.onkeydown=function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}};" +
        "    input.oninput=function(){input.style.height='auto';input.style.height=Math.min(120,input.scrollHeight)+'px';};" +
        "    document.getElementById('oni-chat-close').onclick=function(){clearInterval(statusTimer);ov.remove();};" +
        "    setTimeout(function(){input.focus();},200);" +
        "  }catch(err){" +
        "    try{alert('AI chat error: '+err.message);}catch(_){}" +
        "    console.error('openAIChat error', err);" +
        "  }" +
        "};" +

        "document.addEventListener('click', function(e){" +
        "  var t=e.target;" +
        "  while(t && t!==document){" +
        "    if(t.getAttribute && t.getAttribute('data-view')==='aichat'){" +
        "      e.preventDefault();e.stopPropagation();" +
        "      window.openAIChat();" +
        "      return;" +
        "    }" +
        "    t=t.parentNode;" +
        "  }" +
        "}, true);" +

        "var addNavButton=function(){" +
        "  try{" +
        "    var nav=document.getElementById('nav');" +
        "    if(!nav)return;" +
        "    if(nav.querySelector('[data-view=\"aichat\"]'))return;" +
        "    var productsBtn=nav.querySelector('[data-view=\"products\"]');" +
        "    if(!productsBtn)return;" +
        "    var b=document.createElement('button');" +
        "    b.type='button';b.className='nav-btn';b.setAttribute('data-view','aichat');" +
        "    b.innerHTML='<span class=\"nav-label\" style=\"color:#0A84FF;font-weight:900;\">AI</span>';" +
        "    productsBtn.parentNode.insertBefore(b,productsBtn.nextSibling);" +
        "  }catch(e){}" +
        "};" +
        "addNavButton();" +
        "setInterval(addNavButton, 1500);" +
        "console.log('[On.i] AI chat v15 (seller + catalog toggle)');" +
        "})();";
    webView.evaluateJavascript(js, null);
}
private void injectGuideChat() {
    String js =
        "(function(){" +
        "if(document.readyState==='loading'){return;}" +
        "if(window.__guideChatInjected){return;}" +
        "window.__guideChatInjected=true;" +

        "function esc(s){" +
        "  return String(s||'').replace(/[&<>\"']/g,function(c){" +
        "    return({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'})[c];" +
        "  });" +
        "}" +

        "function loadHistory(){" +
        "  try{" +
        "    var h=JSON.parse(localStorage.getItem('oni_guide_chat')||'[]');" +
        "    return Array.isArray(h)?h.slice(-30):[];" +
        "  }catch(e){return[];}" +
        "}" +

        "function saveHistory(h){" +
        "  try{" +
        "    localStorage.setItem('oni_guide_chat',JSON.stringify(h.slice(-30)));" +
        "  }catch(e){}" +
        "}" +

        "var history=loadHistory();" +
        "var overlay=null;" +
        "var body=null;" +
        "var input=null;" +
        "var sendBtn=null;" +
        "var pending=false;" +

        "var questions=[" +
        "'Как добавить товар?'," +
        "'Как оформить продажу?'," +
        "'Как сделать возврат?'," +
        "'Забыл пароль — что делать?'," +
        "'Как восстановить из бэкапа?'," +
        "'Как закрыть смену?'," +
        "'Что такое реализация?'," +
        "'Как импортировать товары из Excel?'," +
        "'Как настроить Kaspi?'," +
        "'Что может кассир?'" +
        "];" +

        "function addMessage(role,text){" +
        "  if(!body)return;" +
        "  var row=document.createElement('div');" +
        "  row.style.cssText=role==='user'" +
        "    ?'display:flex;justify-content:flex-end;margin-bottom:12px;'" +
        "    :'display:flex;justify-content:flex-start;margin-bottom:12px;';" +
        "  var bubble=document.createElement('div');" +
        "  bubble.style.cssText=role==='user'" +
        "    ?'max-width:86%;padding:10px 14px;background:#0A84FF;color:#fff;border-radius:18px;font-size:14px;line-height:1.5;word-break:break-word;'" +
        "    :'max-width:86%;padding:10px 14px;background:#F3F4F6;color:#111;border-radius:18px;font-size:14px;line-height:1.55;word-break:break-word;';" +
        "  bubble.innerHTML=esc(text).replace(/\\n/g,'<br>');" +
        "  row.appendChild(bubble);" +
        "  body.appendChild(row);" +
        "  body.scrollTop=body.scrollHeight;" +
        "}" +

        "function drawHistory(){" +
        "  if(!body)return;" +
        "  body.innerHTML='';" +
        "  if(!history.length){" +
        "    addMessage('assistant','Здравствуйте! Я On.i Гид. Спросите что угодно про программу: как добавить товар, оформить продажу, сделать возврат. Или выберите частый вопрос ниже.');" +
        "    return;" +
        "  }" +
        "  for(var i=0;i<history.length;i++){" +
        "    var m=history[i];" +
        "    if(!m)continue;" +
        "    if(m.role==='user')addMessage('user',m.text||'');" +
        "    else if(m.role==='assistant')addMessage('assistant',m.text||'');" +
        "  }" +
        "}" +

        "function addLoading(){" +
        "  if(!body)return;" +
        "  var row=document.createElement('div');" +
        "  row.id='oni-guide-loading';" +
        "  row.style.cssText='display:flex;justify-content:flex-start;margin-bottom:12px;';" +
        "  row.innerHTML='<div style=\"padding:10px 14px;background:#F3F4F6;color:#999;border-radius:18px;font-size:14px;letter-spacing:2px;\">● ● ●</div>';" +
        "  body.appendChild(row);" +
        "  body.scrollTop=body.scrollHeight;" +
        "}" +

        "function removeLoading(){" +
        "  var x=document.getElementById('oni-guide-loading');" +
        "  if(x)x.remove();" +
        "}" +

        "function send(text){" +
        "  var q=String(text!==undefined?text:(input?input.value:'' )||'').trim();" +
        "  if(!q||pending)return;" +
        "  if(input){input.value='';input.style.height='auto';}" +
        "  history.push({role:'user',text:q});" +
        "  if(history.length>30)history=history.slice(-30);" +
        "  saveHistory(history);" +
        "  addMessage('user',q);" +
        "  addLoading();" +
        "  pending=true;" +
        "  if(sendBtn)sendBtn.disabled=true;" +
        "  if(window.Android&&typeof window.Android.askGuide==='function'){" +
        "    try{" +
        "      window.Android.askGuide(q,JSON.stringify(history));" +
        "    }catch(e){" +
        "      pending=false;" +
        "      if(sendBtn)sendBtn.disabled=false;" +
        "      removeLoading();" +
        "      addMessage('assistant','Не удалось получить ответ.');" +
        "    }" +
        "  }else{" +
        "    pending=false;" +
        "    if(sendBtn)sendBtn.disabled=false;" +
        "    removeLoading();" +
        "    addMessage('assistant','Гид доступен только в Android-приложении');" +
        "  }" +
        "}" +

        "window.onGuideResult=function(raw){" +
        "  removeLoading();" +
        "  pending=false;" +
        "  if(sendBtn)sendBtn.disabled=false;" +
        "  var d={};" +
        "  try{d=typeof raw==='string'?JSON.parse(raw):(raw||{});}catch(e){" +
        "    d={status:'fail',message:'Некорректный ответ'};" +
        "  }" +
        "  if(d.status!=='success'){" +
        "    addMessage('assistant',d.message||'Не удалось получить ответ.');" +
        "    return;" +
        "  }" +
        "  var answer=String(d.answer||'').trim();" +
        "  if(!answer)answer='Уточните вопрос.';" +
        "  history.push({role:'assistant',text:answer});" +
        "  if(history.length>30)history=history.slice(-30);" +
        "  saveHistory(history);" +
        "  addMessage('assistant',answer);" +
        "};" +

        "function clearGuide(){" +
        "  history=[];" +
        "  try{localStorage.removeItem('oni_guide_chat');}catch(e){}" +
        "  drawHistory();" +
        "}" +

        "function closeGuide(){" +
        "  if(overlay){" +
        "    overlay.remove();" +
        "    overlay=null;" +
        "    body=null;" +
        "    input=null;" +
        "    sendBtn=null;" +
        "  }" +
        "}" +

        "window.openGuideChat=function(){" +
        "  if(!(window.Android&&typeof window.Android.askGuide==='function')){" +
        "    if(typeof showToast==='function')showToast('Гид доступен только в Android-приложении');" +
        "    return;" +
        "  }" +

        "  if(overlay){" +
        "    overlay.style.display='flex';" +
        "    if(input)input.focus();" +
        "    return;" +
        "  }" +

        "  overlay=document.createElement('div');" +
        "  overlay.id='oni-guide-overlay';" +
        "  overlay.style.cssText='position:fixed;inset:0;z-index:99999;background:#fff;display:flex;flex-direction:column;font-family:system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,Arial,sans-serif;';" +

        "  var header=document.createElement('div');" +
        "  header.style.cssText='height:58px;flex:0 0 58px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;border-bottom:1px solid #E5E7EB;background:#fff;';" +

        "  var title=document.createElement('div');" +
        "  title.style.cssText='font-size:17px;font-weight:800;color:#111827;';" +
        "  title.textContent='On.i Гид';" +

        "  var headerActions=document.createElement('div');" +
        "  headerActions.style.cssText='display:flex;align-items:center;gap:6px;';" +

        "  var clear=document.createElement('button');" +
        "  clear.type='button';" +
        "  clear.textContent='Очистить';" +
        "  clear.style.cssText='height:34px;padding:0 10px;border:0;background:#F3F4F6;border-radius:17px;color:#4B5563;font-size:12px;font-weight:700;';" +
        "  clear.onclick=function(){clearGuide();};" +

        "  var close=document.createElement('button');" +
        "  close.type='button';" +
        "  close.textContent='✕';" +
        "  close.style.cssText='width:34px;height:34px;border:0;background:#F3F4F6;border-radius:50%;color:#4B5563;font-size:15px;';" +
        "  close.onclick=closeGuide;" +

        "  headerActions.appendChild(clear);" +
        "  headerActions.appendChild(close);" +
        "  header.appendChild(title);" +
        "  header.appendChild(headerActions);" +
        "  overlay.appendChild(header);" +

        "  body=document.createElement('div');" +
        "  body.id='oni-guide-body';" +
        "  body.style.cssText='flex:1;overflow-y:auto;padding:18px 14px 10px;background:#fff;-webkit-overflow-scrolling:touch;';" +
        "  overlay.appendChild(body);" +

        "  var chips=document.createElement('div');" +
        "  chips.style.cssText='display:flex;gap:7px;overflow-x:auto;padding:8px 12px 9px;background:#fff;border-top:1px solid #F0F0F0;border-bottom:1px solid #F0F0F0;scrollbar-width:none;';" +

        "  for(var i=0;i<questions.length;i++){" +
        "    (function(q){" +
        "      var chip=document.createElement('button');" +
        "      chip.type='button';" +
        "      chip.textContent=q;" +
        "      chip.style.cssText='flex:0 0 auto;white-space:nowrap;height:34px;padding:0 12px;border:1px solid #E5E7EB;background:#F9FAFB;border-radius:17px;color:#374151;font-size:12px;font-weight:600;';" +
        "      chip.onclick=function(){send(q);};" +
        "      chips.appendChild(chip);" +
        "    })(questions[i]);" +
        "  }" +

        "  overlay.appendChild(chips);" +

        "  var footer=document.createElement('div');" +
        "  footer.style.cssText='padding:9px 10px calc(10px + env(safe-area-inset-bottom));border-top:1px solid #E5E7EB;background:#fff;';" +

        "  var inputWrap=document.createElement('div');" +
        "  inputWrap.style.cssText='display:flex;align-items:flex-end;gap:7px;background:#F3F4F6;border-radius:24px;padding:5px 5px 5px 14px;';" +

        "  input=document.createElement('textarea');" +
        "  input.rows=1;" +
        "  input.placeholder='Спросите про On.i CRM…';" +
        "  input.style.cssText='flex:1;resize:none;min-height:36px;max-height:110px;border:0;outline:0;background:transparent;color:#111827;font:inherit;font-size:14px;line-height:1.45;padding:8px 0;';" +

        "  sendBtn=document.createElement('button');" +
        "  sendBtn.type='button';" +
        "  sendBtn.textContent='➤';" +
        "  sendBtn.style.cssText='width:36px;height:36px;flex:0 0 36px;border:0;border-radius:50%;background:#0A84FF;color:#fff;font-size:17px;display:flex;align-items:center;justify-content:center;';" +
        "  sendBtn.onclick=function(){send();};" +

        "  input.onkeydown=function(e){" +
        "    if(e.key==='Enter'&&!e.shiftKey){" +
        "      e.preventDefault();" +
        "      send();" +
        "    }" +
        "  };" +

        "  input.oninput=function(){" +
        "    input.style.height='auto';" +
        "    input.style.height=Math.min(110,input.scrollHeight)+'px';" +
        "  };" +

        "  inputWrap.appendChild(input);" +
        "  inputWrap.appendChild(sendBtn);" +
        "  footer.appendChild(inputWrap);" +
        "  overlay.appendChild(footer);" +

        "  document.body.appendChild(overlay);" +
        "  drawHistory();" +
        "  setTimeout(function(){if(input)input.focus();},180);" +
        "};" +

        "console.log('[On.i] Guide chat injected');" +
        "})();";

    webView.evaluateJavascript(js, null);
}
    @Override protected void onPause() {
        if (webView != null) webView.evaluateJavascript("try{if(window.saveUiState)saveUiState();}catch(e){}", null);
        super.onPause();
    }

    @Override public void onBackPressed() {
        if (webView == null) { super.onBackPressed(); return; }
        webView.evaluateJavascript("(function(){try{return !!(window.onAndroidBack && window.onAndroidBack());}catch(e){return false;}})();", value -> {
            if ("false".equals(value) || "null".equals(value)) MainActivity.super.onBackPressed();
        });
    }

    @Override protected void onDestroy() {
        if (printWebView != null) { printWebView.stopLoading(); printWebView.destroy(); printWebView = null; }
        if (webView != null) { webView.stopLoading(); webView.destroy(); }
        kaspiExecutor.shutdownNow();
        ocrExecutor.shutdownNow();
        super.onDestroy();
    }
}
