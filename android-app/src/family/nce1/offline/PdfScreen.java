package family.nce1.offline;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.pdf.PdfRenderer;
import android.os.ParcelFileDescriptor;
import android.view.Gravity;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class PdfScreen {
    interface Error { void show(String message); }
    private final Activity activity;
    private final LinearLayout host;
    private final LinearLayout panel;
    private final java.util.concurrent.ThreadPoolExecutor worker = new java.util.concurrent.ThreadPoolExecutor(
        1, 1, 0L, java.util.concurrent.TimeUnit.MILLISECONDS, new java.util.concurrent.LinkedBlockingQueue<Runnable>());
    private final ImageView image;
    private final EditText pageInput;
    private final TextView count;
    private final Error error;
    private PdfRenderer renderer;
    private ParcelFileDescriptor descriptor;
    private volatile boolean closed;
    private int current;
    private int pages;
    private float zoom = 1;
    private volatile int generation;
    private File temporary;
    private Bitmap bitmap;

    PdfScreen(Activity activity, LinearLayout host, String key, int first, Error error) {
        this.activity = activity; this.host = host; this.error = error;
        panel = new LinearLayout(activity);
        panel.setOrientation(LinearLayout.VERTICAL);
        LinearLayout nav = new LinearLayout(activity);
        addButton(nav, "上一页", () -> show(current - 1));
        pageInput = new EditText(activity);
        pageInput.setSingleLine(true);
        pageInput.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
        pageInput.setTextSize(15);
        nav.addView(pageInput, new LinearLayout.LayoutParams(0, -2, 1));
        addButton(nav, "跳转", () -> {
            try { show(Integer.parseInt(pageInput.getText().toString())); }
            catch (NumberFormatException ex) { error.show("请输入 PDF 页码"); }
        });
        addButton(nav, "下一页", () -> show(current + 1));
        panel.addView(nav);
        LinearLayout tools = new LinearLayout(activity);
        count = new TextView(activity);
        count.setGravity(Gravity.CENTER);
        tools.addView(count, new LinearLayout.LayoutParams(0, -2, 2));
        addButton(tools, "缩小", () -> { zoom = Math.max(1, zoom - 0.5f); show(current); });
        addButton(tools, "放大", () -> { zoom = Math.min(3, zoom + 0.5f); show(current); });
        panel.addView(tools);
        ScrollView vertical = new ScrollView(activity);
        android.widget.HorizontalScrollView horizontal = new android.widget.HorizontalScrollView(activity);
        image = new ImageView(activity);
        image.setAdjustViewBounds(true);
        horizontal.addView(image);
        vertical.addView(horizontal);
        panel.addView(vertical, new LinearLayout.LayoutParams(-1, 0, 1));
        host.addView(panel, new LinearLayout.LayoutParams(-1, 0, 1));
        count.setText("正在打开离线扫描教材…");
        worker.execute(() -> load(key, first));
    }

    private void addButton(LinearLayout row, String text, Runnable action) {
        Button button = new Button(activity);
        button.setText(text); button.setTextSize(12);
        button.setOnClickListener(v -> action.run());
        row.addView(button, new LinearLayout.LayoutParams(0, -2, 1));
    }

    private void load(String key, int first) {
        try {
            if (closed) return;
            File file = File.createTempFile("nce-" + key + "-", ".pdf", activity.getCacheDir());
            temporary = file;
            try (InputStream in = activity.getAssets().open("books/" + key + ".pdf");
                 FileOutputStream out = new FileOutputStream(file)) {
                byte[] bytes = new byte[32768];
                for (int n; !closed && (n = in.read(bytes)) != -1;) out.write(bytes, 0, n);
            }
            if (closed) return;
            descriptor = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
            renderer = new PdfRenderer(descriptor);
            int total = renderer.getPageCount();
            activity.runOnUiThread(() -> {
                if (closed) return;
                pages = total;
                if (first > pages) { error.show("PDF 页码超出范围，共 " + pages + " 页"); show(1); }
                else show(first);
            });
        } catch (Exception ex) { activity.runOnUiThread(() -> { if (!closed) error.show("无法打开内置 PDF 教材"); }); }
    }

    private void show(int pageNumber) {
        if (closed || pages == 0) return;
        if (pageNumber < 1 || pageNumber > pages) { error.show("请输入 1–" + pages + " 的 PDF 页码"); return; }
        current = pageNumber;
        pageInput.setText(String.valueOf(current));
        count.setText("PDF " + current + " / " + pages + "（扫描页，可放大）");
        int job = ++generation;
        int width = Math.min(1600, Math.max(480, (int) (activity.getResources().getDisplayMetrics().widthPixels * zoom)));
        worker.getQueue().clear();
        worker.execute(() -> render(pageNumber, width, job));
    }

    private void render(int pageNumber, int width, int job) {
        if (closed || job != generation || renderer == null) return;
        try (PdfRenderer.Page page = renderer.openPage(pageNumber - 1)) {
            if (closed || job != generation) return;
            int height = Math.min(2400, (int) ((long) width * page.getHeight() / page.getWidth()));
            Bitmap rendered = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
            rendered.eraseColor(android.graphics.Color.WHITE);
            page.render(rendered, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
            activity.runOnUiThread(() -> {
                if (closed || job != generation) { rendered.recycle(); return; }
                Bitmap old = bitmap;
                bitmap = rendered; image.setImageBitmap(rendered);
                image.setLayoutParams(new android.widget.FrameLayout.LayoutParams(rendered.getWidth(), rendered.getHeight()));
                if (old != null) old.recycle();
            });
        } catch (OutOfMemoryError exhausted) {
            activity.runOnUiThread(() -> { if (!closed) error.show("设备内存不足，请缩小后重试教材页"); });
        } catch (Exception ex) { activity.runOnUiThread(() -> { if (!closed && job == generation) error.show("扫描教材此页渲染失败"); }); }
    }

    void close() {
        closed = true; generation++;
        host.removeView(panel); image.setImageDrawable(null);
        if (bitmap != null) { bitmap.recycle(); bitmap = null; }
        worker.getQueue().clear();
        worker.execute(() -> {
            if (renderer != null) renderer.close();
            try { if (descriptor != null) descriptor.close(); } catch (Exception ignored) { }
            if (temporary != null) temporary.delete();
        });
        worker.shutdown();
    }
}
