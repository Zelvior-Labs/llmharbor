package io.github.zelvior.ossllmapi.mobile;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.content.pm.Signature;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.Icon;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.text.InputType;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/** Native controller. The phone's browser handles the dashboard, uploads and clipboard. */
public final class MainActivity extends Activity {
    private static final int REQ_EXPORT = 11, REQ_RESTORE = 12, REQ_DIAGNOSTICS = 13, REQ_CREDENTIAL = 14;
    private static final long REVEAL_MS = 60_000;
    private static final String ACTION_SHORTCUT = "io.github.zelvior.ossllmapi.mobile.SHORTCUT";

    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private LinearLayout panel;
    private TextView status, apiUrl, lanUrl, codes, hint, live;
    private Button start, open, stop, reveal, copyApi, copyLan, battery;
    private CheckBox lanCheck, bootCheck, keepCheck, ecoCheck;
    private boolean visible, pending, openWhenReady;
    private long startTime, revealUntil;
    private char[] pendingPassphrase;
    private JSONObject state;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE); // Keep codes out of Recents thumbnails.
        getWindow().setStatusBarColor(Color.rgb(19, 78, 74));
        build();
        if (Build.VERSION.SDK_INT >= 33
            && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] {"android.permission.POST_NOTIFICATIONS"}, 21);
        }
        publishShortcuts();
        handleIntent(getIntent());
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;
        if (Gateway.ACTION_OPEN.equals(intent.getAction())) openWhenReady = true;
        if (ACTION_SHORTCUT.equals(intent.getAction())) {
            String choice = intent.getStringExtra("shortcut");
            if ("start".equals(choice)) {
                startTime = SystemClock.elapsedRealtime();
                try { Gateway.start(this); } catch (RuntimeException refused) { startTime = 0; }
            } else if ("stop".equals(choice)) {
                Gateway.stop(this);
            } else if ("open".equals(choice)) {
                openWhenReady = true;
            }
            poll(false);
        }
    }

    /** Long-press shortcuts: start, open the dashboard or stop without opening the app. */
    private void publishShortcuts() {
        ShortcutManager manager = getSystemService(ShortcutManager.class);
        if (manager == null) return;
        List<ShortcutInfo> shortcuts = new ArrayList<>();
        shortcuts.add(shortcut("start", R.string.start_gateway, "start"));
        shortcuts.add(shortcut("open", R.string.open_dashboard, "open"));
        shortcuts.add(shortcut("stop", R.string.stop_gateway, "stop"));
        try {
            manager.setDynamicShortcuts(shortcuts);
        } catch (RuntimeException ignored) {
            // Some launchers cap or refuse dynamic shortcuts.
        }
    }

    private ShortcutInfo shortcut(String id, int label, String choice) {
        Intent intent = new Intent(this, MainActivity.class)
            .setAction(ACTION_SHORTCUT).putExtra("shortcut", choice);
        return new ShortcutInfo.Builder(this, id)
            .setShortLabel(getString(label))
            .setIcon(Icon.createWithResource(this, R.drawable.router_icon))
            .setIntent(intent)
            .build();
    }

    private void build() {
        ScrollView scroll = new ScrollView(this);
        panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        int pad = Math.round(getResources().getDisplayMetrics().density * 20);
        panel.setPadding(pad, pad, pad, pad);
        scroll.addView(panel);
        setContentView(scroll);

        TextView title = label("OSSLLMAPI", 28);
        title.setTypeface(null, Typeface.BOLD);
        label(getString(R.string.subtitle, versionName(), Build.SUPPORTED_ABIS[0]), 14);
        status = label("Checking gateway…", 18);
        status.setTypeface(null, Typeface.BOLD);

        start = button(R.string.start_gateway, view -> {
            startTime = SystemClock.elapsedRealtime();
            start.setEnabled(false);
            status.setText(R.string.starting_gateway);
            try {
                Gateway.start(this);
            } catch (RuntimeException refused) {
                startTime = 0;
                toast("Android refused the background start. Open the app and try again.");
            }
            poll(false);
        });
        open = button(R.string.open_dashboard, view -> openDashboard());
        stop = button(R.string.stop_gateway, view -> {
            startTime = 0;
            open.setEnabled(false);
            stop.setEnabled(false);
            Gateway.stop(this);
            poll(false);
        });

        codes = label("", 18);
        codes.setTypeface(Typeface.MONOSPACE);
        codes.setTextIsSelectable(true);
        codes.setVisibility(View.GONE);
        reveal = button(R.string.show_code, view -> {
            if (state == null) return;
            if (revealUntil > SystemClock.elapsedRealtime()) {
                revealUntil = 0;
                refreshCodes();
                return;
            }
            confirmDevice();
        });

        section(R.string.section_api);
        apiUrl = label("", 16);
        apiUrl.setTextIsSelectable(true);
        copyApi = button(R.string.copy_api, view -> copy(apiUrl.getText().toString(), "API base URL copied"));
        hint = label("", 13);
        hint.setVisibility(View.GONE);

        section(R.string.section_status);
        live = label(getString(R.string.status_offline), 15);
        live.setTextIsSelectable(true);

        section(R.string.section_network);
        lanCheck = check(R.string.lan_toggle, Prefs.get(this, Prefs.LAN));
        lanCheck.setOnCheckedChangeListener((view, checked) -> {
            Prefs.set(this, Prefs.LAN, checked);
            if (Gateway.running(this)) {
                toast(checked ? "Restarting with LAN access" : "Restarting with LAN access off");
                Gateway.stop(this);
                ui.postDelayed(() -> {
                    try { Gateway.start(this); } catch (RuntimeException ignored) { }
                }, 1200);
            }
            poll(false);
        });
        lanUrl = label("", 16);
        lanUrl.setTextIsSelectable(true);
        copyLan = button(R.string.copy_lan, view -> copy(lanUrl.getText().toString(), "LAN URL copied"));
        label(getString(R.string.lan_warning), 13);

        section(R.string.section_background);
        bootCheck = check(R.string.boot_toggle, Prefs.get(this, Prefs.BOOT));
        bootCheck.setOnCheckedChangeListener((view, checked) -> Prefs.set(this, Prefs.BOOT, checked));
        keepCheck = check(R.string.keep_toggle, Prefs.get(this, Prefs.KEEP));
        keepCheck.setOnCheckedChangeListener((view, checked) -> Prefs.set(this, Prefs.KEEP, checked));
        ecoCheck = check(R.string.eco_toggle, Prefs.get(this, Prefs.ECO));
        ecoCheck.setOnCheckedChangeListener((view, checked) -> {
            Prefs.set(this, Prefs.ECO, checked);
            if (Gateway.running(this)) {
                toast(checked ? "Restarting in battery saver" : "Restarting with normal key checks");
                Gateway.stop(this);
                ui.postDelayed(() -> {
                    try { Gateway.start(this); } catch (RuntimeException ignored) { }
                }, 1200);
            }
            poll(false);
        });
        battery = button(R.string.battery_button, view -> requestBatteryExemption());

        section(R.string.section_update);
        label(getString(R.string.update_hint), 13);
        button(R.string.check_updates, view -> checkForUpdates());
        TextView certificate = label(getString(R.string.signing_certificate, fingerprint()), 11);
        certificate.setTypeface(Typeface.MONOSPACE);
        certificate.setTextIsSelectable(true);
        button(R.string.copy_certificate, view -> copy(fingerprint(), "Certificate fingerprint copied"));

        section(R.string.section_backup);
        label(getString(R.string.backup_hint), 13);
        button(R.string.export_backup, view -> askPassphrase(true));
        button(R.string.restore_backup, view -> askPassphrase(false));

        section(R.string.section_diagnostics);
        label(getString(R.string.diagnostics_hint), 13);
        button(R.string.export_diagnostics, view -> exportDiagnostics());

        label(getString(R.string.help_text), 13);
        start.setEnabled(false);
        open.setEnabled(false);
        stop.setEnabled(false);
        copyApi.setEnabled(false);
        copyLan.setEnabled(false);
    }

    private TextView label(String value, int size) {
        TextView text = new TextView(this);
        text.setText(value);
        text.setTextSize(size);
        text.setPadding(0, 8, 0, 10);
        panel.addView(text);
        return text;
    }

    private TextView section(int string) {
        TextView text = label(getString(string), 13);
        text.setTypeface(null, Typeface.BOLD);
        text.setTextColor(Color.rgb(15, 118, 110));
        text.setPadding(0, 32, 0, 6);
        return text;
    }

    private Button button(int text, View.OnClickListener click) {
        Button button = new Button(this);
        button.setText(text);
        button.setAllCaps(false);
        button.setOnClickListener(click);
        panel.addView(button);
        return button;
    }

    private CheckBox check(int text, boolean checked) {
        CheckBox box = new CheckBox(this);
        box.setText(text);
        box.setChecked(checked);
        panel.addView(box);
        return box;
    }

    private void poll(boolean launchBrowser) {
        if (!visible || (pending && !launchBrowser)) return;
        pending = true;
        io.execute(() -> {
            final JSONObject fresh = Gateway.state(this);
            final JSONObject snapshot = fresh == null ? null : Gateway.status(this);
            final String error = fresh == null ? startupError() : "";
            ui.post(() -> {
                pending = false;
                if (!visible) return;
                state = fresh;
                applyState(fresh, snapshot, error, launchBrowser);
            });
        });
    }

    private final Runnable pollRefresh = () -> poll(false);

    private void applyState(JSONObject fresh, JSONObject snapshot, String error, boolean launchBrowser) {
        boolean online = fresh != null;
        long elapsed = startTime == 0 ? 0 : SystemClock.elapsedRealtime() - startTime;
        boolean starting = !online && startTime != 0 && elapsed < 45_000;
        start.setEnabled(!starting && !online);
        open.setEnabled(online);
        stop.setEnabled(online || starting);
        copyApi.setEnabled(online);
        copyLan.setEnabled(online && lanCount(fresh) > 0);

        if (online) {
            startTime = 0;
            int port = fresh.optInt("port");
            status.setText(getString(R.string.status_running, fresh.optString("arch"),
                fresh.optString("node"), port));
            apiUrl.setText("http://127.0.0.1:" + port + "/v1");
            JSONArray lan = fresh.optJSONArray("lan");
            lanUrl.setText(lan == null || lan.length() == 0 ? getString(R.string.lan_off)
                : getString(R.string.lan_on, lan.optString(0)));
            StringBuilder counts = new StringBuilder();
            int enabledKeys = snapshot == null ? 0 : snapshot.optJSONObject("keys") == null ? 0
                : snapshot.optJSONObject("keys").optInt("enabled");
            int healthyKeys = snapshot == null ? 0 : snapshot.optJSONObject("keys") == null ? 0
                : snapshot.optJSONObject("keys").optInt("healthy");
            counts.append(getString(R.string.status_providers,
                snapshot == null ? 0 : snapshot.optInt("providers"), enabledKeys)).append('\n');
            counts.append(getString(R.string.status_health, healthyKeys, enabledKeys)).append('\n');
            counts.append(getString(R.string.status_requests,
                snapshot == null ? 0 : snapshot.optInt("requestsLastDay"))).append('\n');
            counts.append(getString(R.string.status_uptime, duration(
                snapshot == null ? 0 : snapshot.optLong("uptimeSec"))));
            if (snapshot != null && snapshot.optBoolean("allKeysFailing")) {
                counts.append('\n').append(getString(R.string.status_keys_failing));
            }
            live.setText(counts.toString());
            if (openWhenReady && launchBrowser) openWhenReady = false;
        } else {
            status.setText(starting ? getString(R.string.starting_gateway)
                : getString(R.string.status_stopped));
            apiUrl.setText(R.string.api_offline);
            lanUrl.setText(R.string.lan_offline);
            live.setText(R.string.status_offline);
            if (!error.isEmpty()) {
                hint.setText(getString(R.string.start_error, error));
                hint.setVisibility(View.VISIBLE);
            } else {
                hint.setVisibility(View.GONE);
            }
        }
        refreshCodes();
        if (launchBrowser && online) launchDashboard(fresh.optInt("port"));
        if (openWhenReady && online) {
            openWhenReady = false;
            launchDashboard(fresh.optInt("port"));
        }
        ui.removeCallbacks(pollRefresh);
        ui.postDelayed(pollRefresh, starting ? 600 : 1800);
    }

    private int lanCount(JSONObject fresh) {
        JSONArray lan = fresh == null ? null : fresh.optJSONArray("lan");
        return lan == null ? 0 : lan.length();
    }

    /** Codes stay hidden until the owner proves it is them (device credential). */
    private void confirmDevice() {
        android.app.KeyguardManager keyguard = getSystemService(android.app.KeyguardManager.class);
        if (keyguard != null && keyguard.isDeviceSecure()) {
            Intent confirm = keyguard.createConfirmDeviceCredentialIntent(
                getString(R.string.reveal_title), getString(R.string.reveal_body));
            if (confirm != null) {
                try {
                    startActivityForResult(confirm, REQ_CREDENTIAL);
                    return;
                } catch (ActivityNotFoundException ignored) {
                    // Fall through: nothing to unlock with on this device.
                }
            }
        }
        revealUntil = SystemClock.elapsedRealtime() + REVEAL_MS;
        refreshCodes();
    }

    private void refreshCodes() {
        boolean online = state != null;
        boolean revealed = online && revealUntil > SystemClock.elapsedRealtime();
        reveal.setEnabled(online);
        reveal.setText(revealed ? R.string.hide_code : R.string.show_code);
        if (!revealed) {
            codes.setText("");
            codes.setVisibility(View.GONE);
            return;
        }
        StringBuilder text = new StringBuilder();
        if (!state.isNull("setup")) text.append(getString(R.string.setup_code, state.optString("setup")));
        if (!state.isNull("reset")) {
            if (text.length() > 0) text.append('\n');
            text.append(getString(R.string.reset_code, state.optString("reset")));
        }
        if (text.length() == 0) {
            codes.setText(R.string.no_code);
        } else {
            codes.setText(text);
        }
        codes.setVisibility(View.VISIBLE);
    }

    private void openDashboard() {
        if (state == null) {
            openWhenReady = true;
            poll(false);
            return;
        }
        launchDashboard(state.optInt("port"));
    }

    private void launchDashboard(int port) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("http://127.0.0.1:" + port + "/")));
        } catch (ActivityNotFoundException missing) {
            toast("No browser installed. Install a current Android browser and try again.");
        }
    }

    private void requestBatteryExemption() {
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                Uri.parse("package:" + getPackageName()));
            startActivity(intent);
        } catch (ActivityNotFoundException unavailable) {
            try {
                startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
            } catch (ActivityNotFoundException ignored) {
                toast("This Android build has no battery-optimization settings.");
            }
        }
    }

    private void checkForUpdates() {
        toast("Checking for updates…");
        UpdateChecker.check(this, (ok, message, candidate) -> {
            if (!ok) {
                toast(message);
                return;
            }
            if (candidate == null) {
                new AlertDialog.Builder(this).setTitle(R.string.update_title).setMessage(message)
                    .setPositiveButton(android.R.string.ok, null).show();
                return;
            }
            new AlertDialog.Builder(this).setTitle(R.string.update_title)
                .setMessage(getString(R.string.update_prompt, candidate.version, candidate.assetName))
                .setPositiveButton(R.string.download_install, (dialog, which) -> {
                    toast("Downloading the update…");
                    UpdateChecker.downloadAndInstall(this, candidate, (done, note, ignored) -> toast(note));
                })
                .setNegativeButton(android.R.string.cancel, null).show();
        });
    }

    private void askPassphrase(boolean export) {
        if (export && Gateway.running(this)) {
            toast("Stop the gateway first so the database is consistent.");
            return;
        }
        if (!export && new File(dataDir(), "freeapi.db").isFile()) {
            toast("Restore only into a fresh install. Export your current data first.");
            return;
        }
        final EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        input.setHint(R.string.passphrase_hint);
        new AlertDialog.Builder(this)
            .setTitle(export ? R.string.export_backup : R.string.restore_backup)
            .setMessage(R.string.passphrase_explain)
            .setView(input)
            .setPositiveButton(android.R.string.ok, (dialog, which) -> {
                String value = input.getText().toString();
                if (value.length() < 8) {
                    toast("Use at least 8 characters for the passphrase.");
                    return;
                }
                pendingPassphrase = value.toCharArray();
                pickBackupFile(export);
            })
            .setNegativeButton(android.R.string.cancel, null)
            .show();
    }

    private void pickBackupFile(boolean export) {
        Intent intent;
        String stamp = new SimpleDateFormat("yyyyMMdd-HHmm", Locale.US).format(new Date());
        if (export) {
            intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                .setType("application/octet-stream")
                .putExtra(Intent.EXTRA_TITLE, "ossllmapi-backup-" + stamp + ".ossllmapi");
        } else {
            intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*");
        }
        try {
            startActivityForResult(intent, export ? REQ_EXPORT : REQ_RESTORE);
        } catch (ActivityNotFoundException missing) {
            toast("No file picker available on this device.");
            pendingPassphrase = null;
        }
    }

    private void exportDiagnostics() {
        String stamp = new SimpleDateFormat("yyyyMMdd-HHmm", Locale.US).format(new Date());
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
            .setType("application/zip")
            .putExtra(Intent.EXTRA_TITLE, "ossllmapi-diagnostics-" + stamp + ".zip");
        try {
            startActivityForResult(intent, REQ_DIAGNOSTICS);
        } catch (ActivityNotFoundException missing) {
            toast("No file picker available on this device.");
        }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == REQ_CREDENTIAL) {
            if (result == RESULT_OK) {
                revealUntil = SystemClock.elapsedRealtime() + REVEAL_MS;
                refreshCodes();
            }
            return;
        }
        if (result != RESULT_OK || data == null || data.getData() == null) {
            pendingPassphrase = null;
            return;
        }
        Uri uri = data.getData();
        char[] passphrase = pendingPassphrase;
        pendingPassphrase = null;
        if (request == REQ_EXPORT && passphrase != null) exportBackup(uri, passphrase);
        if (request == REQ_RESTORE && passphrase != null) restoreBackup(uri, passphrase);
        if (request == REQ_DIAGNOSTICS) writeDiagnostics(uri);
    }

    private void exportBackup(Uri uri, char[] passphrase) {
        io.execute(() -> {
            try {
                File data = dataDir();
                try (OutputStream raw = getContentResolver().openOutputStream(uri, "w")) {
                    if (raw == null) throw new IOException("Cannot open the destination file");
                    try (ZipOutputStream zip = new ZipOutputStream(BackupCrypto.seal(raw, passphrase))) {
                        addFile(zip, new File(data, "freeapi.db"), "freeapi.db", true);
                        addFile(zip, new File(data, "freeapi.db-wal"), "freeapi.db-wal", false);
                        addFile(zip, new File(data, "freeapi.db-shm"), "freeapi.db-shm", false);
                        String key = KeyVault.load(data);
                        zip.putNextEntry(new ZipEntry("encryption-key.hex"));
                        zip.write(key.getBytes(StandardCharsets.US_ASCII));
                        zip.closeEntry();
                        zip.putNextEntry(new ZipEntry("meta.json"));
                        String meta = "{\"app\":\"OSSLLMAPI\",\"package\":\"" + getPackageName()
                            + "\",\"version\":\"" + versionName() + "\"}";
                        zip.write(meta.getBytes(StandardCharsets.UTF_8));
                        zip.closeEntry();
                    }
                }
                toast("Encrypted backup written.");
            } catch (Exception error) {
                toast("Backup failed: " + describe(error));
            }
        });
    }

    private void restoreBackup(Uri uri, char[] passphrase) {
        io.execute(() -> {
            File temp = new File(getCacheDir(), "restore-" + System.nanoTime());
            try {
                File data = dataDir();
                if (new File(data, "freeapi.db").exists()) throw new IOException("Remove the current data first");
                if (!temp.mkdirs()) throw new IOException("No room to stage the backup");
                try (InputStream raw = getContentResolver().openInputStream(uri)) {
                    if (raw == null) throw new IOException("Cannot open the backup file");
                    try (java.util.zip.ZipInputStream zip = new java.util.zip.ZipInputStream(BackupCrypto.open(raw, passphrase))) {
                        ZipEntry entry;
                        while ((entry = zip.getNextEntry()) != null) {
                            String name = entry.getName();
                            if (!name.equals("freeapi.db") && !name.equals("freeapi.db-wal")
                                && !name.equals("freeapi.db-shm") && !name.equals("encryption-key.hex")) continue;
                            try (OutputStream out = new FileOutputStream(new File(temp, name))) {
                                byte[] buffer = new byte[64 * 1024];
                                int read;
                                while ((read = zip.read(buffer)) > 0) out.write(buffer, 0, read);
                            }
                        }
                    }
                }
                File restoredDb = new File(temp, "freeapi.db");
                File restoredKey = new File(temp, "encryption-key.hex");
                if (!restoredDb.isFile() || !restoredKey.isFile()) throw new IOException("the backup is incomplete");
                String hex = new String(Files.readAllBytes(restoredKey.toPath()), StandardCharsets.US_ASCII).trim();
                if (!hex.matches("[0-9a-fA-F]{64}")) throw new IOException("the backup key is invalid");
                Files.move(restoredDb.toPath(), new File(data, "freeapi.db").toPath());
                for (String suffix : new String[] {"-wal", "-shm"}) {
                    File extra = new File(temp, "freeapi.db" + suffix);
                    if (extra.isFile()) Files.move(extra.toPath(), new File(data, "freeapi.db" + suffix).toPath());
                }
                KeyVault.store(data, hex);
                io.execute(() -> { });
                toast("Restore finished. Start the gateway and sign in.");
            } catch (Exception error) {
                toast("Restore failed (wrong passphrase or damaged file).");
            } finally {
                deleteTree(temp);
            }
        });
    }

    private void writeDiagnostics(Uri uri) {
        io.execute(() -> {
            try (OutputStream raw = getContentResolver().openOutputStream(uri, "w")) {
                if (raw == null) throw new IOException("Cannot open the destination file");
                File logs = new File(getFilesDir(), "logs");
                try (ZipOutputStream zip = new ZipOutputStream(raw)) {
                    addFile(zip, new File(logs, "gateway.log"), "gateway.log", false);
                    addFile(zip, new File(logs, "gateway.log.1"), "gateway.log.1", false);
                    zip.putNextEntry(new ZipEntry("device.txt"));
                    String info = "app=" + getPackageName() + "\nversion=" + versionName()
                        + "\nabis=" + String.join(",", Build.SUPPORTED_ABIS) + "\nsdk=" + Build.VERSION.SDK_INT
                        + "\ndevice=" + Build.MANUFACTURER + " " + Build.MODEL
                        + "\nlowRam=" + getSystemService(android.app.ActivityManager.class).isLowRamDevice()
                        + "\nlastError=" + startupError() + "\n";
                    zip.write(info.getBytes(StandardCharsets.UTF_8));
                    zip.closeEntry();
                }
                toast("Diagnostics written. They contain no codes, keys or database.");
            } catch (Exception error) {
                toast("Could not write diagnostics: " + describe(error));
            }
        });
    }

    private static void addFile(ZipOutputStream zip, File file, String name, boolean required) throws IOException {
        if (!file.isFile()) {
            if (required) throw new IOException("missing " + name);
            return;
        }
        zip.putNextEntry(new ZipEntry(name));
        try (InputStream in = new FileInputStream(file)) {
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = in.read(buffer)) > 0) zip.write(buffer, 0, read);
        }
        zip.closeEntry();
    }

    private static void deleteTree(File file) {
        File[] children = file.listFiles();
        if (children != null) for (File child : children) deleteTree(child);
        file.delete();
    }

    private String startupError() {
        File file = new File(getFilesDir(), "startup-error.txt");
        if (!file.isFile()) return "";
        try {
            return new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8).trim();
        } catch (Exception unreadable) {
            return "";
        }
    }

    private static String describe(Exception error) {
        String message = error.getMessage();
        return message == null || message.isEmpty() ? error.getClass().getSimpleName() : message;
    }

    private File dataDir() {
        File data = new File(getFilesDir(), "data");
        if (!data.isDirectory()) data.mkdirs();
        return data;
    }

    private String versionName() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (PackageManager.NameNotFoundException missing) {
            return "";
        }
    }

    private void copy(String value, String message) {
        ClipboardManager clipboard = getSystemService(ClipboardManager.class);
        if (clipboard == null || value.isEmpty()) return;
        clipboard.setPrimaryClip(ClipData.newPlainText("OSSLLMAPI", value));
        toast(message);
    }

    private static String duration(long seconds) {
        if (seconds < 60) return seconds + "s";
        if (seconds < 3600) return (seconds / 60) + "m";
        return (seconds / 3600) + "h " + ((seconds % 3600) / 60) + "m";
    }

    /** SHA-256 of the certificate Android will check before installing an update. */
    private String fingerprint() {
        try {
            PackageInfo info = getPackageManager().getPackageInfo(getPackageName(),
                Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES);
            Signature[] signatures = Build.VERSION.SDK_INT >= 28
                ? (info.signingInfo == null ? null : info.signingInfo.getApkContentsSigners())
                : info.signatures;
            if (signatures == null || signatures.length == 0) return "unknown";
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(signatures[0].toByteArray());
            StringBuilder out = new StringBuilder(hash.length * 2);
            for (byte value : hash) out.append(String.format("%02x", value));
            return out.toString();
        } catch (Exception unreadable) {
            return "unknown";
        }
    }

    private void toast(String message) {
        ui.post(() -> Toast.makeText(this, message, Toast.LENGTH_LONG).show());
    }

    @Override protected void onResume() {
        super.onResume();
        visible = true;
        poll(false);
    }

    @Override protected void onPause() {
        visible = false;
        ui.removeCallbacks(pollRefresh);
        super.onPause();
    }

    @Override protected void onDestroy() {
        io.shutdownNow();
        super.onDestroy();
    }
}
