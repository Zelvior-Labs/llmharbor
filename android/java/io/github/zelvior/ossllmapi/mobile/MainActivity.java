package io.github.zelvior.ossllmapi.mobile;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.LocalSocket;
import android.net.LocalSocketAddress;
import android.net.Uri;
import android.os.*;
import android.view.View;
import android.view.WindowManager;
import android.widget.*;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Tiny native controller. The phone's browser handles dashboard downloads, clipboard and file pickers. */
public final class MainActivity extends Activity {
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private LinearLayout panel;
    private TextView status, codes;
    private Button start, open, stop;
    private boolean visible, pending;
    private long startTime;
    private final Runnable refresh = () -> poll(false);

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE); // Keep codes out of Recents thumbnails.
        getWindow().setStatusBarColor(Color.rgb(19, 78, 74));
        ScrollView scroll = new ScrollView(this);
        panel = new LinearLayout(this); panel.setOrientation(LinearLayout.VERTICAL);
        int pad = Math.round(getResources().getDisplayMetrics().density * 20);
        panel.setPadding(pad, pad, pad, pad); scroll.addView(panel); setContentView(scroll);
        TextView title = label("OSSLLMAPI", 28); title.setTypeface(null, Typeface.BOLD);
        label("On-device gateway  /  Android ARMv7", 14);
        status = label("Checking gateway…", 19);
        codes = label("", 18); codes.setTypeface(Typeface.MONOSPACE); codes.setTextIsSelectable(true);
        start = button("Start gateway", v -> {
            startTime = SystemClock.elapsedRealtime(); start.setEnabled(false);
            status.setText("Starting gateway…");
            startForegroundService(new Intent(this, GatewayService.class));
            poll(false);
        });
        open = button("Open dashboard", v -> poll(true));
        stop = button("Stop gateway", v -> {
            startTime = 0; open.setEnabled(false); stop.setEnabled(false);
            stopService(new Intent(this, GatewayService.class));
        });
        label("API base URL", 14);
        label("http://127.0.0.1:31415/v1", 18).setTextIsSelectable(true);
        label("Start the gateway, then open the dashboard in your browser. On first use, create an account with the setup code above. Add your provider keys in Keys. Use the unified key for other apps on this phone.", 16);
        label("Keep the gateway notification running while using the API. Close the dashboard before stopping. If Android Go frees memory, return here and start the gateway again.", 14);
        start.setEnabled(false); open.setEnabled(false); stop.setEnabled(false);
    }
    private TextView label(String value, int size) {
        TextView t = new TextView(this); t.setText(value); t.setTextSize(size);
        t.setPadding(0, 8, 0, 10); panel.addView(t); return t;
    }
    private Button button(String text, View.OnClickListener click) {
        Button b = new Button(this); b.setText(text); b.setAllCaps(false);
        b.setOnClickListener(click); panel.addView(b); return b;
    }
    private JSONObject query() {
        // Do NOT treat a response on localhost:31415 as proof this is our server.
        // Only our UID can reach this filesystem socket. No token/code is sent in a URL or intent.
        try (LocalSocket s = new LocalSocket()) {
            s.connect(new LocalSocketAddress(new File(getFilesDir(), "control.sock").getPath(), LocalSocketAddress.Namespace.FILESYSTEM));
            s.setSoTimeout(1500);
            String line = new BufferedReader(new InputStreamReader(s.getInputStream(), StandardCharsets.UTF_8)).readLine();
            JSONObject state = new JSONObject(line);
            return state.getInt("port") == 31415 ? state : null;
        } catch (Exception offline) { return null; }
    }
    private void poll(boolean launchBrowser) {
        if (!visible || (pending && !launchBrowser)) return;
        pending = true; ui.removeCallbacks(refresh);
        io.execute(() -> {
            JSONObject state = query();
            ui.post(() -> {
                pending = false; if (!visible) return;
                boolean online = state != null;
                long elapsed = startTime == 0 ? 0 : SystemClock.elapsedRealtime() - startTime;
                boolean starting = !online && startTime != 0 && elapsed < 30000;
                start.setEnabled(!starting && !online); open.setEnabled(online); stop.setEnabled(online || starting);
                String code = "";
                if (online) {
                    startTime = 0;
                    status.setText("Gateway running · " + state.optString("arch") + " · Node " + state.optString("node"));
                    if (!state.isNull("setup")) code = "Setup code: " + state.optString("setup");
                    if (!state.isNull("reset")) code = "Reset code: " + state.optString("reset");
                } else status.setText(starting ? "Starting gateway…" : elapsed == 0 ? "Gateway stopped" :
                    "Gateway didn't start. Check free space and close any app using port 31415, then try again.");
                codes.setVisibility(code.isEmpty() ? View.GONE : View.VISIBLE); codes.setText(code);
                if (launchBrowser && online) try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("http://127.0.0.1:31415/")));
                } catch (ActivityNotFoundException err) {
                    Toast.makeText(this, "No browser installed. Install a current Android browser and try again.", Toast.LENGTH_LONG).show();
                }
                ui.removeCallbacks(refresh); ui.postDelayed(refresh, starting ? 500 : 1800);
            });
        });
    }
    @Override protected void onResume() { super.onResume(); visible = true; poll(false); }
    @Override protected void onPause() { visible = false; ui.removeCallbacks(refresh); super.onPause(); }
    @Override protected void onDestroy() { io.shutdownNow(); super.onDestroy(); }
}
