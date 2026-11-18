package io.github.zelvior.ossllmapi.mobile;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.res.AssetManager;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.Process;
import org.json.JSONObject;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;

/** The only process that loads Node. node::Start and process.exit are process-wide. */
public final class GatewayService extends Service {
    static final String STOP = "io.github.zelvior.ossllmapi.mobile.STOP";
    private static final String CHANNEL = "gateway";
    private static final int NOTIFICATION = 1;
    private static final int NOTIFICATION_ALERT = 2;
    private static final String CHANNEL_ALERTS = "alerts";

    private static native int runNode(String entry, String home, String temp, String key,
                                      boolean lan, boolean eco, int heapMb);

    private boolean launched;
    private boolean keysAlerted;
    private volatile boolean alive;
    private PowerManager.WakeLock startup;

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!launched) {
            launched = true;
            alive = true;
            NotificationManager manager = getSystemService(NotificationManager.class);
            NotificationChannel channel = new NotificationChannel(CHANNEL, getString(R.string.notification_channel),
                NotificationManager.IMPORTANCE_LOW);
            channel.setShowBadge(false);
            manager.createNotificationChannel(channel);
            startForeground(NOTIFICATION, notification(getString(R.string.notification_starting)));
            acquireWakeLock();
            final boolean lan = Prefs.get(this, Prefs.LAN);
            final boolean eco = Prefs.get(this, Prefs.ECO);
            final int heapMb = heapMegabytes();
            new Thread(() -> watch(), "ossllmapi-status").start();
            new Thread(null, () -> {
                try {
                    File data = new File(getFilesDir(), "data");
                    if (!data.isDirectory() && !data.mkdirs()) throw new IOException("data directory");
                    String key = KeyVault.load(data);
                    clearError();
                    File entry = installGateway();
                    System.loadLibrary("gateway");
                    runNode(entry.getAbsolutePath(), getFilesDir().getAbsolutePath(),
                        getCacheDir().getAbsolutePath(), key, lan, eco, heapMb);
                } catch (Throwable failure) {
                    recordError(describe(failure));
                    // No exception bodies/arguments in public logs: neither codes nor keys belong there.
                    android.util.Log.e("OSSLLMAPI", "Cannot start packaged runtime: " + failure.getClass().getSimpleName());
                } finally {
                    alive = false;
                    stopSelf();
                }
            }, "ossllmapi-node", 4L * 1024 * 1024).start();
        }
        return Prefs.get(this, Prefs.KEEP) ? START_STICKY : START_NOT_STICKY;
    }

    private void watch() {
        String last = "";
        while (alive) {
            JSONObject state = Gateway.state(this);
            String text = state == null ? getString(R.string.notification_starting)
                : getString(R.string.notification_running, state.optInt("port"));
            if (!text.equals(last)) {
                last = text;
                NotificationManager manager = getSystemService(NotificationManager.class);
                manager.notify(NOTIFICATION, notification(text));
                Widgets.refresh(this);
                GatewayTileService.requestRefresh(this);
            }
            alertIfKeysFailing(Gateway.status(this));
            if (state != null) releaseWakeLock();
            try {
                Thread.sleep(3000);
            } catch (InterruptedException stopped) {
                return;
            }
        }
    }

    /** One notification when every enabled provider key stops working, cleared on recovery. */
    private void alertIfKeysFailing(JSONObject status) {
        boolean failing = status != null && status.optBoolean("allKeysFailing");
        if (failing == keysAlerted) return;
        keysAlerted = failing;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (!failing) {
            manager.cancel(NOTIFICATION_ALERT);
            return;
        }
        NotificationChannel channel = new NotificationChannel(CHANNEL_ALERTS,
            getString(R.string.alert_channel), NotificationManager.IMPORTANCE_DEFAULT);
        manager.createNotificationChannel(channel);
        manager.notify(NOTIFICATION_ALERT, new Notification.Builder(this, CHANNEL_ALERTS)
            .setSmallIcon(R.drawable.router_icon)
            .setContentTitle(getString(R.string.notification_title))
            .setContentText(getString(R.string.alert_keys_failing))
            .setContentIntent(PendingIntent.getActivity(this, 0,
                new Intent(this, MainActivity.class).setAction(Gateway.ACTION_OPEN),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT))
            .setAutoCancel(true)
            .build());
    }

    private Notification notification(String text) {
        int flags = PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT;
        PendingIntent open = PendingIntent.getActivity(this, 0,
            new Intent(this, MainActivity.class).setAction(Gateway.ACTION_OPEN), flags);
        PendingIntent stop = PendingIntent.getService(this, 1,
            new Intent(this, GatewayService.class).setAction(STOP), flags);
        return new Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.router_icon)
            .setContentTitle(getString(R.string.notification_title))
            .setContentText(text)
            .setContentIntent(open)
            .setOnlyAlertOnce(true)
            .setOngoing(true)
            .addAction(new Notification.Action.Builder(null, getString(R.string.open_dashboard), open).build())
            .addAction(new Notification.Action.Builder(null, getString(R.string.stop_gateway), stop).build())
            .build();
    }

    /** Small-RAM Go devices cannot afford a desktop-sized V8 heap. */
    private int heapMegabytes() {
        android.app.ActivityManager manager = getSystemService(android.app.ActivityManager.class);
        boolean lowRam = manager != null && manager.isLowRamDevice();
        int memoryClass = manager == null ? 128 : manager.getMemoryClass();
        if (lowRam) return 96;
        return Math.min(256, Math.max(128, memoryClass));
    }

    private void acquireWakeLock() {
        PowerManager power = getSystemService(PowerManager.class);
        if (power == null) return;
        startup = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "OSSLLMAPI:startup");
        startup.setReferenceCounted(false);
        startup.acquire(90_000);
    }

    private void releaseWakeLock() {
        if (startup != null && startup.isHeld()) startup.release();
    }

    private File installGateway() throws Exception {
        File root = new File(getFilesDir(), "runtime");
        if (!root.isDirectory() && !root.mkdirs()) throw new IOException("runtime directory");
        long update = getPackageManager().getPackageInfo(getPackageName(), 0).lastUpdateTime;
        File dest = new File(root, String.valueOf(update));
        if (!dest.isDirectory()) {
            // Clean ONLY replaceable application assets, never the sibling data directory.
            File[] old = root.listFiles();
            if (old == null) throw new IOException("list runtime");
            for (File file : old) removeTree(file);
            File stage = new File(root, "staging");
            copyAssets("gateway", stage);
            Files.move(stage.toPath(), dest.toPath(), StandardCopyOption.ATOMIC_MOVE);
        }
        return new File(dest, "gateway.mjs");
    }

    private void copyAssets(String name, File dest) throws IOException {
        AssetManager assets = getAssets();
        String[] children = assets.list(name);
        if (children == null) throw new IOException("missing asset");
        if (children.length == 0) {
            try (InputStream input = assets.open(name)) { Files.copy(input, dest.toPath()); }
        } else {
            Files.createDirectory(dest.toPath());
            for (String child : children) copyAssets(name + "/" + child, new File(dest, child));
        }
    }

    private static void removeTree(File file) throws IOException {
        File[] children = file.listFiles();
        if (children != null) for (File child : children) removeTree(child);
        Files.delete(file.toPath());
    }

    private void recordError(String message) {
        try {
            File file = new File(getFilesDir(), "startup-error.txt");
            try (java.io.FileOutputStream out = new java.io.FileOutputStream(file)) {
                out.write(message.getBytes(StandardCharsets.UTF_8));
            }
        } catch (IOException ignored) {
            // The launcher falls back to its generic message.
        }
    }

    private void clearError() {
        new File(getFilesDir(), "startup-error.txt").delete();
    }

    private static String describe(Throwable failure) {
        if (failure instanceof LinkageError) return "The packaged Node runtime could not load on this device.";
        if (failure instanceof UnsatisfiedLinkError) return "The packaged Node runtime could not load on this device.";
        String message = failure.getMessage();
        if (message == null || message.isEmpty()) return failure.getClass().getSimpleName();
        if (message.contains("Keystore") || message.contains("Encryption key") || message.contains("key")) {
            return "The app's data key is unavailable. Restore a backup, or clear app data (this deletes the database).";
        }
        return message.length() > 240 ? message.substring(0, 240) : message;
    }

    @Override public void onDestroy() {
        alive = false;
        releaseWakeLock();
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
        Widgets.refresh(this);
        GatewayTileService.requestRefresh(this);
        // Runs only in :gateway. Node's normal SIGTERM handler drains HTTP and closes SQLite.
        new Handler(Looper.getMainLooper()).postDelayed(() -> Process.killProcess(Process.myPid()), 10000);
        Process.sendSignal(Process.myPid(), 15);
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
