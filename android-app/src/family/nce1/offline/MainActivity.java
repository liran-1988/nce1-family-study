package family.nce1.offline;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Bundle;
import android.provider.DocumentsContract;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.MediaController;
import android.widget.TextView;
import android.widget.Toast;
import android.widget.VideoView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    static final String ORIGIN = "https://offline.nce.local";
    static final String HOME = ORIGIN + "/assets/index.html";
    private static final int PICK_FOLDER = 71;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private WebView web;
    private LinearLayout root;
    private VideoView video;
    private PdfScreen pdf;
    private JSONObject mapping = new JSONObject();
    private SharedPreferences prefs;
    private TextToSpeech tts;
    private volatile boolean ttsReady;
    private volatile String activeSpeech;
    private long speechSequence;
    private boolean resumed;
    private volatile boolean trusted;
    private boolean destroyed;
    private int videoPosition;
    private volatile int mediaGeneration;
    private AudioManager audio;
    private AudioFocusRequest focus;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        prefs = getSharedPreferences("media", MODE_PRIVATE);
        audio = (AudioManager) getSystemService(AUDIO_SERVICE);
        loadMapping();
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        setContentView(root);
        buildToolbar();
        buildWeb();
        web.loadUrl(HOME);
        tts = new TextToSpeech(this, status -> runOnUiThread(() -> initSpeech(status)));
        tts.setOnUtteranceProgressListener(new android.speech.tts.UtteranceProgressListener() {
            @Override public void onStart(String id) { }
            @Override public void onDone(String id) { runOnUiThread(() -> {
                if (!id.equals(activeSpeech)) return;
                activeSpeech = null; releaseFocus(); event("android-tts-end", "{}");
            }); }
            @Override public void onError(String id) { runOnUiThread(() -> {
                if (id.equals(activeSpeech)) speechError("离线英语朗读失败");
            }); }
            @Override public void onStop(String id, boolean interrupted) { runOnUiThread(() -> {
                if (id.equals(activeSpeech)) speechError("朗读已停止");
            }); }
        });
    }

    private void loadMapping() {
        try (InputStream stream = getAssets().open("media-map.json")) {
            java.io.ByteArrayOutputStream buffer = new java.io.ByteArrayOutputStream();
            byte[] bytes = new byte[8192];
            for (int n; (n = stream.read(bytes)) != -1;) buffer.write(bytes, 0, n);
            mapping = new JSONObject(new String(buffer.toByteArray(), StandardCharsets.UTF_8));
        } catch (Exception ex) { Toast.makeText(this, "媒体映射未加载", Toast.LENGTH_LONG).show(); }
    }

    private void buildToolbar() {
        LinearLayout bar = new LinearLayout(this);
        bar.setBackgroundColor(Color.rgb(235, 245, 248));
        addButton(bar, "返回课程", v -> returnToCourse());
        addButton(bar, "媒体目录", v -> chooseFolder());
        addButton(bar, "教材", v -> openBook("student", 1));
        addButton(bar, "家长资料", v -> parentBooks());
        root.addView(bar);
    }

    private void addButton(LinearLayout bar, String text, View.OnClickListener action) {
        Button button = new Button(this);
        button.setText(text);
        button.setTextSize(13);
        button.setOnClickListener(action);
        bar.addView(button, new LinearLayout.LayoutParams(0, -2, 1));
    }

    private void parentBooks() {
        new AlertDialog.Builder(this).setTitle("家长补充资料（含答案）")
            .setItems(new String[]{"练习册附答案", "教师用书"}, (d, item) ->
                openBook(item == 0 ? "workbook" : "teacher", 1)).setNegativeButton("取消", null).show();
    }

    private void buildWeb() {
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setSupportMultipleWindows(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        web.addJavascriptInterface(new Bridge(), "AndroidMedia");
        web.setWebViewClient(new LocalClient());
        web.setWebChromeClient(new android.webkit.WebChromeClient() {
            @Override public boolean onConsoleMessage(android.webkit.ConsoleMessage message) {
                if (message.messageLevel() == android.webkit.ConsoleMessage.MessageLevel.ERROR) {
                    android.util.Log.e("NceOffline", "Local page script error at line " + message.lineNumber());
                    error("页面脚本无法运行，请由家长检查本机 Android System WebView 版本。");
                }
                return true;
            }
        });
        root.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));
    }

    private final class LocalClient extends WebViewClient {
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return !request.isForMainFrame() || !HOME.equals(request.getUrl().toString().split("#", 2)[0]);
        }
        @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
            trusted = HOME.equals(url.split("#", 2)[0]);
        }
        @Override public void onPageFinished(WebView view, String url) { notifyStatus(); }
        @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
            return localResponse(req);
        }
    }

    private WebResourceResponse localResponse(WebResourceRequest request) {
        Uri uri = request.getUrl();
        String path = uri.getPath();
        if (!"GET".equals(request.getMethod()) || !"https".equals(uri.getScheme())
            || !"offline.nce.local".equals(uri.getHost()) || uri.getPort() != -1
            || path == null || !path.startsWith("/assets/")) return blocked();
        String name = path.substring(8);
        if (!MediaRules.relative(name) || name.startsWith("books/")) return blocked();
        try {
            InputStream stream = getAssets().open(name);
            HashMap<String, String> headers = new HashMap<>();
            headers.put("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; "
                + "style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; "
                + "frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'");
            headers.put("X-Content-Type-Options", "nosniff");
            return new WebResourceResponse(mime(name), "UTF-8", 200, "OK", headers, stream);
        } catch (Exception ex) { return blocked(); }
    }

    private String mime(String name) {
        if (name.endsWith(".html")) return "text/html";
        if (name.endsWith(".js")) return "application/javascript";
        if (name.endsWith(".json")) return "application/json";
        if (name.endsWith(".css")) return "text/css";
        return "application/octet-stream";
    }

    private WebResourceResponse blocked() {
        return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", null,
            new ByteArrayInputStream(new byte[0]));
    }

    private void chooseFolder() {
        if (!resumed) return;
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.putExtra(Intent.EXTRA_LOCAL_ONLY, true);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        try { startActivityForResult(intent, PICK_FOLDER); }
        catch (Exception ex) { error("此设备不支持系统媒体目录选择器"); }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != PICK_FOLDER || result != RESULT_OK || data == null || data.getData() == null) return;
        Uri uri = data.getData();
        if (!"content".equals(uri.getScheme())) { error("请选择本机文件目录"); return; }
        try {
            getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            String old = prefs.getString("tree", "");
            prefs.edit().putString("tree", uri.toString()).apply();
            if (!old.isEmpty() && !old.equals(uri.toString())) releaseTree(Uri.parse(old));
            notifyStatus();
        } catch (Exception ex) { error("目录授权失败，请重新选择本机目录"); }
    }

    private void releaseTree(Uri tree) {
        try { getContentResolver().releasePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION); }
        catch (Exception ignored) { /* Provider may already have revoked it. */ }
    }

    private boolean folderSelected() {
        String stored = prefs.getString("tree", "");
        for (android.content.UriPermission permission : getContentResolver().getPersistedUriPermissions()) {
            if (permission.isReadPermission() && permission.getUri().toString().equals(stored)) return true;
        }
        return false;
    }

    private String status() {
        JSONObject result = new JSONObject();
        try {
            int count = 0;
            JSONObject videos = mapping.optJSONObject("videos");
            if (videos != null) for (int lesson = 1; lesson <= 144; lesson++) count += videosFor(lesson).length();
            result.put("folderSelected", folderSelected()).put("localOnly", true).put("videoCount", count)
                .put("pdfMapped", true).put("origin", ORIGIN).put("androidMin", 26)
                .put("ttsReady", ttsReady);
        } catch (Exception ignored) { }
        return result.toString();
    }

    private void notifyStatus() { event("android-media-status", status()); }
    private void event(String name, String detail) {
        if (destroyed || web == null || !trusted) return;
        web.evaluateJavascript("window.dispatchEvent(new CustomEvent(" + JSONObject.quote(name)
            + ",{detail:" + detail + "}));", null);
    }

    private void error(String message) {
        if (destroyed) return;
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
        event("android-media-error", "{\"message\":" + JSONObject.quote(message) + "}");
    }

    private JSONArray videosFor(int lesson) {
        JSONObject videos = mapping.optJSONObject("videos");
        if (videos == null) return new JSONArray();
        Object value = videos.opt(String.valueOf(lesson));
        if (value instanceof JSONArray) return (JSONArray) value;
        JSONArray result = new JSONArray();
        if (value instanceof String) {
            try { result.put(new JSONObject().put("path", value).put("title", "Lesson " + lesson)); }
            catch (Exception ignored) { }
        }
        return result;
    }

    private void playLesson(int lesson) {
        if (!MediaRules.lesson(lesson)) { error("无效课号"); return; }
        JSONArray choices = videosFor(lesson);
        if (choices.length() == 0) { error("本课尚未配置离线视频"); return; }
        if (!folderSelected()) { error("请先选择已复制视频的本机媒体目录"); return; }
        String[] titles = new String[choices.length()];
        for (int i = 0; i < titles.length; i++) titles[i] = choices.optJSONObject(i).optString("title", "视频 " + (i + 1));
        new AlertDialog.Builder(this).setTitle("Lesson " + lesson + " · 选择视频")
            .setItems(titles, (d, selected) -> resolveVideo(choices.optJSONObject(selected)))
            .setNegativeButton("返回课程", null).show();
    }

    private void resolveVideo(JSONObject item) {
        String path = item.optString("path");
        if (!MediaRules.video(path)) { error("无效视频映射路径"); return; }
        int job = ++mediaGeneration;
        io.execute(() -> {
            if (job != mediaGeneration || destroyed) return;
            try {
                Uri uri;
                try { uri = resolveTree(path); }
                catch (java.io.FileNotFoundException missing) {
                    if (!path.startsWith("videos/") || path.indexOf('/', 7) != -1) throw missing;
                    uri = resolveTree(path.substring(7));
                }
                final Uri selected = uri;
                runOnUiThread(() -> {
                    if (!destroyed && resumed && job == mediaGeneration) showVideo(selected, item.optString("title", "离线视频"));
                });
            } catch (Exception ex) {
                runOnUiThread(() -> { if (job == mediaGeneration && !destroyed) error("未找到本机视频。请选择含 videos 子目录的 media 文件夹，并核对：" + path); });
            }
        });
    }

    private Uri resolveTree(String path) throws Exception {
        Uri tree = Uri.parse(prefs.getString("tree", ""));
        String id = DocumentsContract.getTreeDocumentId(tree);
        Uri found = null;
        for (String part : path.split("/")) {
            Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, id);
            found = null;
            try (Cursor cursor = getContentResolver().query(children,
                new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME},
                null, null, null)) {
                while (cursor != null && cursor.moveToNext()) {
                    if (part.equals(cursor.getString(1))) { id = cursor.getString(0); found = DocumentsContract.buildDocumentUriUsingTree(tree, id); break; }
                }
            }
            if (found == null) throw new java.io.FileNotFoundException();
        }
        return found;
    }

    private void showVideo(Uri uri, String title) {
        returnToCourse();
        cancelSpeech();
        web.setVisibility(View.GONE);
        event("android-video-start", "{}");
        videoPosition = 0;
        video = new VideoView(this) {
            @Override public void start() {
                if (resumed && requestFocus()) {
                    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    super.start();
                }
            }
            @Override public void pause() {
                super.pause();
                getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
        };
        root.addView(video, new LinearLayout.LayoutParams(-1, 0, 1));
        MediaController controls = new MediaController(this);
        controls.setAnchorView(video);
        video.setMediaController(controls);
        video.setAudioFocusRequest(AudioManager.AUDIOFOCUS_NONE);
        video.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).build());
        video.setOnPreparedListener(player -> { if (resumed && requestFocus()) { video.start(); controls.show(3000); } });
        video.setOnCompletionListener(player -> {
            releaseFocus(); getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
        video.setOnErrorListener((player, what, extra) -> { returnToCourse(); error("此设备无法解码此视频，请使用兼容 WebM 或 H.264/AAC 文件"); return true; });
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        video.setVideoURI(uri);
        Toast.makeText(this, title + " · 点击视频可暂停或拖动进度；返回键回课程", Toast.LENGTH_LONG).show();
    }

    private boolean requestFocus() {
        if (focus != null) return true;
        focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
            .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).build())
            .setOnAudioFocusChangeListener(change -> {
                if (change < 0) {
                    if (video != null) video.pause();
                    cancelSpeech();
                    releaseFocus();
                }
            }).build();
        boolean granted = audio.requestAudioFocus(focus) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        if (!granted) focus = null;
        return granted;
    }

    private void releaseFocus() { if (focus != null) { audio.abandonAudioFocusRequest(focus); focus = null; } }

    private void openBook(String key, int page) {
        if (!MediaRules.pdf(key) || page < 1 || page > 2000) { error("无效教材或页码"); return; }
        returnToCourse();
        web.setVisibility(View.GONE);
        pdf = new PdfScreen(this, root, key, page, message -> error(message));
    }

    private void openLessonBook(int lesson, int page) {
        if (!MediaRules.lesson(lesson)) { error("无效课号"); return; }
        JSONObject book = mapping.optJSONObject("pdf");
        JSONObject pages = book == null ? null : book.optJSONObject("pages");
        int mapped = pages == null ? 0 : pages.optInt(String.valueOf(lesson), 0);
        if (page == 0) page = mapped;
        if (page < 1) { error("本课未标注教材 PDF 页码"); return; }
        openBook("student", page);
        JSONObject statuses = book == null ? null : book.optJSONObject("pageStatus");
        if (statuses == null || !"verified".equals(statuses.optString(String.valueOf(lesson)))) {
            Toast.makeText(this, "本课来源页为待核导航候选，不代表课文已逐页核验", Toast.LENGTH_LONG).show();
        }
    }

    private void initSpeech(int status) {
        if (destroyed || status != TextToSpeech.SUCCESS) return;
        Voice selected = null;
        try {
            java.util.Set<Voice> voices = tts.getVoices();
            if (voices != null) for (Voice voice : voices) {
                if (voice != null && "en".equals(voice.getLocale().getLanguage()) && !voice.isNetworkConnectionRequired()) { selected = voice; break; }
            }
            ttsReady = selected != null && tts.setVoice(selected) == TextToSpeech.SUCCESS;
        } catch (Exception ex) { ttsReady = false; }
        notifyStatus();
    }

    private void cancelSpeech() {
        boolean pending = activeSpeech != null;
        activeSpeech = null;
        if (tts != null) tts.stop();
        if (pending) event("android-tts-error", "{\"message\":\"朗读已停止\"}");
    }

    private void speechError(String message) {
        activeSpeech = null;
        releaseFocus(); error(message);
        event("android-tts-error", "{\"message\":" + JSONObject.quote(message) + "}");
    }

    private void speakOffline(String text, float rate) {
        if (!ttsReady) { speechError("未安装离线英语音色。请由家长在系统语音设置准备音色；本应用不会联网下载。"); return; }
        if (text == null || text.trim().isEmpty() || text.length() > 2000 || !Float.isFinite(rate)) { error("朗读文本或速度无效"); return; }
        if (video != null) video.pause();
        if (!requestFocus()) { error("音频正在被其他应用使用"); return; }
        tts.setSpeechRate(Math.max(0.5f, Math.min(1.5f, rate)));
        activeSpeech = "lesson-" + (++speechSequence);
        if (tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, activeSpeech) != TextToSpeech.SUCCESS) speechError("离线英语朗读失败");
    }

    private void returnToCourse() {
        mediaGeneration++;
        if (video != null) { video.stopPlayback(); root.removeView(video); video = null; }
        if (pdf != null) { pdf.close(); pdf = null; }
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        releaseFocus();
        if (web != null) web.setVisibility(View.VISIBLE);
    }

    @Override public void onBackPressed() {
        if (video != null || pdf != null) { returnToCourse(); return; }
        mediaGeneration++;
        web.evaluateJavascript("window.dispatchEvent(new CustomEvent('android-back'));", null);
        new AlertDialog.Builder(this).setMessage("退出学习应用？进度会保存在本机。")
            .setPositiveButton("退出", (d, w) -> finish()).setNegativeButton("继续学习", null).show();
    }

    @Override protected void onResume() {
        super.onResume(); resumed = true;
        if (web != null) web.onResume();
        if (video != null) { video.seekTo(videoPosition); }
    }
    @Override protected void onPause() {
        resumed = false; mediaGeneration++;
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (video != null) { videoPosition = video.getCurrentPosition(); video.pause(); }
        cancelSpeech();
        releaseFocus();
        if (web != null) { web.onPause(); web.evaluateJavascript("window.dispatchEvent(new CustomEvent('android-pause'));", null); }
        super.onPause();
    }
    @Override protected void onDestroy() {
        destroyed = true; trusted = false;
        returnToCourse(); io.shutdownNow();
        if (tts != null) { tts.stop(); tts.shutdown(); }
        if (web != null) { web.removeJavascriptInterface("AndroidMedia"); web.destroy(); }
        super.onDestroy();
    }

    public final class Bridge {
        private void ui(Runnable action) { if (trusted) runOnUiThread(() -> { if (!destroyed && resumed && trusted) action.run(); }); }
        @JavascriptInterface public void chooseMediaFolder() { ui(() -> chooseFolder()); }
        @JavascriptInterface public String getMediaStatus() { return trusted ? status() : "{}"; }
        @JavascriptInterface public void playLessonVideo(int lessonId) { ui(() -> playLesson(lessonId)); }
        @JavascriptInterface public void openLessonPdf(int lessonId, int pdfPage) { ui(() -> openLessonBook(lessonId, pdfPage)); }
        @JavascriptInterface public void openPdf(String assetName, int pdfPage) { ui(() -> openBook(assetName, pdfPage)); }
        @JavascriptInterface public void speak(String text, float rate) { ui(() -> speakOffline(text, rate)); }
        @JavascriptInterface public void stopSpeech() { ui(() -> { cancelSpeech(); releaseFocus(); }); }
        @JavascriptInterface public void pauseMedia() { ui(() -> {
            if (video != null) video.pause();
            cancelSpeech();
            releaseFocus();
            Toast.makeText(MainActivity.this, "到了家庭自选休息提醒，可以暂停或结束，无自动续播", Toast.LENGTH_LONG).show();
        }); }
    }
}
