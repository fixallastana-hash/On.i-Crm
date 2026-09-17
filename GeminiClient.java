package com.oni.crm;

import java.io.OutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONObject;

public class GeminiClient {

    public static String generateText(String apiKey, String model, String prompt) throws Exception {
        String urlStr = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + apiKey;

        JSONObject requestBody = new JSONObject();
        JSONArray contents = new JSONArray();
        JSONObject parts = new JSONObject();
        parts.put("text", prompt);
        contents.put(new JSONObject().put("parts", new JSONArray().put(parts)));
        requestBody.put("contents", contents);

        JSONObject generationConfig = new JSONObject();
        generationConfig.put("response_mime_type", "application/json");
        requestBody.put("generationConfig", generationConfig);

        return sendRequest(urlStr, requestBody.toString());
    }

    public static String generateWithSearch(String apiKey, String model, String prompt) throws Exception {
        String urlStr = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + apiKey;

        JSONObject requestBody = new JSONObject();
        JSONArray contents = new JSONArray();
        JSONObject parts = new JSONObject();
        parts.put("text", prompt);
        contents.put(new JSONObject().put("parts", new JSONArray().put(parts)));
        requestBody.put("contents", contents);

        JSONArray tools = new JSONArray();
        JSONObject searchTool = new JSONObject();
        searchTool.put("google_search", new JSONObject());
        tools.put(searchTool);
        requestBody.put("tools", tools);

        // ВАЖНО: не добавляем response_mime_type — Google запрещает его вместе с tools.

        return sendRequest(urlStr, requestBody.toString());
    }

    public static String generateVision(String apiKey, String model, String prompt, String base64Image, String mimeType) throws Exception {
        String urlStr = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + apiKey;

        JSONObject requestBody = new JSONObject();
        JSONArray contents = new JSONArray();
        JSONArray parts = new JSONArray();

        JSONObject textPart = new JSONObject();
        textPart.put("text", prompt);
        parts.put(textPart);

        JSONObject inlineData = new JSONObject();
        inlineData.put("mime_type", (mimeType == null || mimeType.isEmpty()) ? "image/jpeg" : mimeType);
        inlineData.put("data", base64Image);
        JSONObject imagePart = new JSONObject();
        imagePart.put("inline_data", inlineData);
        parts.put(imagePart);

        JSONObject oneContent = new JSONObject();
        oneContent.put("parts", parts);
        contents.put(oneContent);
        requestBody.put("contents", contents);

        JSONObject generationConfig = new JSONObject();
        generationConfig.put("response_mime_type", "application/json");
        requestBody.put("generationConfig", generationConfig);

        return sendRequest(urlStr, requestBody.toString());
    }

    private static String sendRequest(String urlStr, String jsonBody) throws Exception {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
        conn.setDoOutput(true);
        conn.setConnectTimeout(30000);
        conn.setReadTimeout(120000);

        try (OutputStream os = conn.getOutputStream()) {
            byte[] input = jsonBody.getBytes(StandardCharsets.UTF_8);
            os.write(input, 0, input.length);
        }

        int responseCode = conn.getResponseCode();
        InputStream is = responseCode == HttpURLConnection.HTTP_OK
                ? conn.getInputStream() : conn.getErrorStream();

        if (is == null) throw new Exception("Пустой ответ от Gemini");

        StringBuilder sb = new StringBuilder();
        try (InputStream in = is) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) sb.append(new String(buf, 0, n, StandardCharsets.UTF_8));
        }
        String response = sb.toString();

        if (responseCode != HttpURLConnection.HTTP_OK) {
            throw new Exception("Ошибка Gemini HTTP " + responseCode + ": " + response.substring(0, Math.min(300, response.length())));
        }

        JSONObject r = new JSONObject(response);
        JSONArray candidates = r.optJSONArray("candidates");
        if (candidates == null || candidates.length() == 0) return "";
        JSONObject content = candidates.getJSONObject(0).optJSONObject("content");
        if (content == null) return "";
        JSONArray parts = content.optJSONArray("parts");
        if (parts == null || parts.length() == 0) return "";
        return parts.getJSONObject(0).optString("text", "");
    }
}
