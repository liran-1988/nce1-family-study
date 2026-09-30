package family.nce1.test;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;
import android.widget.VideoView;
import java.lang.reflect.Field;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

public final class NativeChecks extends Instrumentation {
    private Activity activity;
    private WebView web;
    private final JSONObject result = new JSONObject();
    @Override public void onCreate(Bundle arguments) { super.onCreate(arguments); start(); }
    private Object field(String name) throws Exception {
        Field field = activity.getClass().getDeclaredField(name);
        field.setAccessible(true); return field.get(activity);
    }
    private String js(String code) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        String[] value = new String[1];
        runOnMainSync(() -> web.evaluateJavascript(code, answer -> { value[0] = answer; done.countDown(); }));
        if (!done.await(15, TimeUnit.SECONDS)) throw new Exception("JS timeout");
        return value[0];
    }
    private void record(String key, Object value) throws Exception { result.put(key, value); }
    private String videoState() throws Exception {
        String[] state = new String[1];
        runOnMainSync(() -> {
            try {
                VideoView view = (VideoView) field("video");
                state[0] = view == null ? "none" : "playing=" + view.isPlaying() + ",position=" + view.getCurrentPosition() + ",duration=" + view.getDuration();
            } catch (Exception ex) { state[0] = ex.toString(); }
        });
        return state[0];
    }
    @Override public void onStart() {
        Bundle output = new Bundle();
        try {
            Intent intent = new Intent(Intent.ACTION_MAIN);
            intent.setClassName("family.nce1.offline", "family.nce1.offline.MainActivity");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity = startActivitySync(intent);
            Thread.sleep(2500);
            web = (WebView) field("web");
            record("origin", js("location.origin"));
            record("initialProgress", js("localStorage.getItem('nce1.done')"));
            record("folderStatus", js("AndroidMedia.getMediaStatus()"));
            record("overflow", js("document.documentElement.scrollWidth>innerWidth"));
            record("coursePdfPages", js("JSON.stringify([LESSONS.find(x=>x.id===19).sourceRefs[0].pdfPage,LESSONS.find(x=>x.id===143).sourceRefs[0].pdfPage])"));
            record("markerBefore", js("localStorage.getItem('android-native-test')"));
            js("localStorage.setItem('android-native-test','preserved-final');location.hash='#/l/1';");
            Thread.sleep(600);
            js("NceApp.state.settings.breakMinutes=10;localStorage.setItem('nce1.settings.v2',JSON.stringify(NceApp.state.settings));window.__events=[];['android-video-start','android-media-error','android-pause','android-tts-error'].forEach(n=>addEventListener(n,e=>__events.push(n)));");
            Thread.sleep(800);
            android.view.accessibility.AccessibilityNodeInfo root = getUiAutomation().getRootInActiveWindow();
            java.util.List<android.view.accessibility.AccessibilityNodeInfo> items = root.findAccessibilityNodeInfosByText("Part 1");
            if (items.isEmpty()) throw new Exception("Native video chooser not found");
            android.graphics.Rect bounds = new android.graphics.Rect();
            items.get(0).getBoundsInScreen(bounds);
            getUiAutomation().executeShellCommand("input tap " + bounds.centerX() + " " + bounds.centerY()).close();
            Thread.sleep(3500);
            // Native choice can vary by tablet/phone config; click first visible dialog item by UI XML outside this test if needed.
            record("beforeTimerVideo", videoState());
            record("visibleWhileVideo", js("JSON.stringify({hidden:document.hidden,paused:sessionPaused,events:__events})"));
            js("lastBreak=Date.now()-10*60000;");
            Thread.sleep(12000);
            record("afterTimerVideo", videoState());
            record("timerState", js("JSON.stringify({hidden:document.hidden,paused:sessionPaused,events:__events})"));
            Thread.sleep(2500);
            record("notAutoResumed", videoState());
            js("AndroidMedia.pauseMedia();");
            Thread.sleep(300);
            record("directPause", videoState());
            js("NceApp.state.settings.breakMinutes=0;localStorage.setItem('nce1.settings.v2',JSON.stringify(NceApp.state.settings));");
            output.putString("checks", result.toString());
            finish(Activity.RESULT_OK, output);
        } catch (Throwable ex) {
            output.putString("checks", result.toString()); output.putString("failure", ex.toString());
            finish(Activity.RESULT_CANCELED, output);
        }
    }
}
