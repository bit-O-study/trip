package kr.bito.trip;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.util.Collections;
import org.json.JSONObject;

/** Only the first-party main frame can ask the user to save a PDF/JPG. */
final class ItineraryFileExport {
    static final int REQUEST_SAVE = 4120;
    private final Activity activity;
    private final File pending;
    private JavaScriptReplyProxy reply;
    private boolean saving;

    ItineraryFileExport(Activity activity, WebView web, String origin, Bundle state) {
        this.activity = activity;
        pending = new File(activity.getCacheDir(), "itinerary-export.pending");
        saving = state != null && state.getBoolean("itinerary-export-pending", false) && pending.exists();
        if (!saving) pending.delete();
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return;
        WebViewCompat.addWebMessageListener(web, "TripFileExport", Collections.singleton(origin), (view, message, source, mainFrame, proxy) -> {
            if (!mainFrame || !origin.equals(source.toString())) return;
            if (saving) { respond(proxy, "error", "이미 저장 중입니다."); return; }
            try {
                String raw = message.getData();
                if (raw == null || raw.length() > 29 * 1024 * 1024) throw new Exception("File too large");
                JSONObject data = new JSONObject(raw);
                String mime = data.getString("mime");
                if (!mime.equals("application/pdf") && !mime.equals("image/jpeg")) throw new Exception("Unsupported file");
                byte[] bytes = Base64.decode(data.getString("data"), Base64.DEFAULT);
                if (bytes.length < 4 || bytes.length > 20 * 1024 * 1024) throw new Exception("Invalid size");
                boolean pdf = mime.equals("application/pdf");
                if (pdf ? !(bytes[0] == '%' && bytes[1] == 'P' && bytes[2] == 'D' && bytes[3] == 'F') : !((bytes[0] & 255) == 255 && (bytes[1] & 255) == 216)) throw new Exception("Invalid signature");
                String name = data.getString("filename").replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
                if (name.length() > 120) name = name.substring(0, 120);
                String extension = pdf ? ".pdf" : ".jpg";
                if (!name.endsWith(extension)) name += extension;
                try (FileOutputStream output = new FileOutputStream(pending)) { output.write(bytes); }
                saving = true; reply = proxy;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime).putExtra(Intent.EXTRA_TITLE, name);
                activity.startActivityForResult(intent, REQUEST_SAVE);
            } catch (Exception error) {
                saving = false; pending.delete(); reply = null;
                respond(proxy, "error", "파일을 저장하지 못했습니다. 메모를 빼거나 날짜를 선택해 다시 시도해 주세요.");
            }
        });
    }

    void saveState(Bundle state) { state.putBoolean("itinerary-export-pending", saving); }

    void onResult(int request, int result, Intent data) {
        if (request != REQUEST_SAVE || !saving) return;
        if (result != Activity.RESULT_OK || data == null || data.getData() == null) { finish("cancelled", "저장을 취소했습니다."); return; }
        Uri uri = data.getData();
        new Thread(() -> {
            String status = "success", message = "일정 파일을 저장했습니다.";
            try (OutputStream output = activity.getContentResolver().openOutputStream(uri, "wt")) {
                if (output == null) throw new Exception("No output stream");
                Files.copy(pending.toPath(), output);
            } catch (Exception error) { status = "error"; message = "파일 저장에 실패했습니다. 다시 시도해 주세요."; }
            final String completedStatus = status, completedMessage = message;
            activity.runOnUiThread(() -> finish(completedStatus, completedMessage));
        }, "trip-export-save").start();
    }

    private void finish(String status, String message) {
        saving = false; pending.delete();
        if (reply != null) respond(reply, status, message);
        reply = null;
        Toast.makeText(activity, message, Toast.LENGTH_LONG).show();
    }

    private static void respond(JavaScriptReplyProxy proxy, String status, String message) {
        try { proxy.postMessage(new JSONObject().put("status", status).put("message", message).toString()); } catch (Exception ignored) { }
    }
}
